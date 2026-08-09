package com.ayigroup.rabbitmq.playground.scenario;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Scenario {

    private String id;
    private String sessionId;
    private ExchangeType type;
    private ScenarioStatus status;

    /** Cadena vacía para el Default Exchange. */
    private String exchangeName;

    /** Solo para EXCHANGE_TO_EXCHANGE: el segundo exchange de la cadena. */
    private String secondaryExchangeName;

    /** Solo para EXCHANGE_TO_EXCHANGE: binding key del puente exchangeName -> secondaryExchangeName. */
    private String bridgeBindingKey;

    private List<QueueConfig> queues;

    private Instant createdAt;
    private volatile Instant lastActivityAt;

    public void touch() {
        this.lastActivityAt = Instant.now();
    }
}
