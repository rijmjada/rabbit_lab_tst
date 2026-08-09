import type {
  ExchangeType,
  MessageRecord,
  PublishMessageRequest,
  PublishMessageResponse,
  QueueConfig,
  Scenario,
} from "../types";
import { getSessionId } from "./session";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // sin cuerpo JSON, se usa el mensaje genérico
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  createScenario(type: ExchangeType): Promise<Scenario> {
    return request<Scenario>(`/api/scenarios/${type}`, {
      method: "POST",
      body: JSON.stringify({ sessionId: getSessionId() }),
    });
  },

  getScenario(id: string): Promise<Scenario> {
    return request<Scenario>(`/api/scenarios/${id}`);
  },

  resetScenario(id: string): Promise<Scenario> {
    return request<Scenario>(`/api/scenarios/${id}/reset`, { method: "POST" });
  },

  deleteScenario(id: string): Promise<void> {
    return request<void>(`/api/scenarios/${id}`, { method: "DELETE" });
  },

  updateBindings(id: string, queues: QueueConfig[], bridgeBindingKey?: string): Promise<Scenario> {
    return request<Scenario>(`/api/scenarios/${id}/bindings`, {
      method: "PUT",
      body: JSON.stringify({ queues, bridgeBindingKey }),
    });
  },

  publishMessage(scenarioId: string, message: PublishMessageRequest): Promise<PublishMessageResponse> {
    return request<PublishMessageResponse>(`/api/scenarios/${scenarioId}/messages`, {
      method: "POST",
      body: JSON.stringify(message),
    });
  },

  getHistory(scenarioId: string): Promise<MessageRecord[]> {
    return request<MessageRecord[]>(`/api/scenarios/${scenarioId}/messages`);
  },
};

export const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ?? BASE_URL;
