package com.ayigroup.rabbitmq.playground.routing;

import com.ayigroup.rabbitmq.playground.scenario.ExchangeType;
import com.ayigroup.rabbitmq.playground.scenario.QueueConfig;
import com.ayigroup.rabbitmq.playground.scenario.Scenario;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Component
public class HeadersRoutingEvaluator implements RoutingEvaluator {

    @Override
    public ExchangeType supports() {
        return ExchangeType.HEADERS;
    }

    @Override
    public List<RoutingDecision> evaluate(Scenario scenario, String routingKey, Map<String, String> headers) {
        Map<String, String> messageHeaders = headers == null ? Map.of() : headers;
        return scenario.getQueues().stream()
                .map(q -> toDecision(q, messageHeaders))
                .toList();
    }

    private RoutingDecision toDecision(QueueConfig q, Map<String, String> messageHeaders) {
        Map<String, String> required = q.getHeaders() == null ? Map.of() : q.getHeaders();
        boolean matchAny = "any".equalsIgnoreCase(q.getXMatch());

        if (required.isEmpty()) {
            return new RoutingDecision(q.getName(), q.getLabel(), false,
                    "Esta cola no tiene cabeceras configuradas en su binding.");
        }

        List<String> matchedKeys = required.entrySet().stream()
                .filter(e -> Objects.equals(e.getValue(), messageHeaders.get(e.getKey())))
                .map(e -> e.getKey() + "=" + e.getValue())
                .collect(Collectors.toList());
        List<String> missingKeys = required.entrySet().stream()
                .filter(e -> !Objects.equals(e.getValue(), messageHeaders.get(e.getKey())))
                .map(e -> e.getKey() + "=" + e.getValue())
                .collect(Collectors.toList());

        boolean matched = matchAny ? !matchedKeys.isEmpty() : missingKeys.isEmpty();

        String mode = matchAny ? "x-match=any (basta con una coincidencia)" : "x-match=all (deben coincidir todas)";
        StringBuilder reason = new StringBuilder(mode).append(". ");
        if (!matchedKeys.isEmpty()) {
            reason.append("Coinciden: ").append(String.join(", ", matchedKeys)).append(". ");
        }
        if (!missingKeys.isEmpty()) {
            reason.append("No coinciden: ").append(String.join(", ", missingKeys)).append(".");
        }
        return new RoutingDecision(q.getName(), q.getLabel(), matched, reason.toString().trim());
    }
}
