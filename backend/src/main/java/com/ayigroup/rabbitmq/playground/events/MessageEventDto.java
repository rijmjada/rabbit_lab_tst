package com.ayigroup.rabbitmq.playground.events;

import com.ayigroup.rabbitmq.playground.routing.RoutingDecision;
import com.ayigroup.rabbitmq.playground.scenario.BoundExchange;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Evento enviado por WebSocket a /topic/scenarios/{id}/events. Es un
 * único DTO "ancho" (con campos nulos según el tipo) para simplificar
 * el consumo desde el frontend: un solo tipo de mensaje a parsear.
 */
@Data
@Builder
public class MessageEventDto {

    private EventType type;
    private String scenarioId;
    private String messageId;
    private long timestamp;

    // MESSAGE_PUBLISHED
    private Object payload;
    private String routingKey;
    private Map<String, String> headers;

    /** Solo en MESSAGE_PUBLISHED de un escenario EXCHANGE_TO_EXCHANGE: a cuál de los dos exchanges entró. */
    private BoundExchange enteredExchange;

    // ROUTING_EVALUATED
    private List<RoutingDecision> routingResult;

    // MESSAGE_DELIVERED / MESSAGE_ACKED / MESSAGE_REJECTED
    private String queueName;
    private String queueLabel;

    // MESSAGE_RETURNED
    private String reason;

    public static MessageEventDto published(String scenarioId, String messageId, Object payload, String routingKey,
                                              Map<String, String> headers, BoundExchange enteredExchange) {
        return MessageEventDto.builder()
                .type(EventType.MESSAGE_PUBLISHED)
                .scenarioId(scenarioId)
                .messageId(messageId)
                .timestamp(Instant.now().toEpochMilli())
                .payload(payload)
                .routingKey(routingKey)
                .headers(headers)
                .enteredExchange(enteredExchange)
                .build();
    }

    public static MessageEventDto routingEvaluated(String scenarioId, String messageId, List<RoutingDecision> decisions) {
        return MessageEventDto.builder()
                .type(EventType.ROUTING_EVALUATED)
                .scenarioId(scenarioId)
                .messageId(messageId)
                .timestamp(Instant.now().toEpochMilli())
                .routingResult(decisions)
                .build();
    }

    public static MessageEventDto delivered(String scenarioId, String messageId, String queueName, String queueLabel) {
        return MessageEventDto.builder()
                .type(EventType.MESSAGE_DELIVERED)
                .scenarioId(scenarioId)
                .messageId(messageId)
                .timestamp(Instant.now().toEpochMilli())
                .queueName(queueName)
                .queueLabel(queueLabel)
                .build();
    }

    public static MessageEventDto acked(String scenarioId, String messageId, String queueName, String queueLabel) {
        return MessageEventDto.builder()
                .type(EventType.MESSAGE_ACKED)
                .scenarioId(scenarioId)
                .messageId(messageId)
                .timestamp(Instant.now().toEpochMilli())
                .queueName(queueName)
                .queueLabel(queueLabel)
                .build();
    }

    public static MessageEventDto returned(String scenarioId, String messageId, String reason) {
        return MessageEventDto.builder()
                .type(EventType.MESSAGE_RETURNED)
                .scenarioId(scenarioId)
                .messageId(messageId)
                .timestamp(Instant.now().toEpochMilli())
                .reason(reason)
                .build();
    }
}
