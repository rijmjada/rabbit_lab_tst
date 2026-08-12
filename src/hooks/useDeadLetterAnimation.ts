import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScenarioSocket } from "./useScenarioSocket";
import type { QueueVisualState } from "./useTopologyAnimation";
import type { BoundExchange, MessageEventDto, QueueConfig, RoutingDecision } from "../types";

function defaultState(name: string, label: string): QueueVisualState {
  return { name, label, matchState: "idle", deliveryState: "idle", flowTick: 0, rejectTick: 0, deliverTick: 0, ackTick: 0 };
}

/**
 * Equivalente a useExchangeBridgeAnimation/useAlternateExchangeAnimation pero
 * para DEAD_LETTER_EXCHANGE. Es el más simple de los tres: acá el cruce hacia
 * la cola del DLX no es una decisión de routing simulada (que necesita el
 * truco de aplicarse con un delay artificial para que se vea después del
 * viaje visual) — es la secuencia real de eventos que ya emite el backend
 * (MESSAGE_REJECTED en la cola principal, y más tarde un MESSAGE_DELIVERED /
 * MESSAGE_ACKED real en la cola del DLX). Por eso ROUTING_EVALUATED se
 * aplica directo, sin separar "decisiones locales" de "decisiones de
 * fallback" como en los otros dos hooks.
 */
export function useDeadLetterAnimation(scenarioId: string | undefined, queues: QueueConfig[], resetSignal?: number) {
  const [producerTick, setProducerTick] = useState(0);
  const [primaryExchangeTick, setPrimaryExchangeTick] = useState(0);
  const [dlxExchangeTick, setDlxExchangeTick] = useState(0);
  const [deadLetterTick, setDeadLetterTick] = useState(0);
  const [unroutedTick, setUnroutedTick] = useState(0);
  const [queueStates, setQueueStates] = useState<Record<string, QueueVisualState>>({});

  // Qué exchange eligió el publisher para cada mensaje en vuelo (ROUTING_EVALUATED
  // no repite ese dato, solo MESSAGE_PUBLISHED lo trae).
  const enteredExchangeByMessage = useRef(new Map<string, BoundExchange>());

  // "Reiniciar" vacía las colas en el backend sin emitir ningún evento de
  // WebSocket, así que sin esto el diagrama se queda congelado mostrando el
  // resultado del último mensaje para siempre (mismo bug ya resuelto en los
  // otros dos módulos de dos exchanges).
  useEffect(() => {
    if (!resetSignal) return;
    setProducerTick(0);
    setPrimaryExchangeTick(0);
    setDlxExchangeTick(0);
    setDeadLetterTick(0);
    setUnroutedTick(0);
    setQueueStates({});
    enteredExchangeByMessage.current.clear();
  }, [resetSignal]);

  const applyDecisions = useCallback((decisions: RoutingDecision[]) => {
    if (decisions.length === 0) return;
    setQueueStates((prev) => {
      const next = { ...prev };
      for (const decision of decisions) {
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
  }, []);

  const handleEvent = useCallback(
    (event: MessageEventDto) => {
      if (event.type === "MESSAGE_PUBLISHED") {
        const entered = event.enteredExchange ?? "PRIMARY";
        enteredExchangeByMessage.current.set(event.messageId, entered);
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
        window.setTimeout(() => {
          if (entered === "SECONDARY") {
            setDlxExchangeTick((v) => v + 1);
          } else {
            setPrimaryExchangeTick((v) => v + 1);
          }
        }, 150);
        return;
      }

      if (event.type === "ROUTING_EVALUATED") {
        applyDecisions(event.routingResult ?? []);
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

      if (event.type === "MESSAGE_REJECTED" && event.queueName) {
        const queueName = event.queueName;
        const queueLabel = event.queueLabel ?? queueName;
        setQueueStates((prev) => {
          const existing = prev[queueName] ?? defaultState(queueName, queueLabel);
          return { ...prev, [queueName]: { ...existing, deliveryState: "rejected" } };
        });
        // Tick decorativo: dispara la animación del conector cola -> DLX.
        setDeadLetterTick((t) => t + 1);
        return;
      }

      if (event.type === "MESSAGE_RETURNED") {
        enteredExchangeByMessage.current.delete(event.messageId);
        setUnroutedTick((t) => t + 1);
      }
    },
    [queues, applyDecisions],
  );

  useScenarioSocket(scenarioId, handleEvent);

  const primaryQueues = useMemo(() => queues.filter((q) => (q.boundExchange ?? "PRIMARY") === "PRIMARY"), [queues]);
  const dlxQueues = useMemo(() => queues.filter((q) => q.boundExchange === "SECONDARY"), [queues]);

  const primaryQueueStates = useMemo(
    () => primaryQueues.map((q) => queueStates[q.name] ?? defaultState(q.name, q.label)),
    [primaryQueues, queueStates],
  );
  const dlxQueueStates = useMemo(
    () => dlxQueues.map((q) => queueStates[q.name] ?? defaultState(q.name, q.label)),
    [dlxQueues, queueStates],
  );

  return {
    producerTick,
    primaryExchangeTick,
    dlxExchangeTick,
    deadLetterTick,
    unroutedTick,
    primaryQueueStates,
    dlxQueueStates,
  };
}
