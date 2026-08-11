package com.ayigroup.rabbitmq.playground.api.dto;

import com.ayigroup.rabbitmq.playground.scenario.ExchangeType;
import com.ayigroup.rabbitmq.playground.scenario.Scenario;
import com.ayigroup.rabbitmq.playground.scenario.ScenarioStatus;
import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class ScenarioResponse {
    private String id;
    private ExchangeType type;
    private ScenarioStatus status;
    private String exchangeName;

    /** secondaryExchangeName: EXCHANGE_TO_EXCHANGE y ALTERNATE_EXCHANGE. bridgeBindingKey: solo EXCHANGE_TO_EXCHANGE. */
    private String secondaryExchangeName;
    private String bridgeBindingKey;

    private List<QueueConfigDto> queues;

    public static ScenarioResponse from(Scenario scenario) {
        return ScenarioResponse.builder()
                .id(scenario.getId())
                .type(scenario.getType())
                .status(scenario.getStatus())
                .exchangeName(scenario.getExchangeName())
                .secondaryExchangeName(scenario.getSecondaryExchangeName())
                .bridgeBindingKey(scenario.getBridgeBindingKey())
                .queues(scenario.getQueues().stream().map(QueueConfigDto::from).toList())
                .build();
    }
}
