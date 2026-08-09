package com.ayigroup.rabbitmq.playground.routing;

import com.ayigroup.rabbitmq.playground.scenario.ExchangeType;
import com.ayigroup.rabbitmq.playground.scenario.QueueConfig;
import com.ayigroup.rabbitmq.playground.scenario.Scenario;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * El Default Exchange se comporta como un Direct donde el binding key
 * de cada cola es, automáticamente, su propio nombre.
 */
@Component
public class DefaultRoutingEvaluator implements RoutingEvaluator {

    @Override
    public ExchangeType supports() {
        return ExchangeType.DEFAULT;
    }

    @Override
    public List<RoutingDecision> evaluate(Scenario scenario, String routingKey, Map<String, String> headers) {
        String key = routingKey == null ? "" : routingKey;
        return scenario.getQueues().stream()
                .map(q -> toDecision(q, key))
                .toList();
    }

    private RoutingDecision toDecision(QueueConfig q, String routingKey) {
        boolean matched = q.getLabel().equals(routingKey);
        String reason = matched
                ? "El Default Exchange entrega el mensaje a la cola cuyo nombre coincide con la routing key ('" + routingKey + "')."
                : "El Default Exchange solo entrega a la cola '" + q.getLabel() + "' si la routing key es exactamente ese nombre.";
        return new RoutingDecision(q.getName(), q.getLabel(), matched, reason);
    }
}
