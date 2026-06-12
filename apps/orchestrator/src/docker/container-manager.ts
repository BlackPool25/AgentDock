import { docker } from "./client.js";
import { networkName } from "./network-manager.js";
import { env } from "../config/env.js";
import { logger } from "../logger.js";

export function containerName(systemId: string, agentId: string): string {
  return `agentdock-${systemId}-${agentId}`;
}

export async function spawnAgent(
  agentConfig: any,
  systemId: string,
  peerAgents: Array<{ id: string; url: string }> = []
): Promise<string> {
  const name = containerName(systemId, agentConfig.agent.id);
  const network = networkName(systemId);
  const llmGatewayUrl = `http://agentdock-${systemId}-llm-gateway:5000`;
  const redisUrl = `redis://agentdock-${systemId}-redis:6379`;
  const orchestratorUrl = `http://agentdock-${systemId}-orchestrator:4000`;

  // Pull image if needed
  try {
    await docker.getImage(agentConfig.runtime.base_image).inspect();
  } catch {
    logger.info({ image: agentConfig.runtime.base_image }, "Pulling agent base image");
    await new Promise<void>((resolve, reject) => {
      docker.pull(agentConfig.runtime.base_image, (err: unknown, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err: unknown) => err ? reject(err) : resolve());
      });
    });
  }

  const container = await docker.createContainer({
    name,
    Image: agentConfig.runtime.base_image,
    Env: [
      `AGENT_ID=${agentConfig.agent.id}`,
      `SYSTEM_ID=${systemId}`,
      `LLM_GATEWAY_URL=${llmGatewayUrl}`,
      `REDIS_URL=${redisUrl}`,
      `ORCHESTRATOR_URL=${orchestratorUrl}`,
      `PEER_AGENTS=${JSON.stringify(peerAgents)}`,
    ],
    HostConfig: {
      NetworkMode: network,
      Binds: [
        `agentdock-memory-${agentConfig.agent.id}:/memory`,
        `${env.CONFIGS_DIR}/agents/${agentConfig.agent.id}.yaml:/app/config/agent.yaml:ro`,
      ],
      // No port bindings — agents are internal only
    },
    Labels: {
      "agentdock.system": systemId,
      "agentdock.agent": agentConfig.agent.id,
    },
  });

  await container.start();
  logger.info({ name, agentId: agentConfig.agent.id }, "Agent container started");

  // Wait for health check
  await waitForHealth(name, 30);
  return container.id;
}

async function waitForHealth(containerName: string, maxSeconds: number): Promise<void> {
  const deadline = Date.now() + maxSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${containerName}:8080/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  logger.warn({ containerName }, "Agent health check timed out — continuing anyway");
}

export async function stopAgent(systemId: string, agentId: string): Promise<void> {
  const name = containerName(systemId, agentId);
  try {
    const container = docker.getContainer(name);
    await container.stop({ t: 10 });
    await container.remove();
    logger.info({ name }, "Agent container stopped and removed");
  } catch (err) {
    logger.warn({ name, err }, "Failed to stop agent container");
  }
}

export async function listSystemContainers(systemId: string): Promise<Dockerode.ContainerInfo[]> {
  return docker.listContainers({
    all: true,
    filters: { label: [`agentdock.system=${systemId}`] },
  });
}
