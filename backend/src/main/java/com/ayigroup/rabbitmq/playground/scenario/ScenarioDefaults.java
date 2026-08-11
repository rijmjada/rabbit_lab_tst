package com.ayigroup.rabbitmq.playground.scenario;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Configuración de demostración inicial para cada tipo de Exchange.
 * Estos valores son solo el punto de partida: el usuario puede
 * modificarlos desde la UI una vez creado el escenario.
 */
public final class ScenarioDefaults {

    private ScenarioDefaults() {
    }

    public static List<QueueConfig> build(ExchangeType type) {
        return switch (type) {
            case FANOUT -> List.of(
                    QueueConfig.builder().label("Cola A").build(),
                    QueueConfig.builder().label("Cola B").build(),
                    QueueConfig.builder().label("Cola C").build()
            );
            case DIRECT -> List.of(
                    QueueConfig.builder().label("Errores criticos").bindingKey("error").build(),
                    QueueConfig.builder().label("Logs info").bindingKey("info").build(),
                    QueueConfig.builder().label("Warnings").bindingKey("warning").build()
            );
            case TOPIC -> List.of(
                    QueueConfig.builder().label("Europa").pattern("eu.#").build(),
                    QueueConfig.builder().label("Clima global").pattern("#.temperatura").build(),
                    QueueConfig.builder().label("Estados Unidos").pattern("us.#").build()
            );
            case HEADERS -> List.of(
                    QueueConfig.builder()
                            .label("Facturas en espanol")
                            .xMatch("all")
                            .headers(mapOf("type", "invoice", "lang", "es"))
                            .build(),
                    QueueConfig.builder()
                            .label("Reportes en ingles")
                            .xMatch("all")
                            .headers(mapOf("type", "report", "lang", "en"))
                            .build(),
                    QueueConfig.builder()
                            .label("Facturas procesadas (any)")
                            .xMatch("any")
                            .headers(mapOf("type", "invoice", "status", "processed"))
                            .build()
            );
            case DEFAULT -> List.of(
                    QueueConfig.builder().label("pedidos").build(),
                    QueueConfig.builder().label("notificaciones").build()
            );
            case EXCHANGE_TO_EXCHANGE -> List.of(
                    QueueConfig.builder()
                            .label("Urgentes")
                            .pattern("pedido.urgente.#")
                            .boundExchange(BoundExchange.PRIMARY)
                            .build(),
                    QueueConfig.builder()
                            .label("Todos los pedidos")
                            .pattern("pedido.#")
                            .boundExchange(BoundExchange.SECONDARY)
                            .build(),
                    QueueConfig.builder()
                            .label("Cancelaciones")
                            .pattern("pedido.cancelado.*")
                            .boundExchange(BoundExchange.SECONDARY)
                            .build()
            );
            case ALTERNATE_EXCHANGE -> List.of(
                    QueueConfig.builder()
                            .label("Urgentes")
                            .bindingKey("urgente")
                            .boundExchange(BoundExchange.PRIMARY)
                            .build(),
                    QueueConfig.builder()
                            .label("Normales")
                            .bindingKey("normal")
                            .boundExchange(BoundExchange.PRIMARY)
                            .build(),
                    QueueConfig.builder()
                            .label("Huerfanos")
                            .boundExchange(BoundExchange.SECONDARY)
                            .build()
            );
        };
    }

    /** Patrón por defecto del puente Exchange 1 -> Exchange 2, solo para EXCHANGE_TO_EXCHANGE. */
    public static String defaultBridgeBindingKey() {
        return "pedido.#";
    }

    private static Map<String, String> mapOf(String... kv) {
        Map<String, String> map = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            map.put(kv[i], kv[i + 1]);
        }
        return map;
    }

    public static List<QueueConfig> copy(List<QueueConfig> queues) {
        List<QueueConfig> result = new ArrayList<>();
        for (QueueConfig q : queues) {
            result.add(q.copy());
        }
        return result;
    }
}
