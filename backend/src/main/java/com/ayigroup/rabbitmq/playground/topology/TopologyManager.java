package com.ayigroup.rabbitmq.playground.topology;

import com.ayigroup.rabbitmq.playground.scenario.BoundExchange;
import com.ayigroup.rabbitmq.playground.scenario.ExchangeType;
import com.ayigroup.rabbitmq.playground.scenario.QueueConfig;
import com.ayigroup.rabbitmq.playground.scenario.Scenario;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Exchange;
import org.springframework.amqp.core.ExchangeBuilder;
import org.springframework.amqp.core.FanoutExchange;
import org.springframework.amqp.core.HeadersExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Único componente que habla directamente con RabbitMQ para declarar,
 * modificar y borrar la topología real (exchange, colas y bindings)
 * de cada escenario.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TopologyManager {

    private final RabbitAdmin rabbitAdmin;

    public void declare(Scenario scenario) {
        if (scenario.getType() == ExchangeType.EXCHANGE_TO_EXCHANGE) {
            declareExchangeToExchange(scenario);
            return;
        }
        if (scenario.getType() == ExchangeType.ALTERNATE_EXCHANGE) {
            declareAlternateExchange(scenario);
            return;
        }
        if (scenario.getType() != ExchangeType.DEFAULT) {
            Exchange exchange = buildExchange(scenario.getType(), scenario.getExchangeName());
            rabbitAdmin.declareExchange(exchange);
        }
        for (QueueConfig q : scenario.getQueues()) {
            rabbitAdmin.declareQueue(QueueBuilder.durable(q.getName()).build());
            if (scenario.getType() != ExchangeType.DEFAULT) {
                rabbitAdmin.declareBinding(buildBinding(scenario, q));
            }
        }
        log.info("Escenario {} ({}) declarado: exchange='{}', colas={}", scenario.getId(), scenario.getType(),
                scenario.getExchangeName(), scenario.getQueues().size());
    }

    /**
     * Quita los bindings que reflejaban la configuración anterior y
     * declara los nuevos, sin tocar las colas (mismo nombre, mismo
     * contenido).
     *
     * @param previousBridgeBindingKey solo se usa para EXCHANGE_TO_EXCHANGE (binding key
     *                                 del puente antes de este cambio, para poder removerlo).
     */
    public void rebind(Scenario scenario, List<QueueConfig> previousQueues, String previousBridgeBindingKey) {
        if (scenario.getType() == ExchangeType.DEFAULT) {
            return; // el Default Exchange no admite bindings manuales
        }
        if (scenario.getType() == ExchangeType.EXCHANGE_TO_EXCHANGE) {
            rebindExchangeToExchange(scenario, previousQueues, previousBridgeBindingKey);
            return;
        }
        if (scenario.getType() == ExchangeType.ALTERNATE_EXCHANGE) {
            rebindAlternateExchange(scenario, previousQueues);
            return;
        }
        for (QueueConfig previous : previousQueues) {
            removeBindingQuietly(scenario, previous);
        }
        for (QueueConfig current : scenario.getQueues()) {
            rabbitAdmin.declareBinding(buildBinding(scenario, current));
        }
        log.info("Escenario {} re-configurado con nuevos bindings", scenario.getId());
    }

    public void purge(Scenario scenario) {
        scenario.getQueues().forEach(q -> rabbitAdmin.purgeQueue(q.getName(), false));
    }

    public void delete(Scenario scenario) {
        if (scenario.getType() == ExchangeType.EXCHANGE_TO_EXCHANGE) {
            deleteExchangeToExchange(scenario);
            return;
        }
        if (scenario.getType() == ExchangeType.ALTERNATE_EXCHANGE) {
            deleteAlternateExchange(scenario);
            return;
        }
        for (QueueConfig q : scenario.getQueues()) {
            removeBindingQuietly(scenario, q);
            rabbitAdmin.deleteQueue(q.getName());
        }
        if (scenario.getType() != ExchangeType.DEFAULT) {
            rabbitAdmin.deleteExchange(scenario.getExchangeName());
        }
        log.info("Escenario {} eliminado por completo", scenario.getId());
    }

    private void removeBindingQuietly(Scenario scenario, QueueConfig q) {
        removeBindingQuietly(buildBinding(scenario, q), q.getName());
    }

    private void removeBindingQuietly(Binding binding, String label) {
        try {
            rabbitAdmin.removeBinding(binding);
        } catch (Exception e) {
            log.debug("No se pudo remover binding previo de {}: {}", label, e.getMessage());
        }
    }

    private Exchange buildExchange(ExchangeType type, String name) {
        return switch (type) {
            case FANOUT -> new FanoutExchange(name, true, false);
            case DIRECT -> new DirectExchange(name, true, false);
            case TOPIC -> new TopicExchange(name, true, false);
            case HEADERS -> new HeadersExchange(name, true, false);
            case DEFAULT -> throw new IllegalStateException("El Default Exchange no se declara explícitamente");
            case EXCHANGE_TO_EXCHANGE -> throw new IllegalStateException(
                    "EXCHANGE_TO_EXCHANGE declara dos exchanges propios, ver declareExchangeToExchange()");
            case ALTERNATE_EXCHANGE -> throw new IllegalStateException(
                    "ALTERNATE_EXCHANGE declara dos exchanges propios, ver declareAlternateExchange()");
        };
    }

    private Binding buildBinding(Scenario scenario, QueueConfig q) {
        Queue queue = new Queue(q.getName(), true);
        return switch (scenario.getType()) {
            case FANOUT -> BindingBuilder.bind(queue).to(new FanoutExchange(scenario.getExchangeName()));
            case DIRECT -> BindingBuilder.bind(queue)
                    .to(new DirectExchange(scenario.getExchangeName()))
                    .with(nullToEmpty(q.getBindingKey()));
            case TOPIC -> BindingBuilder.bind(queue)
                    .to(new TopicExchange(scenario.getExchangeName()))
                    .with(nullToEmpty(q.getPattern()));
            case HEADERS -> buildHeadersBinding(scenario, q, queue);
            case DEFAULT -> throw new IllegalStateException("El Default Exchange no admite bindings manuales");
            case EXCHANGE_TO_EXCHANGE -> throw new IllegalStateException(
                    "EXCHANGE_TO_EXCHANGE resuelve el binding de cada cola según boundExchange, ver queueBinding()");
            case ALTERNATE_EXCHANGE -> throw new IllegalStateException(
                    "ALTERNATE_EXCHANGE resuelve el binding de cada cola según boundExchange, ver alternateQueueBinding()");
        };
    }

    // ---------- EXCHANGE_TO_EXCHANGE ----------

    private void declareExchangeToExchange(Scenario scenario) {
        TopicExchange primary = new TopicExchange(scenario.getExchangeName(), true, false);
        TopicExchange secondary = new TopicExchange(scenario.getSecondaryExchangeName(), true, false);
        rabbitAdmin.declareExchange(primary);
        rabbitAdmin.declareExchange(secondary);

        for (QueueConfig q : scenario.getQueues()) {
            rabbitAdmin.declareQueue(QueueBuilder.durable(q.getName()).build());
            rabbitAdmin.declareBinding(queueBinding(q, primary, secondary));
        }
        rabbitAdmin.declareBinding(bridgeBinding(scenario, primary, secondary));

        log.info("Escenario {} (EXCHANGE_TO_EXCHANGE) declarado: exchange1='{}', exchange2='{}', puente='{}', colas={}",
                scenario.getId(), scenario.getExchangeName(), scenario.getSecondaryExchangeName(),
                scenario.getBridgeBindingKey(), scenario.getQueues().size());
    }

    private void rebindExchangeToExchange(Scenario scenario, List<QueueConfig> previousQueues, String previousBridgeBindingKey) {
        TopicExchange primary = new TopicExchange(scenario.getExchangeName());
        TopicExchange secondary = new TopicExchange(scenario.getSecondaryExchangeName());

        for (QueueConfig previous : previousQueues) {
            removeBindingQuietly(queueBinding(previous, primary, secondary), previous.getName());
        }
        removeBindingQuietly(bridgeBindingWithKey(primary, secondary, previousBridgeBindingKey), "puente");

        for (QueueConfig current : scenario.getQueues()) {
            rabbitAdmin.declareBinding(queueBinding(current, primary, secondary));
        }
        rabbitAdmin.declareBinding(bridgeBinding(scenario, primary, secondary));

        log.info("Escenario {} (EXCHANGE_TO_EXCHANGE) re-configurado con nuevos bindings", scenario.getId());
    }

    private void deleteExchangeToExchange(Scenario scenario) {
        TopicExchange primary = new TopicExchange(scenario.getExchangeName());
        TopicExchange secondary = new TopicExchange(scenario.getSecondaryExchangeName());

        removeBindingQuietly(bridgeBinding(scenario, primary, secondary), "puente");
        for (QueueConfig q : scenario.getQueues()) {
            removeBindingQuietly(queueBinding(q, primary, secondary), q.getName());
            rabbitAdmin.deleteQueue(q.getName());
        }
        rabbitAdmin.deleteExchange(scenario.getExchangeName());
        rabbitAdmin.deleteExchange(scenario.getSecondaryExchangeName());

        log.info("Escenario {} (EXCHANGE_TO_EXCHANGE) eliminado por completo", scenario.getId());
    }

    private Binding queueBinding(QueueConfig q, TopicExchange primary, TopicExchange secondary) {
        TopicExchange owner = q.getBoundExchange() == BoundExchange.SECONDARY ? secondary : primary;
        return BindingBuilder.bind(new Queue(q.getName(), true)).to(owner).with(nullToEmpty(q.getPattern()));
    }

    /** El binding puente en sí: Exchange 2 "escucha" a Exchange 1 con el patrón del puente. */
    private Binding bridgeBinding(Scenario scenario, TopicExchange primary, TopicExchange secondary) {
        return bridgeBindingWithKey(primary, secondary, scenario.getBridgeBindingKey());
    }

    private Binding bridgeBindingWithKey(TopicExchange primary, TopicExchange secondary, String bridgePattern) {
        return BindingBuilder.bind(secondary).to(primary).with(nullToEmpty(bridgePattern));
    }

    // ---------- ALTERNATE_EXCHANGE ----------

    private void declareAlternateExchange(Scenario scenario) {
        FanoutExchange alternate = new FanoutExchange(scenario.getSecondaryExchangeName(), true, false);
        rabbitAdmin.declareExchange(alternate);

        DirectExchange main = ExchangeBuilder.directExchange(scenario.getExchangeName())
                .durable(true)
                .alternate(scenario.getSecondaryExchangeName())
                .build();
        rabbitAdmin.declareExchange(main);

        for (QueueConfig q : scenario.getQueues()) {
            rabbitAdmin.declareQueue(QueueBuilder.durable(q.getName()).build());
            rabbitAdmin.declareBinding(alternateQueueBinding(q, main, alternate));
        }

        log.info("Escenario {} (ALTERNATE_EXCHANGE) declarado: exchange='{}', alternativo='{}', colas={}",
                scenario.getId(), scenario.getExchangeName(), scenario.getSecondaryExchangeName(), scenario.getQueues().size());
    }

    private void rebindAlternateExchange(Scenario scenario, List<QueueConfig> previousQueues) {
        DirectExchange main = new DirectExchange(scenario.getExchangeName());
        FanoutExchange alternate = new FanoutExchange(scenario.getSecondaryExchangeName());

        // A diferencia del puente de EXCHANGE_TO_EXCHANGE, acá no hay nada
        // análogo a una "binding key del puente" que remover/recrear: el
        // argumento alternate-exchange se fija una sola vez al declarar el
        // exchange principal y no se vuelve a tocar. Solo se re-bindean colas.
        for (QueueConfig previous : previousQueues) {
            removeBindingQuietly(alternateQueueBinding(previous, main, alternate), previous.getName());
        }
        for (QueueConfig current : scenario.getQueues()) {
            rabbitAdmin.declareBinding(alternateQueueBinding(current, main, alternate));
        }

        log.info("Escenario {} (ALTERNATE_EXCHANGE) re-configurado con nuevos bindings", scenario.getId());
    }

    private void deleteAlternateExchange(Scenario scenario) {
        DirectExchange main = new DirectExchange(scenario.getExchangeName());
        FanoutExchange alternate = new FanoutExchange(scenario.getSecondaryExchangeName());

        for (QueueConfig q : scenario.getQueues()) {
            removeBindingQuietly(alternateQueueBinding(q, main, alternate), q.getName());
            rabbitAdmin.deleteQueue(q.getName());
        }
        rabbitAdmin.deleteExchange(scenario.getExchangeName());
        rabbitAdmin.deleteExchange(scenario.getSecondaryExchangeName());

        log.info("Escenario {} (ALTERNATE_EXCHANGE) eliminado por completo", scenario.getId());
    }

    private Binding alternateQueueBinding(QueueConfig q, DirectExchange main, FanoutExchange alternate) {
        Queue queue = new Queue(q.getName(), true);
        if (q.getBoundExchange() == BoundExchange.SECONDARY) {
            return BindingBuilder.bind(queue).to(alternate);
        }
        return BindingBuilder.bind(queue).to(main).with(nullToEmpty(q.getBindingKey()));
    }

    private Binding buildHeadersBinding(Scenario scenario, QueueConfig q, Queue queue) {
        HeadersExchange exchange = new HeadersExchange(scenario.getExchangeName());
        Map<String, Object> headerValues = new HashMap<>();
        if (q.getHeaders() != null) {
            headerValues.putAll(q.getHeaders());
        }
        if ("any".equalsIgnoreCase(q.getXMatch())) {
            return BindingBuilder.bind(queue).to(exchange).whereAny(headerValues).match();
        }
        return BindingBuilder.bind(queue).to(exchange).whereAll(headerValues).match();
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
