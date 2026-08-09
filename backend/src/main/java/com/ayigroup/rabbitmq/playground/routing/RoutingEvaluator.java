package com.ayigroup.rabbitmq.playground.routing;

import com.ayigroup.rabbitmq.playground.scenario.ExchangeType;
import com.ayigroup.rabbitmq.playground.scenario.Scenario;

import java.util.List;
import java.util.Map;

public interface RoutingEvaluator {

    ExchangeType supports();

    List<RoutingDecision> evaluate(Scenario scenario, String routingKey, Map<String, String> headers);
}
