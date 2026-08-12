import { useCallback, useEffect, useMemo, useState } from "react";
import { useScenarioSocket } from "./useScenarioSocket";
import type { MessageEventDto, QueueConfig } from "../types";

export type QueueVisualState = {
  name: string;
  label: string;
  matchState: "idle" | "matched" | "unmatched";
  deliveryState: "idle" | "delivered" | "acked" | "rejected";
  flowTick: number;
  rejectTick: number;
  deliverTick: number;
  ackTick: number;
};

function defaultState(name: string, label: string): QueueVisualState {
  return {
    name,
    label,
    matchState: "idle",
    deliveryState: "idle",
    flowTick: 0,
    rejectTick: 0,
    deliverTick: 0,
    ackTick: 0,
  };
}

/**
 * Traduce la secuencia de eventos crudos de WebSocket en el estado
 * visual que necesita <TopologyCanvas>: qué nodo debe "brillar" y
 * cuándo, sin que cada pantalla tenga que reimplementar esa lógica.
 */
export function useTopologyAnimation(scenarioId: string | undefined, queues: QueueConfig[], resetSignal?: number) {
  const [producerTick, setProducerTick] = useState(0);
  const [exchangeTick, setExchangeTick] = useState(0);
  const [unroutedTick, setUnroutedTick] = useState(0);
  const [queueStates, setQueueStates] = useState<Record<string, QueueVisualState>>({});

  // "Reiniciar" vacía las colas en el backend sin emitir ningún evento de
  // WebSocket, así que sin esto el diagrama se queda congelado mostrando
  // el resultado del último mensaje (colas en verde, "ACK ✓") para
  // siempre. Al recibir la señal, todo vuelve a su estado inicial/idle.
  useEffect(() => {
    if (!resetSignal) return;
    setProducerTick(0);
    setExchangeTick(0);
    setUnroutedTick(0);
    setQueueStates({});
  }, [resetSignal]);

  const handleEvent = useCallback(
    (event: MessageEventDto) => {
      if (event.type === "MESSAGE_PUBLISHED") {
        setProducerTick((t) => t + 1);
        setQueueStates((prev) => {
          const next: Record<string, QueueVisualState> = {};
          for (const q of queues) {
            const existing = prev[q.name];
            next[q.name] = {
              ...defaultState(q.name, q.label),
              flowTick: existing?.flowTick ?? 0,
              rejectTick: existing?.rejectTick ?? 0,
              deliverTick: existing?.deliverTick ?? 0,
              ackTick: existing?.ackTick ?? 0,
            };
          }
          return next;
        });
        window.setTimeout(() => setExchangeTick((v) => v + 1), 150);
        return;
      }

      if (event.type === "ROUTING_EVALUATED") {
        setQueueStates((prev) => {
          const next = { ...prev };
          for (const decision of event.routingResult ?? []) {
            const existing = next[decision.queueName] ?? defaultState(decision.queueName, decision.queueLabel);
            next[decision.queueName] = {
              ...existing,
              label: decision.queueLabel,
              matchState: decision.matched ? "matched" : "unmatched",
              flowTick: decision.matched ? existing.flowTick + 1 : existing.flowTick,
              rejectTick: decision.matched ? existing.rejectTick : existing.rejectTick + 1,
            };
          }
          return next;
        });
        return;
      }

      if (event.type === "MESSAGE_DELIVERED" && event.queueName) {
        const queueName = event.queueName;
        const queueLabel = event.queueLabel ?? queueName;
        setQueueStates((prev) => {
          const existing = prev[queueName] ?? defaultState(queueName, queueLabel);
          return {
            ...prev,
            [queueName]: { ...existing, deliveryState: "delivered", deliverTick: existing.deliverTick + 1 },
          };
        });
        return;
      }

      if (event.type === "MESSAGE_ACKED" && event.queueName) {
        const queueName = event.queueName;
        const queueLabel = event.queueLabel ?? queueName;
        setQueueStates((prev) => {
          const existing = prev[queueName] ?? defaultState(queueName, queueLabel);
          return { ...prev, [queueName]: { ...existing, deliveryState: "acked", ackTick: existing.ackTick + 1 } };
        });
        return;
      }

      if (event.type === "MESSAGE_RETURNED") {
        setUnroutedTick((t) => t + 1);
      }
    },
    [queues],
  );

  useScenarioSocket(scenarioId, handleEvent);

  const orderedQueueStates = useMemo(
    () => queues.map((q) => queueStates[q.name] ?? defaultState(q.name, q.label)),
    [queues, queueStates],
  );

  return { producerTick, exchangeTick, unroutedTick, queueStates: orderedQueueStates };
}
