import { useMemo } from "react";
import { api } from "../../lib/api";
import { useScenario } from "../../hooks/useScenario";
import { useMessageHistory } from "../../hooks/useMessageHistory";
import { useExchangeBridgeAnimation } from "../../hooks/useExchangeBridgeAnimation";
import { ExchangeBridgeCanvas } from "../../components/topology/ExchangeBridgeCanvas";
import { ScenarioControls } from "../../components/scenario/ScenarioControls";
import { ExplanationPanel } from "../../components/explain/ExplanationPanel";
import { MessageComposer } from "../../components/messaging/MessageComposer";
import { MessageHistoryList } from "../../components/messaging/MessageHistoryList";
import { BindingEditor } from "../../components/binding/BindingEditor";
import { MODULE_ACCENTS } from "../../lib/moduleColors";

export function ExchangeToExchangeScreen() {
  const { scenario, loading, error, create, reset, remove, updateBindings, resetSignal } =
    useScenario("EXCHANGE_TO_EXCHANGE");
  const queues = useMemo(() => scenario?.queues ?? [], [scenario]);
  const { producerTick, primaryExchangeTick, secondaryExchangeTick, bridgeTick, primaryQueueStates, secondaryQueueStates } =
    useExchangeBridgeAnimation(scenario?.id, queues, resetSignal);
  const records = useMessageHistory(scenario?.id, resetSignal);

  const bindingByName = useMemo(() => new Map(queues.map((q) => [q.name, q.pattern ?? ""])), [queues]);

  return (
    <div>
      <div className="page-header" style={{ "--accent": MODULE_ACCENTS.bridge } as React.CSSProperties}>
        <div className="page-header-text">
          <h1>Exchange → Exchange</h1>
          <p>
            Un exchange puede estar bindeado a otro exchange, no solo a colas: los mensajes que matchean ese binding
            se reenvían, intactos, al segundo exchange.
          </p>
        </div>
        <span className="page-header-badge">Puente</span>
      </div>

      <ExplanationPanel>
        <strong>El binding puente reenvía sin tocar la routing key.</strong> Exchange 1 y Exchange 2 son Topic:
        cada cola y el binding puente usan patrones con <code>*</code> (una palabra) y <code>#</code> (cero o más).
        Si publicás en Exchange 1 con una routing key que coincide con el patrón del puente, el mensaje se reenvía
        tal cual a Exchange 2 — que vuelve a evaluar esa misma key, desde cero, contra sus propios patrones. No es
        "cualquier mensaje pasa": solo cruza el que matchea el patrón del puente, sin importar si matcheaba alguna
        cola de Exchange 1.
      </ExplanationPanel>

      {error && <div className="banner-error">{error}</div>}

      <div className="layout-grid">
        <div className="stack">
          <div className="card card-padded">
            <ExchangeBridgeCanvas
              primaryExchangeLabel={scenario?.exchangeName || "exchange 1"}
              secondaryExchangeLabel={scenario?.secondaryExchangeName || "exchange 2"}
              bridgeBindingKey={scenario?.bridgeBindingKey ?? ""}
              producerTick={producerTick}
              primaryExchangeTick={primaryExchangeTick}
              secondaryExchangeTick={secondaryExchangeTick}
              bridgeTick={bridgeTick}
              primaryQueues={primaryQueueStates}
              secondaryQueues={secondaryQueueStates}
              queueSubLabel={(name) => `patrón: ${bindingByName.get(name) || "(vacío)"}`}
            />
          </div>
          {scenario && (
            <BindingEditor
              variant="exchange-bridge"
              queues={scenario.queues}
              bridgeBindingKey={scenario.bridgeBindingKey}
              resetKey={scenario.id}
              onSave={updateBindings}
            />
          )}
        </div>

        <div className="stack">
          <ScenarioControls scenario={scenario} loading={loading} onCreate={create} onReset={reset} onClean={remove} />
          <MessageComposer
            disabled={!scenario}
            targetExchangeOptions={[
              { value: "PRIMARY", label: "Exchange 1" },
              { value: "SECONDARY", label: "Exchange 2" },
            ]}
            routingKeyPlaceholder="pedido.cancelado.stock"
            routingKeyHint="Si publicás en Exchange 1, esta key también se evalúa contra el patrón del puente. Probá: pedido.urgente.entrega (cruza y llega a dos colas a la vez), pedido.cancelado.stock (cruza y hace fan-out en Exchange 2), envio.confirmado (no es del dominio 'pedido.*', nunca cruza)."
            onSend={async ({ payload, routingKey, targetExchange }) => {
              if (!scenario) return;
              await api.publishMessage(scenario.id, {
                payload,
                routingKey,
                targetExchange: targetExchange as "PRIMARY" | "SECONDARY" | undefined,
                mandatory: true,
                persistent: true,
              });
            }}
          />
        </div>
      </div>

      <div className="card card-padded" style={{ marginTop: 20 }}>
        <div className="section-title">Historial de mensajes</div>
        <MessageHistoryList records={records} />
      </div>
    </div>
  );
}
