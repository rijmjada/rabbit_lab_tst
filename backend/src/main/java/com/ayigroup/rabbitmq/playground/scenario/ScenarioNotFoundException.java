package com.ayigroup.rabbitmq.playground.scenario;

public class ScenarioNotFoundException extends RuntimeException {
    public ScenarioNotFoundException(String scenarioId) {
        super("No existe un escenario activo con id '" + scenarioId + "'. Puede que haya expirado o haya sido limpiado.");
    }
}
