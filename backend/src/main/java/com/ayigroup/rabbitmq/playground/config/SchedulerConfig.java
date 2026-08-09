package com.ayigroup.rabbitmq.playground.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

/**
 * Executor compartido para espaciar en el tiempo los eventos de una
 * publicación (publicado -> routing evaluado -> entregado -> ack) y
 * que la animación en el frontend sea legible en vez de instantánea.
 */
@Configuration
public class SchedulerConfig {

    @Bean(destroyMethod = "shutdown")
    public ScheduledExecutorService eventScheduler() {
        return Executors.newScheduledThreadPool(4);
    }
}
