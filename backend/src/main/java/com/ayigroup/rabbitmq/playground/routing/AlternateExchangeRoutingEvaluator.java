package com.ayigroup.rabbitmq.playground.routing;

import com.ayigroup.rabbitmq.playground.scenario.BoundExchange;
import com.ayigroup.rabbitmq.playground.scenario.QueueConfig;
import com.ayigroup.rabbitmq.playground.scenario.Scenario;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Objects;

/**
 * Evaluador de routing para ALTERNATE_EXCHANGE. A propósito NO implementa
 * {@link RoutingEvaluator} — mismo motivo que {@link ExchangeToExchangeRoutingEvaluator}:
 * necesita saber a qué exchange entró el mensaje, algo que esa interfaz no modela.
 *
 * <p>A diferencia del binding puente de EXCHANGE_TO_EXCHANGE (que reenvía lo
 * que <b>sí</b> matchea un patrón), acá el exchange alternativo recibe
 * automáticamente lo que <b>no</b> matchea ningún binding del exchange
 * principal — no hay ningún patrón que evaluar para decidir si "cruza": el
 * disparador es, exactamente, que ninguna cola del principal haya matcheado.
 */
@Component
public class AlternateExchangeRoutingEvaluator {

    public List<RoutingDecision> evaluate(Scenario scenario, BoundExchange target, String routingKey) {
        String key = routingKey == null ? "" : routingKey;

        if (target == BoundExchange.SECONDARY) {
            return scenario.getQueues().stream().map(q -> toDirectAlternateDecision(q, key)).toList();
        }

        boolean anyDirectMatch = scenario.getQueues().stream()
                .filter(q -> q.getBoundExchange() != BoundExchange.SECONDARY)
                .anyMatch(q -> matchesDirect(q, key));

        return scenario.getQueues().stream().map(q -> toDecision(q, key, anyDirectMatch)).toList();
    }

    private boolean matchesDirect(QueueConfig q, String key) {
        String bindingKey = q.getBindingKey() == null ? "" : q.getBindingKey();
        return Objects.equals(bindingKey, key);
    }

    private RoutingDecision toDecision(QueueConfig q, String key, boolean anyDirectMatch) {
        if (q.getBoundExchange() != BoundExchange.SECONDARY) {
            boolean matched = matchesDirect(q, key);
            String bindingKey = q.getBindingKey() == null ? "" : q.getBindingKey();
            String reason = matched
                    ? "La routing key '" + key + "' coincide exactamente con el binding key '" + bindingKey + "' de esta cola."
                    : "La routing key '" + key + "' no coincide con el binding key '" + bindingKey + "' de esta cola.";
            return new RoutingDecision(q.getName(), q.getLabel(), matched, reason);
        }

        // Cola del exchange alternativo (fanout): RabbitMQ la activa exactamente
        // cuando el mensaje no matcheó ningún binding del exchange principal.
        boolean matched = !anyDirectMatch;
        String reason = matched
                ? "La routing key '" + key + "' no coincidió con ningún binding del exchange principal, así que "
                        + "RabbitMQ reenvía automáticamente el mensaje al exchange alternativo (fanout: le llega a "
                        + "esta cola sin importar la key)."
                : "La routing key '" + key + "' sí coincidió con alguna cola del exchange principal, así que el "
                        + "mensaje nunca activa el exchange alternativo.";
        return new RoutingDecision(q.getName(), q.getLabel(), matched, reason);
    }

    private RoutingDecision toDirectAlternateDecision(QueueConfig q, String key) {
        if (q.getBoundExchange() == BoundExchange.SECONDARY) {
            return new RoutingDecision(q.getName(), q.getLabel(), true,
                    "Publicado directo en el exchange alternativo (fanout): le llega a esta cola sin importar la routing key '" + key + "'.");
        }
        return new RoutingDecision(q.getName(), q.getLabel(), false,
                "Esta cola vive en el exchange principal; publicar directo en el exchange alternativo no la afecta.");
    }
}
