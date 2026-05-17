import { docker } from "./client.js";
import { logger } from "../logger.js";

export function networkName(systemId: string): string {
  return `agentdock-${systemId}`;
}

export async function ensureNetwork(systemId: string): Promise<string> {
  const name = networkName(systemId);
  const networks = await docker.listNetworks({ filters: { name: [name] } });
  if (networks.length > 0) return name;

  await docker.createNetwork({ Name: name, Driver: "bridge" });
  logger.info({ network: name }, "Docker network created");
  return name;
}

export async function removeNetwork(systemId: string): Promise<void> {
  const name = networkName(systemId);
  try {
    const network = docker.getNetwork(name);
    await network.remove();
    logger.info({ network: name }, "Docker network removed");
  } catch (err) {
    logger.warn({ network: name, err }, "Failed to remove network");
  }
}
