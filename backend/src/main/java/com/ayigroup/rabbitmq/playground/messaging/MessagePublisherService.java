package com.ayigroup.rabbitmq.playground.messaging;

import com.ayigroup.rabbitmq.playground.api.dto.PublishMessageRequest;
import com.ayigroup.rabbitmq.playground.api.dto.PublishMessageResponse;
import com.ayigroup.rabbitmq.playground.events.EventBroadcaster;
import com.ayigroup.rabbitmq.playground.events.MessageEventDto;
import com.ayigroup.rabbitmq.playground.history.MessageHistoryService;
import com.ayigroup.rabbitmq.playground.history.MessageRecord;
import com.ayigroup.rabbitmq.playground.routing.AlternateExchangeRoutingEvaluator;
import com.ayigroup.rabbitmq.playground.routing.DeadLetterRoutingEvaluator;
import com.ayigroup.rabbitmq.playground.routing.ExchangeToExchangeRoutingEvaluator;
import com.ayigroup.rabbitmq.playground.routing.RoutingDecision;
import com.ayigroup.rabbitmq.playground.routing.RoutingEvaluatorFactory;
import com.ayigroup.rabbitmq.playground.scenario.BoundExchange;
import com.ayigroup.rabbitmq.playground.scenario.ExchangeType;
import com.ayigroup.rabbitmq.playground.scenario.QueueConfig;
import com.ayigroup.rabbitmq.playground.scenario.Scenario;
import com.ayigroup.rabbitmq.playground.scenario.ScenarioService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessagePostProcessor;
import org.springframework.amqp.core.ReturnedMessage;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Orquesta la publicación de un mensaje como una pequeña secuencia de
 * eventos (publicado -> routing evaluado -> publicación real -> [ACK
 * o devuelto]) para que la animación en el frontend sea legible. La
 * decisión de enrutamiento se calcula con los evaluadores de
 * `routing/` y luego se corrobora con la entrega real que reportan
 * los consumidores de `DynamicConsumerManager`.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MessagePublisherService {

    private static final long ROUTING_EVALUATION_DELAY_MS = 350;
    private static final long PUBLISH_DELAY_MS = 500;

    private final RabbitTemplate rabbitTemplate;
    private final ScenarioService scenarioService;
    private final RoutingEvaluatorFactory evaluatorFactory;
    private final ExchangeToExchangeRoutingEvaluator exchangeToExchangeEvaluator;
    private final AlternateExchangeRoutingEvaluator alternateExchangeEvaluator;
    private final DeadLetterRoutingEvaluator deadLetterEvaluator;
    private final EventBroadcaster eventBroadcaster;
    private final MessageHistoryService historyService;
    private final ScheduledExecutorService eventScheduler;

    private static final String HEADER_SCENARIO_ID = "x-edu-scenario-id";
    private static final String HEADER_SIMULATE_REJECT = "x-edu-simulate-reject";

    @PostConstruct
    void registerReturnsCallback() {
        rabbitTemplate.setReturnsCallback(this::handleReturned);
    }

    public PublishMessageResponse publish(String scenarioId, PublishMessageRequest request) {
        Scenario scenario = scenarioService.get(scenarioId);
        scenario.touch();

        String messageId = UUID.randomUUID().toString();
        String displayRoutingKey = resolveDisplayRoutingKey(scenario, request);
        List<RoutingDecision> decisions = evaluateRouting(scenario, displayRoutingKey, request);

        MessageRecord record = MessageRecord.builder()
                .id(messageId)
                .scenarioId(scenarioId)
                .timestamp(Instant.now().toEpochMilli())
                .payload(request.getPayload())
                .routingKey(displayRoutingKey)
                .headers(request.getHeaders())
                .mandatory(request.isMandatory())
                .routingResult(decisions)
                .build();
        historyService.append(scenarioId, record);

        BoundExchange enteredExchange = scenario.getSecondaryExchangeName() != null
                ? resolveTargetExchange(request)
                : null;
        eventBroadcaster.broadcast(scenarioId,
                MessageEventDto.published(scenarioId, messageId, request.getPayload(), displayRoutingKey, request.getHeaders(), enteredExchange));

        eventScheduler.schedule(() ->
                        eventBroadcaster.broadcast(scenarioId, MessageEventDto.routingEvaluated(scenarioId, messageId, decisions)),
                ROUTING_EVALUATION_DELAY_MS, TimeUnit.MILLISECONDS);

        eventScheduler.schedule(() -> doPublish(scenario, messageId, displayRoutingKey, request),
                PUBLISH_DELAY_MS, TimeUnit.MILLISECONDS);

        return PublishMessageResponse.builder()
                .messageId(messageId)
                .resolvedRoutingKey(displayRoutingKey)
                .routingResult(decisions)
                .build();
    }

    /**
     * Para casi todos los tipos, la routing key real que entiende
     * RabbitMQ es la misma que se muestra en la UI. La única
     * excepción es el Default Exchange: ahí el usuario elige una cola
     * por su nombre amigable (label), pero la routing key real debe
     * ser el nombre completo de la cola declarado en el broker.
     */
    private String resolveDisplayRoutingKey(Scenario scenario, PublishMessageRequest request) {
        if (scenario.getType() == ExchangeType.DEFAULT) {
            return request.getTargetQueue() == null ? "" : request.getTargetQueue();
        }
        return request.getRoutingKey() == null ? "" : request.getRoutingKey();
    }

    private List<RoutingDecision> evaluateRouting(Scenario scenario, String displayRoutingKey, PublishMessageRequest request) {
        if (scenario.getType() == ExchangeType.EXCHANGE_TO_EXCHANGE) {
            return exchangeToExchangeEvaluator.evaluate(scenario, resolveTargetExchange(request), displayRoutingKey);
        }
        if (scenario.getType() == ExchangeType.ALTERNATE_EXCHANGE) {
            return alternateExchangeEvaluator.evaluate(scenario, resolveTargetExchange(request), displayRoutingKey);
        }
        if (scenario.getType() == ExchangeType.DEAD_LETTER_EXCHANGE) {
            return deadLetterEvaluator.evaluate(scenario, resolveTargetExchange(request), displayRoutingKey);
        }
        return evaluatorFactory.forType(scenario.getType()).evaluate(scenario, displayRoutingKey, request.getHeaders());
    }

    /** Null (no se especificó a qué exchange publicar) se trata como PRIMARY. */
    private BoundExchange resolveTargetExchange(PublishMessageRequest request) {
        return request.getTargetExchange() == null ? BoundExchange.PRIMARY : request.getTargetExchange();
    }

    private void doPublish(Scenario scenario, String messageId, String displayRoutingKey, PublishMessageRequest request) {
        String amqpExchange = resolveAmqpExchange(scenario, request);
        String amqpRoutingKey = scenario.getType() == ExchangeType.DEFAULT
                ? resolveRealQueueName(scenario, displayRoutingKey)
                : displayRoutingKey;

        MessagePostProcessor processor = message -> {
            var props = message.getMessageProperties();
            props.setCorrelationId(messageId);
            props.setContentType("application/json");
            props.setDeliveryMode(request.isPersistent() ? MessageDeliveryMode.PERSISTENT : MessageDeliveryMode.NON_PERSISTENT);
            if (request.getHeaders() != null) {
                request.getHeaders().forEach(props::setHeader);
            }
            props.setHeader(HEADER_SCENARIO_ID, scenario.getId());
            if (request.isSimulateFailure()) {
                props.setHeader(HEADER_SIMULATE_REJECT, true);
            }
            return message;
        };

        try {
            rabbitTemplate.convertAndSend(amqpExchange, amqpRoutingKey, request.getPayload(), processor);
        } catch (Exception e) {
            log.error("Error publicando mensaje {} en escenario {}: {}", messageId, scenario.getId(), e.getMessage());
        }
    }

    /** Para casi todos los tipos es el único exchange del escenario; los que tienen exchange secundario eligen según targetExchange. */
    private String resolveAmqpExchange(Scenario scenario, PublishMessageRequest request) {
        if (scenario.getSecondaryExchangeName() != null && resolveTargetExchange(request) == BoundExchange.SECONDARY) {
            return scenario.getSecondaryExchangeName();
        }
        return scenario.getExchangeName();
    }

    private String resolveRealQueueName(Scenario scenario, String label) {
        return scenario.getQueues().stream()
                .filter(q -> q.getLabel().equals(label))
                .map(QueueConfig::getName)
                .findFirst()
                .orElse(label);
    }

    private void handleReturned(ReturnedMessage returned) {
        Message message = returned.getMessage();
        String messageId = message.getMessageProperties().getCorrelationId();
        Object scenarioIdHeader = message.getMessageProperties().getHeaders().get(HEADER_SCENARIO_ID);
        if (messageId == null || scenarioIdHeader == null) {
            return;
        }
        String scenarioId = scenarioIdHeader.toString();
        historyService.markUnrouted(scenarioId, messageId);
        String reason = "RabbitMQ no encontró ninguna cola vinculada que coincidiera; el mensaje fue devuelto (mandatory) en vez de descartarse.";
        eventBroadcaster.broadcast(scenarioId, MessageEventDto.returned(scenarioId, messageId, reason));
    }
}
