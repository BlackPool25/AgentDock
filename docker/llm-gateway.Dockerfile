# docker/llm-gateway.Dockerfile
FROM oven/bun:1.1-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bunfig.toml ./
COPY packages/config-schema/package.json ./packages/config-schema/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/llm-gateway/package.json ./apps/llm-gateway/
RUN bun install --frozen-lockfile

FROM deps AS dev
COPY packages ./packages
COPY apps/llm-gateway ./apps/llm-gateway
WORKDIR /app/apps/llm-gateway
CMD ["bun", "run", "--hot", "src/index.ts"]

FROM deps AS prod
COPY packages ./packages
COPY apps/llm-gateway ./apps/llm-gateway
WORKDIR /app/apps/llm-gateway
CMD ["bun", "run", "src/index.ts"]
