import type { BoundExchange, QueueConfig, RoutingDecision, Scenario } from "../../types";
import { matchesTopicPattern } from "./topicPatternMatcher";

/**
 * Port 1:1 de los 3 evaluadores "custom" del backend Java
 * (`ExchangeToExchangeRoutingEvaluator`, `AlternateExchangeRoutingEvaluator`,
 * `DeadLetterRoutingEvaluator`), que a propósito no comparten la interfaz de
 * los 5 evaluadores simples porque necesitan saber a qué exchange entró el
 * mensaje (`target: BoundExchange`).
 */

function decision(q: QueueConfig, matched: boolean, reason: string): RoutingDecision {
  return { queueName: q.name, queueLabel: q.label, matched, reason };
}

function owner(q: QueueConfig): BoundExchange {
  return q.boundExchange ?? "PRIMARY";
}

/** Un mensaje matchea directo (mismo exchange donde se publicó) o reenviado (cruza el puente hacia Exchange 2, nunca al revés). */
export function exchangeToExchangeEvaluate(scenario: Scenario, target: BoundExchange, routingKey: string): RoutingDecision[] {
  const key = routingKey ?? "";
  const bridgeKey = scenario.bridgeBindingKey ?? "";
  const crossedBridge = target === "PRIMARY" && matchesTopicPattern(bridgeKey, key);

  return scenario.queues.map((q) => {
    const queueOwner = owner(q);
    const pattern = q.pattern ?? "";
    const ownPatternMatches = matchesTopicPattern(pattern, key);

    if (queueOwner === target && ownPatternMatches) {
      return decision(q, true, `Match directo: la routing key '${key}' coincide con el patrón propio ('${pattern}') en el mismo exchange donde se publicó.`);
    }
    if (target === "PRIMARY" && queueOwner === "SECONDARY") {
      if (!crossedBridge) {
        return decision(q, false, `La routing key '${key}' no coincide con el patrón del puente ('${bridgeKey}'), así que nunca cruza a Exchange 2.`);
      }
      return decision(
        q,
        ownPatternMatches,
        ownPatternMatches
          ? `Cruza el puente (coincide con '${bridgeKey}') y además coincide con el patrón propio de esta cola ('${pattern}') en Exchange 2.`
          : `Cruza el puente (coincide con '${bridgeKey}') pero no coincide con el patrón propio de esta cola ('${pattern}') en Exchange 2.`,
      );
    }
    if (target === "SECONDARY" && queueOwner === "PRIMARY") {
      return decision(q, false, "Esta cola vive en Exchange 1; el puente nunca reenvía en sentido inverso (Exchange 2 → Exchange 1).");
    }
    return decision(q, false, `La routing key '${key}' no coincide con el patrón propio de esta cola ('${pattern}').`);
  });
}

/** Colas PRIMARY matchean por bindingKey exacto; la cola SECONDARY (fanout) matchea sii ninguna PRIMARY matcheó. */
export function alternateExchangeEvaluate(scenario: Scenario, target: BoundExchange, routingKey: string): RoutingDecision[] {
  const key = routingKey ?? "";

  if (target === "SECONDARY") {
    return scenario.queues.map((q) =>
      owner(q) === "SECONDARY"
        ? decision(q, true, `Publicado directo en el exchange alternativo (fanout): le llega a esta cola sin importar la routing key '${key}'.`)
        : decision(q, false, "Esta cola vive en el exchange principal; publicar directo en el alternativo no la afecta."),
    );
  }

  const anyDirectMatch = scenario.queues.some((q) => owner(q) !== "SECONDARY" && (q.bindingKey ?? "") === key);

  return scenario.queues.map((q) => {
    if (owner(q) !== "SECONDARY") {
      const bindingKey = q.bindingKey ?? "";
      const matched = bindingKey === key;
      return decision(
        q,
        matched,
        matched
          ? `La routing key '${key}' coincide exactamente con el binding key '${bindingKey}' de esta cola.`
          : `La routing key '${key}' no coincide con el binding key '${bindingKey}' de esta cola.`,
      );
    }
    return decision(
      q,
      !anyDirectMatch,
      !anyDirectMatch
        ? "Ninguna cola del exchange principal matcheó esta routing key, así que RabbitMQ la reenvía automáticamente al exchange alternativo."
        : "Al menos una cola del exchange principal matcheó esta routing key, así que el exchange alternativo no se activa.",
    );
  });
}

/** La cola SECONDARY (DLX) nunca matchea por routing directo — solo recibe un mensaje si la cola principal lo rechaza. */
export function deadLetterEvaluate(scenario: Scenario, target: BoundExchange, routingKey: string): RoutingDecision[] {
  const key = routingKey ?? "";

  if (target === "SECONDARY") {
    return scenario.queues.map((q) =>
      owner(q) === "SECONDARY"
        ? decision(q, true, `Publicado directo en el Dead Letter Exchange (fanout): le llega a esta cola sin importar la routing key '${key}'.`)
        : decision(q, false, "Esta cola vive en el exchange principal; publicar directo en el DLX no la afecta."),
    );
  }

  return scenario.queues.map((q) => {
    if (owner(q) !== "SECONDARY") {
      const bindingKey = q.bindingKey ?? "";
      const matched = bindingKey === key;
      return decision(
        q,
        matched,
        matched
          ? `La routing key '${key}' coincide exactamente con el binding key '${bindingKey}' de esta cola.`
          : `La routing key '${key}' no coincide con el binding key '${bindingKey}' de esta cola.`,
      );
    }
    return decision(
      q,
      false,
      "Esta cola vive en el Dead Letter Exchange: solo recibe un mensaje si la cola principal lo rechaza explícitamente (o expira, o desborda) — nunca por routing directo.",
    );
  });
}
