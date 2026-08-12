import type { ExchangeType, QueueConfig, Scenario } from "../../types";
import { getSessionId } from "../session";
import { mainExchangeName, sanitizeSessionId, secondaryExchangeName, queueName, typeSlug } from "./naming";
import { buildDefaultQueues, DEFAULT_BRIDGE_BINDING_KEY } from "./scenarioDefaults";
import { clearHistory } from "./history";

/** Port 1:1 de `ScenarioService` (backend Java): ciclo de vida de escenarios en memoria (sin idle-timeout — no hay recursos reales de broker que limpiar). */

const scenarios = new Map<string, Scenario>();

function hasSecondaryExchange(type: ExchangeType): boolean {
  return type === "EXCHANGE_TO_EXCHANGE" || type === "ALTERNATE_EXCHANGE" || type === "DEAD_LETTER_EXCHANGE";
}

export function createScenario(type: ExchangeType): Scenario {
  const sessionId = sanitizeSessionId(getSessionId());
  const slugType = typeSlug(type);

  const queues: QueueConfig[] = buildDefaultQueues(type).map((q) => ({
    ...q,
    name: queueName(sessionId, slugType, q.label),
  }));

  const scenario: Scenario = {
    id: crypto.randomUUID(),
    type,
    status: "RUNNING",
    exchangeName: mainExchangeName(sessionId, slugType, type),
    secondaryExchangeName: secondaryExchangeName(sessionId, slugType, hasSecondaryExchange(type)),
    bridgeBindingKey: type === "EXCHANGE_TO_EXCHANGE" ? DEFAULT_BRIDGE_BINDING_KEY : undefined,
    queues,
  };

  scenarios.set(scenario.id, scenario);
  return scenario;
}

export function getScenario(id: string): Scenario {
  const scenario = scenarios.get(id);
  if (!scenario) throw new Error(`No existe un escenario con id ${id}`);
  return scenario;
}

/** Igual que el backend: purga colas/historial, no toca bindings ni topología. */
export function resetScenario(id: string): Scenario {
  const scenario = getScenario(id);
  clearHistory(id);
  return scenario;
}

export function deleteScenario(id: string): void {
  if (!scenarios.delete(id)) {
    throw new Error(`No existe un escenario con id ${id}`);
  }
  clearHistory(id);
}

/** Igual que `ScenarioService.updateBindings`: nunca toca `name`/`label`/`boundExchange` — esos son la topología fija desde la creación. */
export function updateBindings(id: string, updates: QueueConfig[], bridgeBindingKey: string | undefined): Scenario {
  const scenario = getScenario(id);
  const byName = new Map(scenario.queues.map((q) => [q.name, q]));

  for (const update of updates) {
    const existing = byName.get(update.name);
    if (!existing) continue;
    existing.bindingKey = update.bindingKey ?? null;
    existing.pattern = update.pattern ?? null;
    existing.headers = update.headers ?? null;
    existing.xMatch = update.xMatch ?? null;
    if (update.ackMode != null) existing.ackMode = update.ackMode;
  }
  if (bridgeBindingKey != null) scenario.bridgeBindingKey = bridgeBindingKey;

  return scenario;
}
