import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScenarioSocket } from "./useScenarioSocket";
import type { QueueVisualState } from "./useTopologyAnimation";
import type { BoundExchange, MessageEventDto, QueueConfig, RoutingDecision } from "../types";

function defaultState(name: string, label: string): QueueVisualState {
  return { name, label, matchState: "idle", deliveryState: "idle", flowTick: 0, rejectTick: 0, deliverTick: 0, ackTick: 0 };
}

// Duración aproximada del viaje visual del paquete reenviado al exchange
// alternativo (packet-travel dura 0.85s en topology.css). La cola alternativa
// recién "reacciona" (pulso + flowTick) después de este delay, para que no
// parezca que el mensaje llega ahí antes de que RabbitMQ decida reenviarlo.
const REROUTE_DELAY_MS = 750;

/**
 * Equivalente a useExchangeBridgeAnimation pero para ALTERNATE_EXCHANGE:
 * el disparador para que la cola del exchange alternativo reaccione no es
 * un patrón que matchea (como el puente), sino que NINGUNA cola del
 * exchange principal haya matcheado. Se reimplementa (no se comparte) por
 * el mismo motivo que el resto de los hooks de topología: aislar el riesgo
 * entre pantallas.
 */
export function useAlternateExchangeAnimation(
  scenarioId: string | undefined,
  queues: QueueConfig[],
  resetSignal?: number,
) {
  const [producerTick, setProducerTick] = useState(0);
  const [mainExchangeTick, setMainExchangeTick] = useState(0);
  const [alternateExchangeTick, setAlternateExchangeTick] = useState(0);
  const [rerouteTick, setRerouteTick] = useState(0);
  const [unroutedTick, setUnroutedTick] = useState(0);
  const [queueStates, setQueueStates] = useState<Record<string, QueueVisualState>>({});

  // Qué exchange eligió el publisher para cada mensaje en vuelo (ROUTING_EVALUATED
  // no repite ese dato, solo MESSAGE_PUBLISHED lo trae).
  const enteredExchangeByMessage = useRef(new Map<string, BoundExchange>());

  // "Reiniciar" vacía las colas en el backend sin emitir ningún evento de
  // WebSocket, así que sin esto el diagrama se queda congelado mostrando el
  // resultado del último mensaje para siempre (mismo bug que hubo que
  // arreglar en el módulo de Exchange↔Exchange — acá se incluye desde el inicio).
  useEffect(() => {
    if (!resetSignal) return;
    setProducerTick(0);
    setMainExchangeTick(0);
    setAlternateExchangeTick(0);
    setRerouteTick(0);
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
            setAlternateExchangeTick((v) => v + 1);
          } else {
            setMainExchangeTick((v) => v + 1);
          }
        }, 150);
        return;
      }

      if (event.type === "ROUTING_EVALUATED") {
        const entered = enteredExchangeByMessage.current.get(event.messageId) ?? "PRIMARY";
        const decisions = event.routingResult ?? [];

        // Separamos las decisiones del exchange donde entró el mensaje
        // (reaccionan ya mismo) de las de la cola alternativa (solo
        // relevante si se publicó en el principal — el reenvío nunca va
        // en sentido contrario).
        const localDecisions: RoutingDecision[] = [];
        const fallbackDecisions: RoutingDecision[] = [];
        for (const decision of decisions) {
          const owner = queues.find((q) => q.name === decision.queueName)?.boundExchange ?? "PRIMARY";
          if (owner === entered) {
            localDecisions.push(decision);
          } else if (entered === "PRIMARY" && owner === "SECONDARY") {
            fallbackDecisions.push(decision);
          }
        }

        applyDecisions(localDecisions);

        const rerouted = fallbackDecisions.some((d) => d.matched);
        if (rerouted) {
          setRerouteTick((t) => t + 1);
          window.setTimeout(() => {
            setAlternateExchangeTick((t) => t + 1);
            applyDecisions(fallbackDecisions);
          }, REROUTE_DELAY_MS);
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

  const mainQueues = useMemo(() => queues.filter((q) => (q.boundExchange ?? "PRIMARY") === "PRIMARY"), [queues]);
  const alternateQueues = useMemo(() => queues.filter((q) => q.boundExchange === "SECONDARY"), [queues]);

  const mainQueueStates = useMemo(
    () => mainQueues.map((q) => queueStates[q.name] ?? defaultState(q.name, q.label)),
    [mainQueues, queueStates],
  );
  const alternateQueueStates = useMemo(
    () => alternateQueues.map((q) => queueStates[q.name] ?? defaultState(q.name, q.label)),
    [alternateQueues, queueStates],
  );

  return {
    producerTick,
    mainExchangeTick,
    alternateExchangeTick,
    rerouteTick,
    unroutedTick,
    mainQueueStates,
    alternateQueueStates,
  };
}
