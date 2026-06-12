FROM oven/bun:latest AS base
WORKDIR /app

# Copy manifests for all workspace packages
COPY package.json bun.lock* ./
COPY packages/config-schema/package.json ./packages/config-schema/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/mcp-registry/package.json ./packages/mcp-registry/
COPY apps/builder-api/package.json ./apps/builder-api/
COPY apps/builder-ui/package.json ./apps/builder-ui/
COPY apps/runtime-console/package.json ./apps/runtime-console/

RUN bun install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/builder-api/ ./apps/builder-api/
COPY apps/orchestrator/ ./apps/orchestrator/
COPY apps/llm-gateway/ ./apps/llm-gateway/
COPY apps/agent-runtime/ ./apps/agent-runtime/
COPY apps/runtime-console/ ./apps/runtime-console/

WORKDIR /app/apps/builder-api

ENV NODE_ENV=production
EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
