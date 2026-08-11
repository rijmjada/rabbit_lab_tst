package com.ayigroup.rabbitmq.playground.scenario;

/**
 * Los tipos de Exchange que la aplicación permite explorar. Los primeros
 * cinco son un único exchange con sus colas; EXCHANGE_TO_EXCHANGE es un
 * escenario con dos exchanges Topic encadenados por un binding entre sí;
 * ALTERNATE_EXCHANGE es un exchange Direct con un Fanout configurado como
 * su "alternate exchange", que recibe automáticamente todo lo que no
 * matchea ningún binding del exchange principal.
 */
public enum ExchangeType {
    FANOUT,
    DIRECT,
    TOPIC,
    HEADERS,
    DEFAULT,
    EXCHANGE_TO_EXCHANGE,
    ALTERNATE_EXCHANGE
}
