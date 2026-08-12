package com.ayigroup.rabbitmq.playground.routing;

import com.ayigroup.rabbitmq.playground.scenario.BoundExchange;
import com.ayigroup.rabbitmq.playground.scenario.QueueConfig;
import com.ayigroup.rabbitmq.playground.scenario.Scenario;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Objects;

/**
 * Evaluador de routing para DEAD_LETTER_EXCHANGE. A propósito NO implementa
 * {@link RoutingEvaluator} — mismo motivo que los otros dos evaluadores
 * custom: necesita saber a qué exchange entró el mensaje.
 *
 * <p>A diferencia de EXCHANGE_TO_EXCHANGE (reenvía lo que matchea un patrón)
 * y ALTERNATE_EXCHANGE (reenvía lo que no matchea nada), acá el dead
 * lettering **no es una decisión de routing en absoluto**: es un evento que
 * ocurre después de que el mensaje ya fue entregado a una cola real, cuando
 * esa cola lo rechaza explícitamente (o expira, o desborda). Por eso esta
 * evaluación es la más simple de las tres — no hay ninguna lógica de
 * "cruce" ligada a la routing key.
 */
@Component
public class DeadLetterRoutingEvaluator {

    public List<RoutingDecision> evaluate(Scenario scenario, BoundExchange target, String routingKey) {
        String key = routingKey == null ? "" : routingKey;

        if (target == BoundExchange.SECONDARY) {
            return scenario.getQueues().stream().map(q -> toDirectDlxDecision(q, key)).toList();
        }

        return scenario.getQueues().stream().map(q -> toDecision(q, key)).toList();
    }

    private RoutingDecision toDecision(QueueConfig q, String key) {
        if (q.getBoundExchange() != BoundExchange.SECONDARY) {
            String bindingKey = q.getBindingKey() == null ? "" : q.getBindingKey();
            boolean matched = Objects.equals(bindingKey, key);
            String reason = matched
                    ? "La routing key '" + key + "' coincide exactamente con el binding key '" + bindingKey + "' de esta cola."
                    : "La routing key '" + key + "' no coincide con el binding key '" + bindingKey + "' de esta cola.";
            return new RoutingDecision(q.getName(), q.getLabel(), matched, reason);
        }
        // La cola del DLX nunca matchea por routing directo acá: solo llega a
        // recibir un mensaje si la cola principal lo rechaza explícitamente
        // (evento aparte de la evaluación de routing, ver DynamicConsumerManager).
        return new RoutingDecision(q.getName(), q.getLabel(), false,
                "Esta cola vive en el Dead Letter Exchange: solo recibe un mensaje si la cola principal lo rechaza "
                        + "explícitamente (o expira, o desborda) — nunca por routing directo.");
    }

    private RoutingDecision toDirectDlxDecision(QueueConfig q, String key) {
        if (q.getBoundExchange() == BoundExchange.SECONDARY) {
            return new RoutingDecision(q.getName(), q.getLabel(), true,
                    "Publicado directo en el Dead Letter Exchange (fanout): le llega a esta cola sin importar la routing key '" + key + "'.");
        }
        return new RoutingDecision(q.getName(), q.getLabel(), false,
                "Esta cola vive en el exchange principal; publicar directo en el DLX no la afecta.");
    }
}
