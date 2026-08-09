package com.ayigroup.rabbitmq.playground.routing;

import com.ayigroup.rabbitmq.playground.scenario.ExchangeType;
import com.ayigroup.rabbitmq.playground.scenario.QueueConfig;
import com.ayigroup.rabbitmq.playground.scenario.Scenario;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Reproduce el algoritmo de coincidencia de Topic Exchange de AMQP:
 * las claves se dividen en segmentos separados por '.', '*' coincide
 * con exactamente una palabra y '#' con cero o más palabras.
 */
@Component
public class TopicRoutingEvaluator implements RoutingEvaluator {

    @Override
    public ExchangeType supports() {
        return ExchangeType.TOPIC;
    }

    @Override
    public List<RoutingDecision> evaluate(Scenario scenario, String routingKey, Map<String, String> headers) {
        String key = routingKey == null ? "" : routingKey;
        return scenario.getQueues().stream()
                .map(q -> toDecision(q, key))
                .toList();
    }

    private RoutingDecision toDecision(QueueConfig q, String routingKey) {
        String pattern = q.getPattern() == null ? "" : q.getPattern();
        boolean matched = TopicPatternMatcher.matches(pattern, routingKey);
        String reason = matched
                ? "El patron '" + pattern + "' coincide con la routing key '" + routingKey + "'."
                : "El patron '" + pattern + "' no coincide con la routing key '" + routingKey + "'. "
                        + "Revisa la cantidad de segmentos y el uso de '*' (una palabra) o '#' (cero o mas palabras).";
        return new RoutingDecision(q.getName(), q.getLabel(), matched, reason);
    }
}
