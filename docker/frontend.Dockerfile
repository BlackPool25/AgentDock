# docker/frontend.Dockerfile
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

# Dev stage
FROM deps AS dev
COPY packages ./packages
COPY apps/frontend ./apps/frontend
WORKDIR /app/apps/frontend
EXPOSE 3000
CMD ["bun", "run", "dev", "--host"]

# Build stage
FROM deps AS build
COPY packages ./packages
COPY apps/frontend ./apps/frontend
WORKDIR /app/apps/frontend
RUN bun run build

# Prod stage (Nginx)
FROM nginx:alpine AS prod
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
