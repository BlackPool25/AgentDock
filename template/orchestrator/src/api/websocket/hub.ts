type WsClient = { send: (data: string) => void; readyState: number };

class WsHub {
  private clients = new Map<string, WsClient>();

  add(id: string, ws: WsClient) { this.clients.set(id, ws); }
  remove(id: string) { this.clients.delete(id); }

  broadcast(event: unknown) {
    const msg = JSON.stringify(event);
    for (const [id, ws] of this.clients) {
      if (ws.readyState === 1) {
        ws.send(msg);
      } else {
        this.clients.delete(id);
      }
    }
  }
}

export const wsHub = new WsHub();
