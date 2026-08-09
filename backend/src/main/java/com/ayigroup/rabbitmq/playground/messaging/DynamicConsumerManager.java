package com.ayigroup.rabbitmq.playground.messaging;

import com.ayigroup.rabbitmq.playground.events.EventBroadcaster;
import com.ayigroup.rabbitmq.playground.events.MessageEventDto;
import com.ayigroup.rabbitmq.playground.history.MessageHistoryService;
import com.ayigroup.rabbitmq.playground.scenario.AckMode;
import com.ayigroup.rabbitmq.playground.scenario.QueueConfig;
import com.ayigroup.rabbitmq.playground.scenario.Scenario;
import com.rabbitmq.client.Channel;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.AcknowledgeMode;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.listener.SimpleMessageListenerContainer;
import org.springframework.amqp.rabbit.listener.api.ChannelAwareMessageListener;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Crea y destruye consumidores reales (uno por cola) para cada
 * escenario. Los consumidores confirman de verdad los mensajes al
 * broker; lo único "simulado" es una pequeña demora antes del ACK
 * para que el procesamiento se pueda ver en la animación.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DynamicConsumerManager {

    private static final long AUTO_ACK_DELAY_MS = 250;
    private static final long MANUAL_ACK_DELAY_MS = 900;

    private final ConnectionFactory connectionFactory;
    private final EventBroadcaster eventBroadcaster;
    private final MessageHistoryService historyService;
    private final ScheduledExecutorService eventScheduler;

    private final Map<String, List<SimpleMessageListenerContainer>> containersByScenario = new ConcurrentHashMap<>();

    public void start(Scenario scenario) {
        List<SimpleMessageListenerContainer> containers = new ArrayList<>();
        for (QueueConfig queueConfig : scenario.getQueues()) {
            containers.add(startContainer(scenario, queueConfig));
        }
        containersByScenario.put(scenario.getId(), containers);
    }

    public void stop(Scenario scenario) {
        List<SimpleMessageListenerContainer> containers = containersByScenario.remove(scenario.getId());
        if (containers == null) {
            return;
        }
        containers.forEach(SimpleMessageListenerContainer::stop);
    }

    private SimpleMessageListenerContainer startContainer(Scenario scenario, QueueConfig queueConfig) {
        SimpleMessageListenerContainer container = new SimpleMessageListenerContainer(connectionFactory);
        container.setQueueNames(queueConfig.getName());
        container.setAcknowledgeMode(AcknowledgeMode.MANUAL);
        container.setPrefetchCount(20);
        container.setMessageListener((ChannelAwareMessageListener) (message, channel) ->
                handleDelivery(scenario.getId(), queueConfig, message, channel));
        container.start();
        return container;
    }

    private void handleDelivery(String scenarioId, QueueConfig queueConfig, Message message, Channel channel) {
        String messageId = message.getMessageProperties().getCorrelationId();
        long deliveryTag = message.getMessageProperties().getDeliveryTag();
        String queueName = queueConfig.getName();
        String queueLabel = queueConfig.getLabel();

        if (messageId == null) {
            // Mensaje publicado fuera de esta aplicación (por ejemplo, desde la consola de management).
            ackQuietly(channel, deliveryTag);
            return;
        }

        historyService.markDelivered(scenarioId, messageId, queueName);
        eventBroadcaster.broadcast(scenarioId, MessageEventDto.delivered(scenarioId, messageId, queueName, queueLabel));

        long delay = queueConfig.getAckMode() == AckMode.MANUAL ? MANUAL_ACK_DELAY_MS : AUTO_ACK_DELAY_MS;
        eventScheduler.schedule(() -> {
            ackQuietly(channel, deliveryTag);
            historyService.markAcked(scenarioId, messageId, queueName);
            eventBroadcaster.broadcast(scenarioId, MessageEventDto.acked(scenarioId, messageId, queueName, queueLabel));
        }, delay, TimeUnit.MILLISECONDS);
    }

    private void ackQuietly(Channel channel, long deliveryTag) {
        try {
            channel.basicAck(deliveryTag, false);
        } catch (IOException e) {
            log.warn("No se pudo confirmar (ACK) el mensaje con deliveryTag {}: {}", deliveryTag, e.getMessage());
        }
    }
}
