import type { WSContext } from 'hono/ws';
import { WsMessageSchema, type WsMessage } from '../shared/types.js';

/**
 * Lightweight in-memory WebSocket Hub for instant DM-to-Player and Player-to-DM synchronization.
 */
class WebSocketHub {
  private readonly clients = new Set<WSContext>();
  private readonly subscriptions = new Map<WSContext, Set<string>>();

  public addClient(ws: WSContext): void {
    this.clients.add(ws);
    this.subscriptions.set(ws, new Set());
  }

  public removeClient(ws: WSContext): void {
    this.clients.delete(ws);
    this.subscriptions.delete(ws);
  }

  public subscribeToCharacter(ws: WSContext, characterId: string): void {
    let subs = this.subscriptions.get(ws);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(ws, subs);
    }
    subs.add(characterId);
  }

  public broadcast(message: WsMessage, exclude?: WSContext): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client !== exclude) {
        try {
          client.send(payload);
        } catch {
          this.removeClient(client);
        }
      }
    }
  }

  public broadcastToCharacter(
    characterId: string,
    message: WsMessage,
    exclude?: WSContext
  ): void {
    const payload = JSON.stringify(message);
    for (const [client, subs] of this.subscriptions.entries()) {
      if (client !== exclude && (subs.has(characterId) || subs.size === 0)) {
        try {
          client.send(payload);
        } catch {
          this.removeClient(client);
        }
      }
    }
  }

  public handleIncomingRawMessage(ws: WSContext, rawData: string): void {
    try {
      const parsed = JSON.parse(rawData) as unknown;
      const result = WsMessageSchema.safeParse(parsed);
      if (!result.success) {
        return;
      }

      const msg = result.data;
      switch (msg.type) {
        case 'character:subscribe':
          this.subscribeToCharacter(ws, msg.characterId);
          break;
        case 'character:update':
          this.broadcastToCharacter(msg.characterId, msg, ws);
          break;
        case 'dice:roll':
          this.broadcast(msg, ws);
          break;
      }
    } catch {
      // Ignore malformed JSON frames
    }
  }

  public getConnectedCount(): number {
    return this.clients.size;
  }
}

export const wsHub = new WebSocketHub();
