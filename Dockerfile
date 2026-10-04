# open-mt2 — container image.
#
# The project is pure TypeScript with no native addons, so the same image works
# on amd64 and arm64 (`docker buildx build --platform linux/arm64`). No
# architecture-specific step exists or is needed.
FROM node:22-bookworm-slim AS builder
WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig*.json ./
COPY . .

# --ignore-scripts skips husky; no dependency needs an install script.
RUN npm ci --ignore-scripts --no-audit --no-fund
# tsc + tsc-alias, the runtime asset copy (map grids, spawn tables, schema
# script) and the dist completeness check.
RUN npm run build
RUN npm run verify:dist
# Staged separately so the runtime image carries no devDependency.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-bookworm-slim AS runner
WORKDIR /opt/open-mt2

ENV NODE_ENV=production \
    LOG_LEVEL=info \
    LOG_DIR=/opt/open-mt2/logs \
    AUTH_SERVER_ADDRESS=0.0.0.0 \
    GAME_SERVER_ADDRESS=0.0.0.0 \
    DB_HOST=mariadb \
    DB_PORT=3306 \
    DB_USER=openmt2 \
    CACHE_HOST=redis \
    CACHE_PORT=6379

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json

# Owned by the unprivileged account the servers run as.
RUN mkdir -p /opt/open-mt2/logs && chown -R node:node /opt/open-mt2
USER node

EXPOSE 11002 13001

# The servers resolve their assets from dist/, never from the working directory,
# so both can be started with a plain `node <file>` — no tsconfig-paths, which is
# a devDependency and is not present in this image.
CMD ["node", "dist/auth/main.js"]