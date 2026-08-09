package com.ayigroup.rabbitmq.playground.scenario;

/**
 * Modo de confirmación de un consumidor para una cola determinada.
 * En ambos casos el ACK enviado al broker es real; lo que cambia es
 * el tiempo simulado de "procesamiento" antes de confirmarlo, para
 * que la diferencia sea visible en la animación.
 */
public enum AckMode {
    AUTO,
    MANUAL
}
