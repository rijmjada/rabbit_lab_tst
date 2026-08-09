import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScenarioSocket } from "./useScenarioSocket";
import type { QueueVisualState } from "./useTopologyAnimation";
import type { BoundExchange, MessageEventDto, QueueConfig, RoutingDecision } from "../types";

function defaultState(name: string, label: string): QueueVisualState {
  return { name, label, matchState: "idle", deliveryState: "idle", flowTick: 0, rejectTick: 0, deliverTick: 0, ackTick: 0 };
}

// Duración aproximada del viaje visual del paquete por el puente
// (packet-travel dura 0.85s en topology.css). Las colas de Exchange 2 recién
// "reaccionan" (pulso + flowTick/rejectTick) después de este delay, para que
// no parezca que el mensaje llega a la cola antes de cruzar el puente.
const BRIDGE_TRAVEL_MS = 750;

/**
 * Equivalente a useTopologyAnimation pero para la topología de dos
 * exchanges encadenados: además de lo que ya rastrea ese hook por
 * cola, necesita saber qué exchange "pulsa" en cada publish y cuándo
 * un mensaje efectivamente cruza el binding puente. Se reimplementa
 * en vez de compartir el reducer con useTopologyAnimation a propósito,
 * para no acoplar esta pantalla nueva a la lógica de las otras 5.
 */
export function useExchangeBridgeAnimation(
  scenarioId: string | undefined,
  queues: QueueConfig[],
  resetSignal?: number,
) {
  const [producerTick, setProducerTick] = useState(0);
  const [primaryExchangeTick, setPrimaryExchangeTick] = useState(0);
  const [secondaryExchangeTick, setSecondaryExchangeTick] = useState(0);
  const [bridgeTick, setBridgeTick] = useState(0);
  const [unroutedTick, setUnroutedTick] = useState(0);
  const [queueStates, setQueueStates] = useState<Record<string, QueueVisualState>>({});

  // Qué exchange eligió el publisher para cada mensaje en vuelo, para
  // poder decidir en ROUTING_EVALUATED si un match en una cola de
  // Exchange 2 fue directo o llegó cruzando el puente desde Exchange 1
  // (ROUTING_EVALUATED no repite ese dato, solo MESSAGE_PUBLISHED).
  const enteredExchangeByMessage = useRef(new Map<string, BoundExchange>());

  // "Reiniciar" vacía las colas en el backend sin emitir ningún evento de
  // WebSocket (mismo caso que useTopologyAnimation), así que sin esto el
  // diagrama se queda congelado mostrando el resultado del último mensaje
  // (contadores, colas en verde, "ACK ✓") para siempre.
  useEffect(() => {
    if (!resetSignal) return;
    setProducerTick(0);
    setPrimaryExchangeTick(0);
    setSecondaryExchangeTick(0);
    setBridgeTick(0);
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
            setSecondaryExchangeTick((v) => v + 1);
          } else {
            setPrimaryExchangeTick((v) => v + 1);
          }
        }, 150);
        return;
      }

      if (event.type === "ROUTING_EVALUATED") {
        const entered = enteredExchangeByMessage.current.get(event.messageId) ?? "PRIMARY";
        const decisions = event.routingResult ?? [];

        // Separamos las decisiones del exchange donde entró el mensaje (reaccionan
        // ya mismo) de las del otro exchange (recién deberían reaccionar si el
        // mensaje efectivamente cruza el puente, y con el delay del viaje visual —
        // sino la cola de Exchange 2 "se entera" antes de que el paquete llegue).
        const localDecisions: RoutingDecision[] = [];
        const remoteDecisions: RoutingDecision[] = [];
        for (const decision of decisions) {
          const owner = queues.find((q) => q.name === decision.queueName)?.boundExchange ?? "PRIMARY";
          if (owner === entered) {
            localDecisions.push(decision);
          } else if (entered === "PRIMARY" && owner === "SECONDARY") {
            remoteDecisions.push(decision);
          }
          // owner !== entered en sentido Exchange2 -> Exchange1 nunca reacciona:
          // el puente no reenvía en ese sentido.
        }

        applyDecisions(localDecisions);

        const crossedBridge = remoteDecisions.some((d) => d.matched);
        if (crossedBridge) {
          setBridgeTick((t) => t + 1);
          window.setTimeout(() => {
            setSecondaryExchangeTick((t) => t + 1);
            applyDecisions(remoteDecisions);
          }, BRIDGE_TRAVEL_MS);
        }
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
        enteredExchangeByMessage.current.delete(event.messageId);
        setUnroutedTick((t) => t + 1);
      }
    },
    [queues, applyDecisions],
  );

  useScenarioSocket(scenarioId, handleEvent);

  const primaryQueues = useMemo(() => queues.filter((q) => (q.boundExchange ?? "PRIMARY") === "PRIMARY"), [queues]);
  const secondaryQueues = useMemo(() => queues.filter((q) => q.boundExchange === "SECONDARY"), [queues]);

  const primaryQueueStates = useMemo(
    () => primaryQueues.map((q) => queueStates[q.name] ?? defaultState(q.name, q.label)),
    [primaryQueues, queueStates],
  );
  const secondaryQueueStates = useMemo(
    () => secondaryQueues.map((q) => queueStates[q.name] ?? defaultState(q.name, q.label)),
    [secondaryQueues, queueStates],
  );

  return {
    producerTick,
    primaryExchangeTick,
    secondaryExchangeTick,
    bridgeTick,
    unroutedTick,
    primaryQueueStates,
    secondaryQueueStates,
  };
}
