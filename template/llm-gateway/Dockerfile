FROM oven/bun:1.1-alpine
WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install

COPY src/ ./src/

ENV NODE_ENV=production
EXPOSE 5000

CMD ["bun", "run", "src/index.ts"]
