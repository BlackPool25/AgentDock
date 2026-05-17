FROM oven/bun:1.1-alpine AS builder
WORKDIR /app

COPY package.json bun.lockb* ./
COPY packages/config-schema/package.json ./packages/config-schema/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/builder-ui/package.json ./apps/builder-ui/
RUN bun install --frozen-lockfile

COPY packages/ ./packages/
COPY apps/builder-ui/ ./apps/builder-ui/

WORKDIR /app/apps/builder-ui
RUN bun run build

FROM nginx:alpine
COPY --from=builder /app/apps/builder-ui/dist /usr/share/nginx/html
COPY apps/builder-ui/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
