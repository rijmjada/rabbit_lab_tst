package com.ayigroup.rabbitmq.playground.events;

public enum EventType {
    MESSAGE_PUBLISHED,
    ROUTING_EVALUATED,
    MESSAGE_DELIVERED,
    MESSAGE_ACKED,
    MESSAGE_REJECTED,
    MESSAGE_RETURNED
}
