# docker/orchestrator.Dockerfile
FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bunfig.toml ./
COPY packages/config-schema/package.json ./packages/config-schema/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/orchestrator/package.json ./apps/orchestrator/
RUN bun install --frozen-lockfile

# Dev stage (hot reload)
FROM deps AS dev
COPY packages ./packages
COPY apps/orchestrator ./apps/orchestrator
WORKDIR /app/apps/orchestrator
CMD ["bun", "run", "--hot", "src/index.ts"]

# Production stage
FROM deps AS prod
COPY packages ./packages
COPY apps/orchestrator ./apps/orchestrator
WORKDIR /app/apps/orchestrator
CMD ["bun", "run", "src/index.ts"]
