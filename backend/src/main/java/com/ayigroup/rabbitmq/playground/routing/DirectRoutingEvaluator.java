package com.ayigroup.rabbitmq.playground.routing;

import com.ayigroup.rabbitmq.playground.scenario.ExchangeType;
import com.ayigroup.rabbitmq.playground.scenario.QueueConfig;
import com.ayigroup.rabbitmq.playground.scenario.Scenario;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Objects;

@Component
public class DirectRoutingEvaluator implements RoutingEvaluator {

    @Override
    public ExchangeType supports() {
        return ExchangeType.DIRECT;
    }

    @Override
    public List<RoutingDecision> evaluate(Scenario scenario, String routingKey, Map<String, String> headers) {
        String key = routingKey == null ? "" : routingKey;
        return scenario.getQueues().stream()
                .map(q -> toDecision(q, key))
                .toList();
    }

    private RoutingDecision toDecision(QueueConfig q, String routingKey) {
        String bindingKey = q.getBindingKey() == null ? "" : q.getBindingKey();
        boolean matched = Objects.equals(bindingKey, routingKey);
        String reason = matched
                ? "La routing key '" + routingKey + "' coincide exactamente con el binding key '" + bindingKey + "'."
                : "La routing key '" + routingKey + "' no coincide con el binding key '" + bindingKey + "' (se exige coincidencia exacta).";
        return new RoutingDecision(q.getName(), q.getLabel(), matched, reason);
    }
}
