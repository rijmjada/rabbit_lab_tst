package com.ayigroup.rabbitmq.playground.routing;

import com.ayigroup.rabbitmq.playground.scenario.ExchangeType;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class RoutingEvaluatorFactory {

    private final Map<ExchangeType, RoutingEvaluator> evaluators;

    public RoutingEvaluatorFactory(List<RoutingEvaluator> allEvaluators) {
        this.evaluators = allEvaluators.stream()
                .collect(Collectors.toMap(RoutingEvaluator::supports, Function.identity()));
    }

    public RoutingEvaluator forType(ExchangeType type) {
        RoutingEvaluator evaluator = evaluators.get(type);
        if (evaluator == null) {
            throw new IllegalStateException("No hay un evaluador de routing registrado para " + type);
        }
        return evaluator;
    }
}
