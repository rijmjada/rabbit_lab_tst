package com.ayigroup.rabbitmq.playground.scenario;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Red de seguridad: si alguien cierra la pestaña sin presionar
 * "Limpiar escenario", esta tarea borra igual la infraestructura de
 * RabbitMQ tras un período de inactividad, para no dejar exchanges y
 * colas huérfanos acumulándose en el broker.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ScenarioCleanupScheduler {

    private final ScenarioService scenarioService;

    @Value("${app.scenario.idle-timeout-minutes:30}")
    private long idleTimeoutMinutes;

    @Scheduled(fixedDelayString = "${app.scenario.cleanup-interval-ms:300000}")
    public void cleanupIdleScenarios() {
        Instant threshold = Instant.now().minus(idleTimeoutMinutes, ChronoUnit.MINUTES);
        List<Scenario> idle = scenarioService.listIdleOlderThan(threshold);
        for (Scenario scenario : idle) {
            log.info("Limpiando escenario inactivo {} (sin actividad desde {})", scenario.getId(), scenario.getLastActivityAt());
            try {
                scenarioService.delete(scenario.getId());
            } catch (Exception e) {
                log.warn("No se pudo limpiar el escenario {}: {}", scenario.getId(), e.getMessage());
            }
        }
    }
}
