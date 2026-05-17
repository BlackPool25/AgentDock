import Dockerode from "dockerode";
import { env } from "../config/env.js";
import { logger } from "../logger.js";

export const docker = new Dockerode({ socketPath: env.DOCKER_SOCKET });

export async function verifyDockerConnection(): Promise<void> {
  const info = await docker.version();
  logger.info({ dockerVersion: info.Version }, "Docker connection verified");
}
