package com.ayigroup.rabbitmq.playground.routing;

/**
 * Resultado de evaluar, para una cola en particular, si el mensaje
 * publicado debería llegar a ella y por qué. Esto es una explicación
 * calculada por la aplicación (no viene de RabbitMQ), pensada para
 * enseñar el motivo detrás de cada entrega real que luego confirman
 * los consumidores.
 */
public record RoutingDecision(String queueName, String queueLabel, boolean matched, String reason) {
}
