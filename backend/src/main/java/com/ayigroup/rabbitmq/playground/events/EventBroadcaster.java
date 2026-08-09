package com.ayigroup.rabbitmq.playground.events;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class EventBroadcaster {

    private final SimpMessagingTemplate messagingTemplate;

    public void broadcast(String scenarioId, MessageEventDto event) {
        messagingTemplate.convertAndSend("/topic/scenarios/" + scenarioId + "/events", event);
    }
}
