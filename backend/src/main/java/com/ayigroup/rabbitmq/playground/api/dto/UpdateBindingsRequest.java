package com.ayigroup.rabbitmq.playground.api.dto;

import lombok.Data;

import java.util.List;

@Data
public class UpdateBindingsRequest {
    private List<QueueConfigDto> queues;

    /** Solo para EXCHANGE_TO_EXCHANGE; null significa "no tocar el puente". */
    private String bridgeBindingKey;
}
