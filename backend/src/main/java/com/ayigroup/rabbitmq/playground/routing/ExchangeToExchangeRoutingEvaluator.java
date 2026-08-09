package com.ayigroup.rabbitmq.playground.routing;

import com.ayigroup.rabbitmq.playground.scenario.BoundExchange;
import com.ayigroup.rabbitmq.playground.scenario.QueueConfig;
import com.ayigroup.rabbitmq.playground.scenario.Scenario;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Evaluador de routing para EXCHANGE_TO_EXCHANGE. A propósito NO
 * implementa {@link RoutingEvaluator}: esa interfaz no tiene noción de
 * "a qué exchange entró el mensaje" (acá hay dos exchanges posibles),
 * y no vale la pena forzarle ese parámetro a los otros cuatro
 * evaluadores. Este componente se invoca directamente desde
 * MessagePublisherService cuando el escenario es de este tipo.
 *
 * <p>Los dos exchanges encadenados son Topic, así que tanto el binding
 * de cada cola como el binding puente son patrones (con '*' y '#'), no
 * igualdades exactas — se reusa {@link TopicPatternMatcher}. Un mensaje
 * matchea una cola de dos formas posibles: (a) directo, si la cola vive
 * en el mismo exchange donde se publicó y su patrón coincide con la
 * routing key; o (b) reenviado, si se publicó en el exchange primario,
 * la routing key coincide con el patrón del puente (Exchange 1 -&gt;
 * Exchange 2), y la cola vive en el exchange secundario con un patrón
 * que también coincide con esa misma routing key. El puente nunca
 * reenvía en sentido contrario (Exchange 2 -&gt; Exchange 1).
 */
@Component
public class ExchangeToExchangeRoutingEvaluator {

    public List<RoutingDecision> evaluate(Scenario scenario, BoundExchange target, String routingKey) {
        String key = routingKey == null ? "" : routingKey;
        String bridgePattern = scenario.getBridgeBindingKey() == null ? "" : scenario.getBridgeBindingKey();
        boolean crossesBridge = target == BoundExchange.PRIMARY && TopicPatternMatcher.matches(bridgePattern, key);

        return scenario.getQueues().stream()
                .map(q -> toDecision(q, target, key, bridgePattern, crossesBridge))
                .toList();
    }

    private RoutingDecision toDecision(QueueConfig q, BoundExchange target, String key, String bridgePattern, boolean crossesBridge) {
        String pattern = q.getPattern() == null ? "" : q.getPattern();
        boolean sameExchange = q.getBoundExchange() == target;
        boolean keyMatchesQueue = TopicPatternMatcher.matches(pattern, key);

        boolean directMatch = sameExchange && keyMatchesQueue;
        boolean forwardedMatch = !sameExchange && q.getBoundExchange() == BoundExchange.SECONDARY
                && crossesBridge && keyMatchesQueue;
        boolean matched = directMatch || forwardedMatch;

        String exchangeLabel = q.getBoundExchange() == BoundExchange.SECONDARY ? "Exchange 2" : "Exchange 1";
        String reason;
        if (directMatch) {
            reason = "La routing key '" + key + "' coincide con el patrón '" + pattern
                    + "' de esta cola en " + exchangeLabel + ", el mismo exchange donde se publicó.";
        } else if (forwardedMatch) {
            reason = "La routing key '" + key + "' coincide con el patrón del puente ('" + bridgePattern
                    + "') de Exchange 1 -> Exchange 2, así que el mensaje se reenvía sin cambiar su routing key"
                    + " — y esa misma key también coincide con el patrón '" + pattern + "' de esta cola en Exchange 2.";
        } else if (!sameExchange && target == BoundExchange.SECONDARY) {
            reason = "Esta cola está en Exchange 1; un mensaje publicado directamente en Exchange 2 nunca puede "
                    + "llegar acá (el puente solo reenvía en sentido Exchange 1 -> Exchange 2).";
        } else if (!sameExchange && !crossesBridge) {
            reason = "La routing key '" + key + "' no coincide con el patrón del puente ('" + bridgePattern
                    + "'), así que el mensaje nunca cruza a Exchange 2, donde vive esta cola.";
        } else if (!sameExchange) {
            reason = "El mensaje cruzó el puente hacia Exchange 2 (coincide con '" + bridgePattern
                    + "'), pero ahí tampoco coincide con el patrón '" + pattern + "' de esta cola.";
        } else {
            reason = "La routing key '" + key + "' no coincide con el patrón '" + pattern + "' de esta cola.";
        }

        return new RoutingDecision(q.getName(), q.getLabel(), matched, reason);
    }
}
