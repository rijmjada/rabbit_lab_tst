package com.ayigroup.rabbitmq.playground.api.dto;

import com.ayigroup.rabbitmq.playground.routing.RoutingDecision;
import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class PublishMessageResponse {
    private String messageId;
    private String resolvedRoutingKey;
    private List<RoutingDecision> routingResult;
}
