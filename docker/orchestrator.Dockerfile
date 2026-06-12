# docker/orchestrator.Dockerfile
FROM oven/bun:alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bunfig.toml bun.lock ./
COPY packages/config-schema/package.json ./packages/config-schema/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/mcp-registry/package.json ./packages/mcp-registry/
COPY apps/builder-api/package.json ./apps/builder-api/
COPY apps/builder-ui/package.json ./apps/builder-ui/
COPY apps/orchestrator/package.json ./apps/orchestrator/
COPY apps/llm-gateway/package.json ./apps/llm-gateway/
COPY apps/frontend/package.json ./apps/frontend/
RUN bun install

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
