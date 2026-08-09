package com.ayigroup.rabbitmq.playground.history;

import com.ayigroup.rabbitmq.playground.routing.RoutingDecision;
import lombok.Builder;
import lombok.Data;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Data
@Builder
public class MessageRecord {

    public enum DeliveryStatus {
        PENDING, DELIVERED, ACKED, REJECTED
    }

    private String id;
    private String scenarioId;
    private long timestamp;
    private Object payload;
    private String routingKey;
    private Map<String, String> headers;
    private boolean mandatory;
    private java.util.List<RoutingDecision> routingResult;

    @Builder.Default
    private Map<String, DeliveryStatus> deliveries = new ConcurrentHashMap<>();

    private volatile boolean unrouted;
}
