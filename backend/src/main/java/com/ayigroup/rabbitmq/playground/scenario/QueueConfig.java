package com.ayigroup.rabbitmq.playground.scenario;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.HashMap;
import java.util.Map;

/**
 * Configuración de una cola dentro de un escenario. Según el tipo de
 * Exchange del escenario, solo algunos campos son relevantes:
 * - FANOUT: ninguno (se ignora la routing key).
 * - DIRECT / DEFAULT: bindingKey.
 * - TOPIC: pattern (con comodines * y #).
 * - HEADERS: headers + xMatch ("all" | "any").
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QueueConfig {

    /** Nombre real de la cola declarado en RabbitMQ. */
    private String name;

    /** Etiqueta amigable para mostrar en la UI. */
    private String label;

    private String bindingKey;

    private String pattern;

    @Builder.Default
    private Map<String, String> headers = new HashMap<>();

    /** "all" o "any". */
    private String xMatch;

    @Builder.Default
    private AckMode ackMode = AckMode.AUTO;

    /**
     * Solo relevante para EXCHANGE_TO_EXCHANGE: a cuál de los dos
     * exchanges encadenados pertenece esta cola. Se fija al crear el
     * escenario y no se vuelve a tocar (no es un "binding" editable,
     * es la topología misma).
     */
    @Builder.Default
    private BoundExchange boundExchange = BoundExchange.PRIMARY;

    public QueueConfig copy() {
        return QueueConfig.builder()
                .name(name)
                .label(label)
                .bindingKey(bindingKey)
                .pattern(pattern)
                .headers(headers == null ? new HashMap<>() : new HashMap<>(headers))
                .xMatch(xMatch)
                .ackMode(ackMode)
                .boundExchange(boundExchange)
                .build();
    }
}
