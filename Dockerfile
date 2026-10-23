FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY --chown=node:node server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node server/ ./
COPY --chown=node:node client/ /app/client/
COPY --chown=node:node ops/ /app/ops/
RUN mkdir -p uploads .backups .backup-tmp .local-mail && chown -R node:node uploads .backups .backup-tmp .local-mail
USER node
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 CMD node -e 'fetch("http://127.0.0.1:5000/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'
CMD ["node", "server.js"]
