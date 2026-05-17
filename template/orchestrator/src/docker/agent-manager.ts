import Docker from "dockerode";
import { logger } from "../logger.js";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export async function restartAgent(agentId: string): Promise<void> {
  const containers = await docker.listContainers({ all: true });
  // Container name matches agent ID (Docker Compose uses service name as container name prefix)
  const match = containers.find((c) =>
    c.Names.some((n) => n.includes(agentId))
  );
  if (!match) {
    throw new Error(`Container for agent '${agentId}' not found`);
  }
  const container = docker.getContainer(match.Id);
  await container.restart({ t: 10 });
  logger.info({ agentId, containerId: match.Id }, "Agent container restarted");
}

export async function getAgentStatus(agentId: string): Promise<"running" | "stopped" | "error"> {
  try {
    const containers = await docker.listContainers({ all: true });
    const match = containers.find((c) => c.Names.some((n) => n.includes(agentId)));
    if (!match) return "stopped";
    if (match.State === "running") return "running";
    if (match.State === "exited" || match.State === "dead") return "error";
    return "stopped";
  } catch {
    return "error";
  }
}
