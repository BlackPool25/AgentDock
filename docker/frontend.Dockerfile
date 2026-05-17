# docker/frontend.Dockerfile
FROM oven/bun:1.1-alpine AS base
WORKDIR /app

FROM base AS deps
COPY apps/frontend/package.json ./
RUN bun install --frozen-lockfile

FROM deps AS dev
COPY apps/frontend ./
EXPOSE 3000
CMD ["bun", "run", "dev", "--host"]

FROM deps AS build
COPY apps/frontend ./
RUN bun run build

FROM nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
