package com.ayigroup.rabbitmq.playground.routing;

import com.ayigroup.rabbitmq.playground.scenario.ExchangeType;
import com.ayigroup.rabbitmq.playground.scenario.QueueConfig;
import com.ayigroup.rabbitmq.playground.scenario.Scenario;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class FanoutRoutingEvaluator implements RoutingEvaluator {

    @Override
    public ExchangeType supports() {
        return ExchangeType.FANOUT;
    }

    @Override
    public List<RoutingDecision> evaluate(Scenario scenario, String routingKey, Map<String, String> headers) {
        return scenario.getQueues().stream()
                .map(this::toDecision)
                .toList();
    }

    private RoutingDecision toDecision(QueueConfig q) {
        return new RoutingDecision(q.getName(), q.getLabel(), true,
                "Fanout entrega el mensaje a todas las colas vinculadas, sin importar la routing key.");
    }
}
