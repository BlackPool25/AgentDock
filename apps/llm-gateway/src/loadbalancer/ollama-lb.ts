import { logger } from "../logger.js";

export class OllamaLoadBalancer {
  private servers: string[];
  private healthy = new Set<string>();
  private inFlight = new Map<string, number>();
  private rrIndex = 0;

  constructor(servers: string[]) {
    this.servers = servers;
    for (const s of servers) {
      this.healthy.add(s);
      this.inFlight.set(s, 0);
    }
    if (servers.length > 0) this.startHealthChecks();
  }

  pick(): string | null {
    const available = [...this.healthy];
    if (available.length === 0) return null;
    // Least-busy strategy
    return available.reduce((a, b) =>
      (this.inFlight.get(a) ?? 0) <= (this.inFlight.get(b) ?? 0) ? a : b
    );
  }

  incrementInFlight(server: string): void {
    this.inFlight.set(server, (this.inFlight.get(server) ?? 0) + 1);
  }

  decrementInFlight(server: string): void {
    this.inFlight.set(server, Math.max(0, (this.inFlight.get(server) ?? 1) - 1));
  }

  addServer(url: string): void {
    if (!this.servers.includes(url)) {
      this.servers.push(url);
      this.inFlight.set(url, 0);
      this.healthy.add(url);
    }
  }

  getStatus(): Array<{ url: string; healthy: boolean; inFlight: number }> {
    return this.servers.map((s) => ({
      url: s,
      healthy: this.healthy.has(s),
      inFlight: this.inFlight.get(s) ?? 0,
    }));
  }

  private startHealthChecks(): void {
    setInterval(async () => {
      for (const server of this.servers) {
        try {
          const res = await fetch(`${server}/api/tags`, { signal: AbortSignal.timeout(5000) });
          if (res.ok) {
            this.healthy.add(server);
          } else {
            this.healthy.delete(server);
          }
        } catch {
          this.healthy.delete(server);
          logger.warn({ server }, "Ollama server unhealthy");
        }
      }
    }, 30_000);
  }
}
