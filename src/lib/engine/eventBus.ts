import type { MessageEventDto } from "../../types";

/**
 * Reemplazo local de STOMP/SockJS (`lib/ws.ts`): un registro de handlers
 * por escenario, sin ninguna red real detrás. Misma forma pública que el
 * `scenarioSocket` real: `listen(scenarioId, handler): () => void`.
 */

type Handler = (event: MessageEventDto) => void;

const handlersByScenario = new Map<string, Set<Handler>>();

export function listen(scenarioId: string, handler: Handler): () => void {
  if (!handlersByScenario.has(scenarioId)) handlersByScenario.set(scenarioId, new Set());
  const handlers = handlersByScenario.get(scenarioId)!;
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) handlersByScenario.delete(scenarioId);
  };
}

export function emit(scenarioId: string, event: MessageEventDto): void {
  const handlers = handlersByScenario.get(scenarioId);
  if (!handlers) return;
  handlers.forEach((handler) => handler(event));
}
