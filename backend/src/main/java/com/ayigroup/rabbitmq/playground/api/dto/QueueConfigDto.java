package com.ayigroup.rabbitmq.playground.api.dto;

import com.ayigroup.rabbitmq.playground.scenario.AckMode;
import com.ayigroup.rabbitmq.playground.scenario.BoundExchange;
import com.ayigroup.rabbitmq.playground.scenario.QueueConfig;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Data
@Builder
public class QueueConfigDto {
    private String name;
    private String label;
    private String bindingKey;
    private String pattern;
    private Map<String, String> headers;

    // Sin @JsonProperty explícito, la mangling por defecto de Jackson para
    // el getter/setter "getXMatch/setXMatch" (dos mayúsculas seguidas tras
    // "get") produce la clave JSON "xmatch" en vez de "xMatch", rompiendo
    // el round-trip con el frontend. Se fija el nombre explícitamente.
    @JsonProperty("xMatch")
    private String xMatch;

    private AckMode ackMode;

    /**
     * Solo relevante para EXCHANGE_TO_EXCHANGE y ALTERNATE_EXCHANGE. Se
     * expone para que el frontend sepa a qué exchange agrupar cada cola en
     * el diagrama y en el editor de bindings, pero es de solo lectura:
     * updateBindings() nunca reasigna este campo después de creado el escenario.
     */
    private BoundExchange boundExchange;

    public static QueueConfigDto from(QueueConfig q) {
        return QueueConfigDto.builder()
                .name(q.getName())
                .label(q.getLabel())
                .bindingKey(q.getBindingKey())
                .pattern(q.getPattern())
                .headers(q.getHeaders())
                .xMatch(q.getXMatch())
                .ackMode(q.getAckMode())
                .boundExchange(q.getBoundExchange())
                .build();
    }

    public QueueConfig toDomain() {
        return QueueConfig.builder()
                .name(name)
                .label(label)
                .bindingKey(bindingKey)
                .pattern(pattern)
                .headers(headers)
                .xMatch(xMatch)
                .ackMode(ackMode)
                .boundExchange(boundExchange)
                .build();
    }
}
