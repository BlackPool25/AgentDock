import type { AgentEvent } from "@agentdock/shared-types";
import { logger } from "../logger.js";

type WSClient = { send: (data: string) => void; readyState: number };

class WebSocketHub {
  private clients = new Map<string, WSClient>();

  add(id: string, ws: WSClient): void {
    this.clients.set(id, ws);
    logger.info({ clientId: id, total: this.clients.size }, "WS client connected");
  }

  remove(id: string): void {
    this.clients.delete(id);
    logger.info({ clientId: id, total: this.clients.size }, "WS client disconnected");
  }

  broadcast(event: AgentEvent): void {
    const payload = JSON.stringify(event);
    for (const [id, ws] of this.clients) {
      if (ws.readyState === 1) {
        ws.send(payload);
      } else {
        this.clients.delete(id);
      }
    }
  }

  size(): number {
    return this.clients.size;
  }
}

export const wsHub = new WebSocketHub();
