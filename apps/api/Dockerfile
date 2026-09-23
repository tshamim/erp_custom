# Build context is the repository root (pnpm workspace).
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
# Manifests first so dependency installs stay cached across source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @erp/shared --filter @erp/db --filter @erp/api
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @erp/shared build \
  && pnpm --filter @erp/db build \
  && pnpm --filter @erp/api build \
  && pnpm prune --prod

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app /app
USER node
EXPOSE 4100
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4100)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
