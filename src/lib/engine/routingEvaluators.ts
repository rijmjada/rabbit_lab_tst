import type { ExchangeType, QueueConfig, RoutingDecision, Scenario } from "../../types";
import { matchesTopicPattern } from "./topicPatternMatcher";

/**
 * Port 1:1 de los 5 evaluadores "simples" del backend Java
 * (`routing/FanoutRoutingEvaluator`, `DirectRoutingEvaluator`,
 * `TopicRoutingEvaluator`, `HeadersRoutingEvaluator`,
 * `DefaultRoutingEvaluator`) + el dispatcher que reemplaza a
 * `RoutingEvaluatorFactory`.
 */

function decision(q: QueueConfig, matched: boolean, reason: string): RoutingDecision {
  return { queueName: q.name, queueLabel: q.label, matched, reason };
}

function fanoutEvaluate(scenario: Scenario): RoutingDecision[] {
  return scenario.queues.map((q) =>
    decision(q, true, "Fanout entrega el mensaje a todas las colas vinculadas, sin importar la routing key."),
  );
}

function directEvaluate(scenario: Scenario, routingKey: string): RoutingDecision[] {
  const key = routingKey ?? "";
  return scenario.queues.map((q) => {
    const bindingKey = q.bindingKey ?? "";
    const matched = bindingKey === key;
    const reason = matched
      ? `La routing key '${key}' coincide exactamente con el binding key '${bindingKey}' de esta cola.`
      : `La routing key '${key}' no coincide con el binding key '${bindingKey}' de esta cola.`;
    return decision(q, matched, reason);
  });
}

function topicEvaluate(scenario: Scenario, routingKey: string): RoutingDecision[] {
  const key = routingKey ?? "";
  return scenario.queues.map((q) => {
    const pattern = q.pattern ?? "";
    const matched = matchesTopicPattern(pattern, key);
    const reason = matched
      ? `La routing key '${key}' coincide con el patrón '${pattern}' (comodines * y # aplicados por segmento).`
      : `La routing key '${key}' no coincide con el patrón '${pattern}'.`;
    return decision(q, matched, reason);
  });
}

function headersEvaluate(scenario: Scenario, headers: Record<string, string> | undefined): RoutingDecision[] {
  const messageHeaders = headers ?? {};
  return scenario.queues.map((q) => {
    const required = q.headers ?? {};
    const requiredEntries = Object.entries(required);
    if (requiredEntries.length === 0) {
      return decision(q, false, "Esta cola no tiene cabeceras configuradas en su binding.");
    }
    const matchAny = (q.xMatch ?? "all").toLowerCase() === "any";
    const matchedKeys = requiredEntries.filter(([k, v]) => messageHeaders[k] === v).map(([k]) => k);
    const missingKeys = requiredEntries.filter(([k]) => !matchedKeys.includes(k)).map(([k]) => k);
    const matched = matchAny ? matchedKeys.length > 0 : missingKeys.length === 0;
    const mode = matchAny ? "any" : "all";
    const reason = matched
      ? `x-match: ${mode} — coinciden las cabeceras: ${matchedKeys.join(", ")}.`
      : `x-match: ${mode} — faltan las cabeceras: ${missingKeys.join(", ") || "(todas)"}.`;
    return decision(q, matched, reason);
  });
}

function defaultEvaluate(scenario: Scenario, routingKey: string): RoutingDecision[] {
  const key = routingKey ?? "";
  return scenario.queues.map((q) => {
    const matched = q.label === key;
    const reason = matched
      ? `La routing key '${key}' coincide con el nombre de esta cola en el Default Exchange.`
      : `La routing key '${key}' no coincide con el nombre de esta cola ('${q.label}').`;
    return decision(q, matched, reason);
  });
}

const SIMPLE_EVALUATORS: Partial<
  Record<ExchangeType, (scenario: Scenario, routingKey: string, headers: Record<string, string> | undefined) => RoutingDecision[]>
> = {
  FANOUT: (scenario) => fanoutEvaluate(scenario),
  DIRECT: (scenario, routingKey) => directEvaluate(scenario, routingKey),
  TOPIC: (scenario, routingKey) => topicEvaluate(scenario, routingKey),
  HEADERS: (scenario, _routingKey, headers) => headersEvaluate(scenario, headers),
  DEFAULT: (scenario, routingKey) => defaultEvaluate(scenario, routingKey),
};

/** Equivalente a `RoutingEvaluatorFactory.forType(type).evaluate(...)`. Solo cubre los 5 tipos simples. */
export function evaluateSimpleRouting(
  type: ExchangeType,
  scenario: Scenario,
  routingKey: string,
  headers: Record<string, string> | undefined,
): RoutingDecision[] {
  const evaluator = SIMPLE_EVALUATORS[type];
  if (!evaluator) {
    throw new Error(`No hay evaluador de routing simple para el tipo ${type}`);
  }
  return evaluator(scenario, routingKey, headers);
}
