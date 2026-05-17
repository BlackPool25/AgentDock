import { z } from "zod";

const envSchema = z.object({
  SYSTEM_ID: z.string().default("agentdock-dev"),
  JWT_SECRET: z.string().min(32),
  REDIS_URL: z.string().default("redis://redis:6379"),
  LLM_GATEWAY_URL: z.string().default("http://llm-gateway:5000"),
  ORCHESTRATOR_PORT: z.coerce.number().default(4000),
  ADMIN_EMAIL: z.string().email().default("admin@agentdock.local"),
  ADMIN_PASSWORD: z.string().min(8).default("changeme"),
  DOCKER_SOCKET: z.string().default("/var/run/docker.sock"),
  CONFIGS_DIR: z.string().default("/app/configs"),
  DATA_DIR: z.string().default("/app/data"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten());
  process.exit(1);
}

export const env = parsed.data;
