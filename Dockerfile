# syntax=docker/dockerfile:1.7
FROM node:24.21.0-bookworm-slim AS dependencies

ENV CI=true
WORKDIR /app
RUN apt-get update && apt-get install --yes --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.15.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY apps/web apps/web
COPY packages/shared packages/shared

FROM dependencies AS api-build
ENV DATABASE_URL=postgresql://build_placeholder:build_placeholder@localhost:5432/unused
RUN pnpm --filter api exec prisma generate && pnpm --filter api build \
    && pnpm --filter api deploy --legacy --prod /out/api \
    && cp -R apps/api/dist /out/api/dist \
    && (cd /out/api && /app/apps/api/node_modules/.bin/prisma generate --schema prisma/schema.prisma)

FROM dependencies AS web-build
RUN pnpm --filter web build \
    && pnpm --filter web deploy --legacy --prod /out/web \
    && (cd apps/web && tar --exclude=.next/standalone --exclude=.next/cache -cf - .next | tar -xf - -C /out/web)

FROM node:24.21.0-bookworm-slim AS api
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app
RUN apt-get update && apt-get install --yes --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node --from=api-build /out/api /app
EXPOSE 3001
USER node
CMD ["node", "dist/main.js"]

FROM node:24.21.0-bookworm-slim AS web
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --chown=node:node --from=web-build /out/web /app
ENV WEB_HOST=0.0.0.0
EXPOSE 3000
USER node
CMD ["node", "server.mjs"]

# Operator-only migration image. Never receives database secrets at build time.
FROM api-build AS migration
WORKDIR /app/apps/api
CMD ["/app/apps/api/node_modules/.bin/prisma", "migrate", "deploy"]

# Render does not expose Docker --target in Blueprint. Final target shares the
# existing builds, runs exactly one service role, and never requires a registry.
FROM node:24.21.0-bookworm-slim AS render
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=10000
WORKDIR /app
RUN apt-get update && apt-get install --yes --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node --from=api-build /out/api /app/api
COPY --chown=node:node --from=web-build /out/web /app/web
COPY --chown=node:node deploy/render-start.mjs /app/render-start.mjs
ENV WEB_HOST=0.0.0.0
EXPOSE 10000
USER node
CMD ["node", "render-start.mjs"]
