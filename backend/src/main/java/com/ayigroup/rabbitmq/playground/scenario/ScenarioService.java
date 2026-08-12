package com.ayigroup.rabbitmq.playground.scenario;

import com.ayigroup.rabbitmq.playground.history.MessageHistoryService;
import com.ayigroup.rabbitmq.playground.messaging.DynamicConsumerManager;
import com.ayigroup.rabbitmq.playground.topology.TopologyManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ScenarioService {

    private final TopologyManager topologyManager;
    private final DynamicConsumerManager consumerManager;
    private final MessageHistoryService historyService;

    private final Map<String, Scenario> scenarios = new ConcurrentHashMap<>();

    public Scenario create(ExchangeType type, String rawSessionId) {
        String sessionId = sanitize(rawSessionId);
        String typeSlug = typeSlug(type);
        String exchangeName = type == ExchangeType.DEFAULT
                ? ""
                : "edu.%s.%s.main".formatted(sessionId, typeSlug);
        boolean hasSecondaryExchange = type == ExchangeType.EXCHANGE_TO_EXCHANGE
                || type == ExchangeType.ALTERNATE_EXCHANGE
                || type == ExchangeType.DEAD_LETTER_EXCHANGE;
        String secondaryExchangeName = hasSecondaryExchange
                ? "edu.%s.%s.exchange2".formatted(sessionId, typeSlug)
                : null;

        List<QueueConfig> queues = ScenarioDefaults.build(type).stream()
                .map(q -> {
                    QueueConfig copy = q.copy();
                    copy.setName("edu.%s.%s.%s".formatted(sessionId, typeSlug, slug(copy.getLabel())));
                    return copy;
                })
                .collect(Collectors.toList());

        Scenario scenario = Scenario.builder()
                .id(UUID.randomUUID().toString())
                .sessionId(sessionId)
                .type(type)
                .status(ScenarioStatus.CREATED)
                .exchangeName(exchangeName)
                .secondaryExchangeName(secondaryExchangeName)
                .bridgeBindingKey(type == ExchangeType.EXCHANGE_TO_EXCHANGE ? ScenarioDefaults.defaultBridgeBindingKey() : null)
                .queues(queues)
                .createdAt(Instant.now())
                .lastActivityAt(Instant.now())
                .build();

        topologyManager.declare(scenario);
        consumerManager.start(scenario);
        scenario.setStatus(ScenarioStatus.RUNNING);
        scenarios.put(scenario.getId(), scenario);

        log.info("Escenario creado: id={}, tipo={}, exchange='{}'", scenario.getId(), type, exchangeName);
        return scenario;
    }

    public Scenario get(String id) {
        Scenario scenario = scenarios.get(id);
        if (scenario == null) {
            throw new ScenarioNotFoundException(id);
        }
        return scenario;
    }

    public Scenario reset(String id) {
        Scenario scenario = get(id);
        topologyManager.purge(scenario);
        historyService.clear(id);
        scenario.touch();
        return scenario;
    }

    public void delete(String id) {
        Scenario scenario = get(id);
        consumerManager.stop(scenario);
        topologyManager.delete(scenario);
        historyService.clear(id);
        scenarios.remove(id);
        log.info("Escenario eliminado: id={}", id);
    }

    public Scenario updateBindings(String id, List<QueueConfig> updates) {
        return updateBindings(id, updates, null);
    }

    /**
     * @param bridgeBindingKey solo relevante para EXCHANGE_TO_EXCHANGE; si es null se deja el binding
     *                         puente como estaba (no se toca ni se recrea).
     */
    public Scenario updateBindings(String id, List<QueueConfig> updates, String bridgeBindingKey) {
        Scenario scenario = get(id);
        List<QueueConfig> previous = ScenarioDefaults.copy(scenario.getQueues());
        String previousBridgeBindingKey = scenario.getBridgeBindingKey();

        Map<String, QueueConfig> byName = scenario.getQueues().stream()
                .collect(Collectors.toMap(QueueConfig::getName, q -> q));

        for (QueueConfig update : updates) {
            QueueConfig existing = byName.get(update.getName());
            if (existing == null) {
                continue; // se ignoran nombres de cola desconocidos, no se permite crear colas nuevas por esta vía
            }
            existing.setBindingKey(update.getBindingKey());
            existing.setPattern(update.getPattern());
            existing.setHeaders(update.getHeaders());
            existing.setXMatch(update.getXMatch());
            if (update.getAckMode() != null) {
                existing.setAckMode(update.getAckMode());
            }
            // boundExchange NO se toca acá a propósito: es topología fija desde la creación, no un binding.
        }

        if (bridgeBindingKey != null) {
            scenario.setBridgeBindingKey(bridgeBindingKey);
        }

        topologyManager.rebind(scenario, previous, previousBridgeBindingKey);
        scenario.touch();
        return scenario;
    }

    public List<Scenario> listIdleOlderThan(Instant threshold) {
        return scenarios.values().stream()
                .filter(s -> s.getLastActivityAt().isBefore(threshold))
                .collect(Collectors.toList());
    }

    private String sanitize(String raw) {
        if (raw == null || raw.isBlank()) {
            return UUID.randomUUID().toString().substring(0, 8);
        }
        String cleaned = raw.replaceAll("[^a-zA-Z0-9-]", "").toLowerCase();
        return cleaned.isBlank() ? UUID.randomUUID().toString().substring(0, 8) : cleaned.substring(0, Math.min(cleaned.length(), 24));
    }

    private String slug(String label) {
        return label.toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
    }

    /**
     * Segmento usado en los nombres reales de RabbitMQ (edu.<sesión>.<slug>...).
     * Los tipos con exchange secundario usan un slug corto en vez del nombre
     * completo del enum, para que el nombre no quede innecesariamente largo
     * en la UI.
     */
    private String typeSlug(ExchangeType type) {
        return switch (type) {
            case EXCHANGE_TO_EXCHANGE -> "bridge";
            case ALTERNATE_EXCHANGE -> "alt";
            case DEAD_LETTER_EXCHANGE -> "dlx";
            default -> type.name().toLowerCase();
        };
    }
}
