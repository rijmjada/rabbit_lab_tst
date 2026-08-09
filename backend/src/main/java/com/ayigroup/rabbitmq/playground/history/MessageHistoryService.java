package com.ayigroup.rabbitmq.playground.history;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.function.Consumer;

/**
 * Historial en memoria de mensajes por escenario. Alcanza y sobra
 * para una herramienta didáctica de un solo nodo; no se persiste en
 * base de datos a propósito para mantener el proyecto simple.
 */
@Service
public class MessageHistoryService {

    private static final int MAX_PER_SCENARIO = 50;

    private final Map<String, ConcurrentLinkedDeque<MessageRecord>> store = new ConcurrentHashMap<>();

    public void append(String scenarioId, MessageRecord record) {
        ConcurrentLinkedDeque<MessageRecord> deque = store.computeIfAbsent(scenarioId, k -> new ConcurrentLinkedDeque<>());
        deque.addFirst(record);
        while (deque.size() > MAX_PER_SCENARIO) {
            deque.removeLast();
        }
    }

    public List<MessageRecord> list(String scenarioId) {
        ConcurrentLinkedDeque<MessageRecord> deque = store.get(scenarioId);
        if (deque == null) {
            return Collections.emptyList();
        }
        return new ArrayList<>(deque);
    }

    public void markDelivered(String scenarioId, String messageId, String queueName) {
        update(scenarioId, messageId, r -> r.getDeliveries().put(queueName, MessageRecord.DeliveryStatus.DELIVERED));
    }

    public void markAcked(String scenarioId, String messageId, String queueName) {
        update(scenarioId, messageId, r -> r.getDeliveries().put(queueName, MessageRecord.DeliveryStatus.ACKED));
    }

    public void markRejected(String scenarioId, String messageId, String queueName) {
        update(scenarioId, messageId, r -> r.getDeliveries().put(queueName, MessageRecord.DeliveryStatus.REJECTED));
    }

    public void markUnrouted(String scenarioId, String messageId) {
        update(scenarioId, messageId, r -> r.setUnrouted(true));
    }

    public void clear(String scenarioId) {
        store.remove(scenarioId);
    }

    private void update(String scenarioId, String messageId, Consumer<MessageRecord> mutator) {
        ConcurrentLinkedDeque<MessageRecord> deque = store.get(scenarioId);
        if (deque == null) {
            return;
        }
        deque.stream()
                .filter(r -> r.getId().equals(messageId))
                .findFirst()
                .ifPresent(mutator);
    }
}
