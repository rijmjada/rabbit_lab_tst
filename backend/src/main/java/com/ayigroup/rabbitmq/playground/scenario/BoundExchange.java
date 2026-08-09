package com.ayigroup.rabbitmq.playground.scenario;

/**
 * Solo tiene sentido para {@link ExchangeType#EXCHANGE_TO_EXCHANGE}: a
 * cuál de los dos exchanges encadenados pertenece una cola, o a cuál
 * de los dos apunta un publish. PRIMARY es el exchange "de entrada"
 * (el que tiene el binding puente hacia SECONDARY); SECONDARY es el
 * que recibe los mensajes reenviados a través de ese binding, además
 * de los que se le publiquen directamente.
 */
public enum BoundExchange {
    PRIMARY,
    SECONDARY
}
