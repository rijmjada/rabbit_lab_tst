import type { DeliveryStatus, MessageRecord } from "../../types";

/** Port 1:1 de `MessageHistoryService` (backend Java): historial en memoria, tope 50 registros por escenario. */

const MAX_PER_SCENARIO = 50;
const historyByScenario = new Map<string, MessageRecord[]>();

function dequeFor(scenarioId: string): MessageRecord[] {
  let deque = historyByScenario.get(scenarioId);
  if (!deque) {
    deque = [];
    historyByScenario.set(scenarioId, deque);
  }
  return deque;
}

export function append(scenarioId: string, record: MessageRecord): void {
  const deque = dequeFor(scenarioId);
  deque.unshift(record);
  if (deque.length > MAX_PER_SCENARIO) deque.length = MAX_PER_SCENARIO;
}

function update(scenarioId: string, messageId: string, mutate: (record: MessageRecord) => void): void {
  const record = dequeFor(scenarioId).find((r) => r.id === messageId);
  if (record) mutate(record);
}

function markDelivery(scenarioId: string, messageId: string, queueName: string, status: DeliveryStatus): void {
  update(scenarioId, messageId, (r) => {
    r.deliveries[queueName] = status;
  });
}

export function markDelivered(scenarioId: string, messageId: string, queueName: string): void {
  markDelivery(scenarioId, messageId, queueName, "DELIVERED");
}

export function markAcked(scenarioId: string, messageId: string, queueName: string): void {
  markDelivery(scenarioId, messageId, queueName, "ACKED");
}

export function markRejected(scenarioId: string, messageId: string, queueName: string): void {
  markDelivery(scenarioId, messageId, queueName, "REJECTED");
}

export function markUnrouted(scenarioId: string, messageId: string): void {
  update(scenarioId, messageId, (r) => {
    r.unrouted = true;
  });
}

export function listHistory(scenarioId: string): MessageRecord[] {
  return [...dequeFor(scenarioId)];
}

export function clearHistory(scenarioId: string): void {
  historyByScenario.delete(scenarioId);
}
