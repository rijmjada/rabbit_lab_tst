import type { MessageEventDto, MessageRecord, PublishMessageRequest, PublishMessageResponse, QueueConfig, RoutingDecision, Scenario } from "../../types";
import { getScenario } from "./scenarioStore";
import { evaluateSimpleRouting } from "./routingEvaluators";
import { alternateExchangeEvaluate, deadLetterEvaluate, exchangeToExchangeEvaluate } from "./crossExchangeRouting";
import { append, markAcked, markDelivered, markRejected, markUnrouted } from "./history";
import { emit } from "./eventBus";

/**
 * Port 1:1 de `MessagePublisherService` + `DynamicConsumerManager`
 * (backend Java): misma secuencia de eventos, mismos delays. La diferencia
 * es que en vez de un publish/consume AMQP real, "entregar" un mensaje a
 * una cola es simplemente llamar `deliverToQueue` — pero la cascada de
 * dead-letter (rechazo real -> redelivery real con `x-death`) se modela
 * igual: una llamada recursiva a la misma función.
 */

const ROUTING_EVALUATION_DELAY_MS = 350;
const PUBLISH_DELAY_MS = 500;
const AUTO_ACK_DELAY_MS = 250;
const MANUAL_ACK_DELAY_MS = 900;
const RETURN_EPSILON_MS = 50;

function resolveDisplayRoutingKey(scenario: Scenario, request: PublishMessageRequest): string {
  if (scenario.type === "DEFAULT") return request.targetQueue ?? "";
  return request.routingKey ?? "";
}

function evaluateRouting(scenario: Scenario, displayRoutingKey: string, request: PublishMessageRequest): RoutingDecision[] {
  const target = request.targetExchange ?? "PRIMARY";
  switch (scenario.type) {
    case "EXCHANGE_TO_EXCHANGE":
      return exchangeToExchangeEvaluate(scenario, target, displayRoutingKey);
    case "ALTERNATE_EXCHANGE":
      return alternateExchangeEvaluate(scenario, target, displayRoutingKey);
    case "DEAD_LETTER_EXCHANGE":
      return deadLetterEvaluate(scenario, target, displayRoutingKey);
    default:
      return evaluateSimpleRouting(scenario.type, scenario, displayRoutingKey, request.headers);
  }
}

function ackDelayFor(queue: QueueConfig): number {
  return queue.ackMode === "MANUAL" ? MANUAL_ACK_DELAY_MS : AUTO_ACK_DELAY_MS;
}

function truthy(value: unknown): boolean {
  return value === true;
}

/**
 * Entrega un mensaje a una cola: emite MESSAGE_DELIVERED ya mismo, y agenda
 * el desenlace (ACK o REJECT) tras el delay de `ackMode` de esa cola.
 * `deathReason` no-null significa "esta es una redelivery real por
 * dead-letter" — bloquea que se vuelva a simular un rechazo sobre ella
 * misma, igual que el chequeo `x-death == null` del backend.
 */
function deliverToQueue(
  scenario: Scenario,
  messageId: string,
  queue: QueueConfig,
  request: PublishMessageRequest,
  deathReason: string | undefined,
): void {
  const scenarioId = scenario.id;

  emit(scenarioId, deliveredEvent(scenarioId, messageId, queue, deathReason));
  markDelivered(scenarioId, messageId, queue.name);

  const simulateReject = deathReason === undefined && truthy(request.simulateFailure);

  window.setTimeout(() => {
    if (simulateReject) {
      emit(scenarioId, rejectedEvent(scenarioId, messageId, queue));
      markRejected(scenarioId, messageId, queue.name);

      if (scenario.type === "DEAD_LETTER_EXCHANGE" && (queue.boundExchange ?? "PRIMARY") !== "SECONDARY") {
        const dlxQueues = scenario.queues.filter((q) => q.boundExchange === "SECONDARY");
        for (const dlxQueue of dlxQueues) {
          deliverToQueue(scenario, messageId, dlxQueue, request, "rejected");
        }
      }
      return;
    }

    emit(scenarioId, ackedEvent(scenarioId, messageId, queue));
    markAcked(scenarioId, messageId, queue.name);
  }, ackDelayFor(queue));
}

function deliveredEvent(scenarioId: string, messageId: string, queue: QueueConfig, deathReason: string | undefined): MessageEventDto {
  return { type: "MESSAGE_DELIVERED", scenarioId, messageId, timestamp: Date.now(), queueName: queue.name, queueLabel: queue.label, reason: deathReason };
}

function ackedEvent(scenarioId: string, messageId: string, queue: QueueConfig): MessageEventDto {
  return { type: "MESSAGE_ACKED", scenarioId, messageId, timestamp: Date.now(), queueName: queue.name, queueLabel: queue.label };
}

function rejectedEvent(scenarioId: string, messageId: string, queue: QueueConfig): MessageEventDto {
  return {
    type: "MESSAGE_REJECTED",
    scenarioId,
    messageId,
    timestamp: Date.now(),
    queueName: queue.name,
    queueLabel: queue.label,
    reason: "Rechazado manualmente (simulación de fallo de procesamiento).",
  };
}

export function publish(scenarioId: string, request: PublishMessageRequest): PublishMessageResponse {
  const scenario = getScenario(scenarioId);

  const messageId = crypto.randomUUID();
  const displayRoutingKey = resolveDisplayRoutingKey(scenario, request);
  const decisions = evaluateRouting(scenario, displayRoutingKey, request);
  const mandatory = request.mandatory ?? true;

  const record: MessageRecord = {
    id: messageId,
    scenarioId,
    timestamp: Date.now(),
    payload: request.payload,
    routingKey: displayRoutingKey,
    headers: request.headers,
    mandatory,
    routingResult: decisions,
    deliveries: {},
    unrouted: false,
  };
  append(scenarioId, record);

  const enteredExchange = scenario.secondaryExchangeName ? request.targetExchange ?? "PRIMARY" : undefined;
  emit(scenarioId, {
    type: "MESSAGE_PUBLISHED",
    scenarioId,
    messageId,
    timestamp: Date.now(),
    payload: request.payload,
    routingKey: displayRoutingKey,
    headers: request.headers,
    enteredExchange,
  });

  window.setTimeout(() => {
    emit(scenarioId, { type: "ROUTING_EVALUATED", scenarioId, messageId, timestamp: Date.now(), routingResult: decisions });
  }, ROUTING_EVALUATION_DELAY_MS);

  window.setTimeout(() => {
    doPublish(scenario, messageId, decisions, request, mandatory);
  }, PUBLISH_DELAY_MS);

  return { messageId, resolvedRoutingKey: displayRoutingKey, routingResult: decisions };
}

function doPublish(scenario: Scenario, messageId: string, decisions: RoutingDecision[], request: PublishMessageRequest, mandatory: boolean): void {
  const scenarioId = scenario.id;
  const matchedNames = new Set(decisions.filter((d) => d.matched).map((d) => d.queueName));
  const matchedQueues = scenario.queues.filter((q) => matchedNames.has(q.name));

  if (matchedQueues.length === 0 && mandatory) {
    window.setTimeout(() => {
      markUnrouted(scenarioId, messageId);
      emit(scenarioId, {
        type: "MESSAGE_RETURNED",
        scenarioId,
        messageId,
        timestamp: Date.now(),
        reason: "RabbitMQ no encontró ninguna cola vinculada que coincidiera; el mensaje fue devuelto (mandatory) en vez de descartarse.",
      });
    }, RETURN_EPSILON_MS);
    return;
  }

  for (const queue of matchedQueues) {
    deliverToQueue(scenario, messageId, queue, request, undefined);
  }
}
