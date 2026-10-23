#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
environment="${1:-}"
requested="${2:-}"
case "$environment" in staging|production) ;; *) echo 'Choose staging or production.' >&2; exit 2;; esac
base="${NORDA_DEPLOY_ROOT:-/opt/norda}"
[[ "$base" = /* && "$base" != / && ! -L "$base" ]] || { echo 'Use a real absolute NORDA deployment root.' >&2; exit 2; }
root="$base/$environment"
shared="$root/shared"
mkdir -p "$root"
exec 9>"$root/.release.lock"
flock -n 9 || { echo 'Another NORDA release is running.' >&2; exit 1; }
for file in .env .env.integrations deploy.env; do
  [[ -f "$shared/$file" && ! -L "$shared/$file" ]] || { echo 'Create private shared environment files before deployment.' >&2; exit 2; }
done
if [[ "$requested" = --rollback ]]; then
  [[ -f "$root/previous" ]] || { echo 'No recorded previous release.' >&2; exit 2; }
  requested="$(cat "$root/previous")"
fi
[[ "$requested" =~ ^[a-f0-9]{40}$ ]] || { echo 'Release identifier must be a full Git commit SHA.' >&2; exit 2; }
export NORDA_SHARED_DIRECTORY="$shared" NORDA_ENVIRONMENT="$environment"
old=""
if [[ -f "$root/current" ]]; then old="$(cat "$root/current")"; [[ "$old" =~ ^[a-f0-9]{40}$ ]] || exit 2; fi
release="$root/releases/$requested"
[[ -d "$release" && ! -L "$release" && -f "$release/Dockerfile" && -f "$release/deploy/compose.yml" ]] || { echo 'Validated release source is missing.' >&2; exit 2; }
for folder in uploads backups backup-tmp mail-preview; do
  [[ -d "$shared/$folder" && ! -L "$shared/$folder" ]] || { echo 'Prepare persistent data folders owned by container uid 1000 before deployment.' >&2; exit 2; }
done
compose() { local sha="$1"; shift; NORDA_RELEASE_SHA="$sha" NORDA_IMAGE_REF="norda-$environment:$sha" docker compose -p "norda-$environment" --env-file "$shared/deploy.env" -f "$root/releases/$sha/deploy/compose.yml" "$@"; }
# Do not interrupt an in-progress consistent backup on an existing release.
if [[ -n "$old" ]]; then compose "$old" exec -T app node -e 'fetch("http://127.0.0.1:5000/api/health/ready").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' || { echo 'Existing store is not ready; deployment deferred.' >&2; exit 1; }; fi
if ! docker image inspect "norda-$environment:$requested" >/dev/null 2>&1; then docker build --pull -t "norda-$environment:$requested" -f "$release/Dockerfile" "$release"; fi
compose "$requested" run --rm --no-deps app node ../ops/deploy-preflight.js "$environment"
apply_release() {
  local sha="$1"
  compose "$sha" up -d --no-build --wait --wait-timeout 120 || return 1
  compose "$sha" exec -T app node -e 'fetch("http://127.0.0.1:5000/api/health/ready").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' || return 1
  compose "$sha" exec -T app node -e '(async()=>{for(let n=0;n<12;n++){try{const r=await fetch(process.env.CLIENT_APP_URL+"/api/health/ready",{signal:AbortSignal.timeout(8000),redirect:"error"});if(r.ok&&(await r.json()).status==="ready")process.exit(0);}catch{}if(n<11)await new Promise(resolve=>setTimeout(resolve,5000));}process.exit(1);})().catch(()=>process.exit(1))'
}
if ! apply_release "$requested"; then
  echo 'Release health failed.' >&2
  if [[ -n "$old" ]] && apply_release "$old"; then echo 'Previous application release restored; database and media retained.' >&2; else echo 'Automatic rollback unavailable/failed; operational attention required.' >&2; fi
  exit 1
fi
if [[ -n "$old" && "$old" != "$requested" ]]; then printf '%s\n' "$old" > "$root/previous.tmp"; mv "$root/previous.tmp" "$root/previous"; fi
printf '%s\n' "$requested" > "$root/current.tmp"
mv "$root/current.tmp" "$root/current"
echo 'NORDA release is healthy. Shared credentials, database and media retained.'
