# NORDA run and update commands

## Fresh checkout

From the extracted `Norda-Main` directory:

```bash
cd server
npm ci
npm run setup
```

Open `.env` in an editor. Set `MONGO_URI`, and note `ADMIN_EMAIL`/`ADMIN_PASSWORD` for your private administrator login. Start MongoDB, then:

```bash
npm run seed
npm run verify
npm run dev
```

Website: **http://localhost:5000**. Stop the API with Ctrl+C. For a normal Node process, use `npm start` instead of `npm run dev`.

Never set NORDA to port 3000 or 3002. Startup rejects these reserved GitStack/Gitea ports. No GitStack container or PostgreSQL configuration is changed by this project.

## Apply to an existing GitHub checkout

Stop the old NORDA API. Keep a copy of your current `.env` and uploaded images. Substitute your actual extracted-folder and existing-repository paths:

```bash
cd /path/to/your/existing/Norda-repository
git status
git switch -c improve/norda-ui-reliability
rsync -av --exclude='.git/' --exclude='.env' --exclude='.envy' --exclude='node_modules/' --exclude='uploads/' /path/to/extracted/Norda-Main/ ./
git rm --ignore-unmatch server/.envy
cd server
npm ci
npm run setup
npm run verify
npm run dev
```

The copy command preserves your existing Git history, environment and upload folder. It intentionally does not use `--delete`. The explicit `git rm` removes the legacy tracked credential file from the next commit. Rotate any old JWT/admin credentials that were previously used or shared; source removal cannot erase old GitHub commits.

For an existing installation, keep `MONGO_URI` pointing at the original NORDA database. Run `npm run seed` only when you want missing sample categories/brands and sample images filled in; it does not reset your database.

After review:

```bash
cd /path/to/your/existing/Norda-repository
git status
git add .
git commit -m "feat: polish Norda UI and harden commerce flows"
git push -u origin improve/norda-ui-reliability
```

Open a pull request into `main`. Confirm `.env`, runtime uploads and `node_modules` are excluded from the staged changes.

## Optional real database check

```bash
cd server
NORDA_TEST_MONGO_URI='mongodb://127.0.0.1:27017' npm run test:integration
```

The test uses a new random `norda_test_*` database, then removes that test database. Use an isolated MongoDB server. Test once against standalone MongoDB and once against a replica set to exercise both write paths.
