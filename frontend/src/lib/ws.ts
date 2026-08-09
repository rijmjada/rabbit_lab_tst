import { Client, type StompSubscription } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import type { MessageEventDto } from "../types";
import { WS_BASE_URL } from "./api";

export type ScenarioEventHandler = (event: MessageEventDto) => void;

/**
 * Maneja una única conexión STOMP compartida para toda la app y
 * permite suscribirse/desuscribirse al topic de un escenario en
 * particular. Se reutiliza la conexión para no reabrir un socket por
 * cada pantalla.
 */
class ScenarioSocket {
  private client: Client | null = null;
  private subscriptions = new Map<string, StompSubscription>();
  private pendingHandlers = new Map<string, Set<ScenarioEventHandler>>();

  private ensureClient(): Client {
    if (this.client) return this.client;

    const client = new Client({
      webSocketFactory: () => new SockJS(`${WS_BASE_URL}/ws`),
      reconnectDelay: 3000,
      onConnect: () => {
        for (const scenarioId of this.pendingHandlers.keys()) {
          this.subscribe(scenarioId);
        }
      },
    });
    client.activate();
    this.client = client;
    return client;
  }

  private subscribe(scenarioId: string) {
    if (!this.client || !this.client.connected) return;
    if (this.subscriptions.has(scenarioId)) return;

    const subscription = this.client.subscribe(`/topic/scenarios/${scenarioId}/events`, (message) => {
      const handlers = this.pendingHandlers.get(scenarioId);
      if (!handlers) return;
      try {
        const event = JSON.parse(message.body) as MessageEventDto;
        handlers.forEach((handler) => handler(event));
      } catch (e) {
        console.error("No se pudo parsear un evento de escenario", e);
      }
    });
    this.subscriptions.set(scenarioId, subscription);
  }

  listen(scenarioId: string, handler: ScenarioEventHandler): () => void {
    const client = this.ensureClient();
    if (!this.pendingHandlers.has(scenarioId)) {
      this.pendingHandlers.set(scenarioId, new Set());
    }
    this.pendingHandlers.get(scenarioId)!.add(handler);

    if (client.connected) {
      this.subscribe(scenarioId);
    }

    return () => {
      const handlers = this.pendingHandlers.get(scenarioId);
      if (!handlers) return;
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.pendingHandlers.delete(scenarioId);
        this.subscriptions.get(scenarioId)?.unsubscribe();
        this.subscriptions.delete(scenarioId);
      }
    };
  }
}

export const scenarioSocket = new ScenarioSocket();
