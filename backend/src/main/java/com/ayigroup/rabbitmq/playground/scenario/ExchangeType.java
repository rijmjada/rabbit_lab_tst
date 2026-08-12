package com.ayigroup.rabbitmq.playground.scenario;

/**
 * Los tipos de Exchange que la aplicación permite explorar. Los primeros
 * cinco son un único exchange con sus colas; EXCHANGE_TO_EXCHANGE es un
 * escenario con dos exchanges Topic encadenados por un binding entre sí;
 * ALTERNATE_EXCHANGE es un exchange Direct con un Fanout configurado como
 * su "alternate exchange", que recibe automáticamente todo lo que no
 * matchea ningún binding del exchange principal; DEAD_LETTER_EXCHANGE es
 * una cola con un Fanout configurado como su "dead letter exchange", que
 * recibe automáticamente los mensajes que esa cola rechaza explícitamente
 * (o que expiran, o que desbordan la cola) — a nivel de cola, no de routing.
 */
public enum ExchangeType {
    FANOUT,
    DIRECT,
    TOPIC,
    HEADERS,
    DEFAULT,
    EXCHANGE_TO_EXCHANGE,
    ALTERNATE_EXCHANGE,
    DEAD_LETTER_EXCHANGE
}
