package com.ayigroup.rabbitmq.playground.api;

import com.ayigroup.rabbitmq.playground.api.dto.CreateScenarioRequest;
import com.ayigroup.rabbitmq.playground.api.dto.ScenarioResponse;
import com.ayigroup.rabbitmq.playground.api.dto.UpdateBindingsRequest;
import com.ayigroup.rabbitmq.playground.scenario.ExchangeType;
import com.ayigroup.rabbitmq.playground.scenario.Scenario;
import com.ayigroup.rabbitmq.playground.scenario.ScenarioService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/scenarios")
@RequiredArgsConstructor
public class ScenarioController {

    private final ScenarioService scenarioService;

    @PostMapping("/{type}")
    public ScenarioResponse create(@PathVariable ExchangeType type, @RequestBody(required = false) CreateScenarioRequest request) {
        String sessionId = request == null ? null : request.getSessionId();
        Scenario scenario = scenarioService.create(type, sessionId);
        return ScenarioResponse.from(scenario);
    }

    @GetMapping("/{id}")
    public ScenarioResponse get(@PathVariable String id) {
        return ScenarioResponse.from(scenarioService.get(id));
    }

    @PostMapping("/{id}/reset")
    public ScenarioResponse reset(@PathVariable String id) {
        return ScenarioResponse.from(scenarioService.reset(id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        scenarioService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}/bindings")
    public ScenarioResponse updateBindings(@PathVariable String id, @RequestBody UpdateBindingsRequest request) {
        var updates = request.getQueues().stream().map(dto -> dto.toDomain()).toList();
        return ScenarioResponse.from(scenarioService.updateBindings(id, updates, request.getBridgeBindingKey()));
    }
}
