package com.ayigroup.rabbitmq.playground.api;

import com.ayigroup.rabbitmq.playground.api.dto.PublishMessageRequest;
import com.ayigroup.rabbitmq.playground.api.dto.PublishMessageResponse;
import com.ayigroup.rabbitmq.playground.history.MessageHistoryService;
import com.ayigroup.rabbitmq.playground.history.MessageRecord;
import com.ayigroup.rabbitmq.playground.messaging.MessagePublisherService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/scenarios/{scenarioId}/messages")
@RequiredArgsConstructor
public class MessageController {

    private final MessagePublisherService publisherService;
    private final MessageHistoryService historyService;

    @PostMapping
    public PublishMessageResponse publish(@PathVariable String scenarioId, @RequestBody PublishMessageRequest request) {
        return publisherService.publish(scenarioId, request);
    }

    @GetMapping
    public List<MessageRecord> history(@PathVariable String scenarioId) {
        return historyService.list(scenarioId);
    }
}
