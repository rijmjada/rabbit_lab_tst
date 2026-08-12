package com.ayigroup.rabbitmq.playground.api.dto;

import com.ayigroup.rabbitmq.playground.scenario.BoundExchange;
import lombok.Data;

import java.util.Map;

@Data
public class PublishMessageRequest {

    /** Cuerpo del mensaje, tal cual lo escribió el usuario (se serializa a JSON). */
    private Map<String, Object> payload;

    /** Usada por Fanout (opcional/ignorada), Direct, Topic y EXCHANGE_TO_EXCHANGE. */
    private String routingKey;

    /** Cabeceras del mensaje, relevantes sobre todo para Headers Exchange. */
    private Map<String, String> headers;

    /** Solo para el Default Exchange: nombre (label) de la cola destino. */
    private String targetQueue;

    /** Solo para EXCHANGE_TO_EXCHANGE, ALTERNATE_EXCHANGE y DEAD_LETTER_EXCHANGE: a cuál de los dos exchanges se publica. Null equivale a PRIMARY. */
    private BoundExchange targetExchange;

    /** Solo para DEAD_LETTER_EXCHANGE: si el consumidor debe rechazar el mensaje (simula un fallo de procesamiento) en vez de confirmarlo. */
    private boolean simulateFailure = false;

    private boolean mandatory = true;

    private boolean persistent = true;
}
