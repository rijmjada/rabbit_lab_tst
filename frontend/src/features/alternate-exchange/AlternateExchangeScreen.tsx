import { useMemo } from "react";
import { api } from "../../lib/api";
import { useScenario } from "../../hooks/useScenario";
import { useMessageHistory } from "../../hooks/useMessageHistory";
import { useAlternateExchangeAnimation } from "../../hooks/useAlternateExchangeAnimation";
import { AlternateExchangeCanvas } from "../../components/topology/AlternateExchangeCanvas";
import { ScenarioControls } from "../../components/scenario/ScenarioControls";
import { ExplanationPanel } from "../../components/explain/ExplanationPanel";
import { MessageComposer } from "../../components/messaging/MessageComposer";
import { MessageHistoryList } from "../../components/messaging/MessageHistoryList";
import { BindingEditor } from "../../components/binding/BindingEditor";
import { MODULE_ACCENTS } from "../../lib/moduleColors";

export function AlternateExchangeScreen() {
  const { scenario, loading, error, create, reset, remove, updateBindings, resetSignal } =
    useScenario("ALTERNATE_EXCHANGE");
  const queues = useMemo(() => scenario?.queues ?? [], [scenario]);
  const { producerTick, mainExchangeTick, alternateExchangeTick, rerouteTick, mainQueueStates, alternateQueueStates } =
    useAlternateExchangeAnimation(scenario?.id, queues, resetSignal);
  const records = useMessageHistory(scenario?.id, resetSignal);

  const subLabel = (name: string) => {
    const q = queues.find((qq) => qq.name === name);
    if (!q) return "";
    return q.boundExchange === "SECONDARY" ? "fanout: recibe todo lo no enrutado" : `binding: ${q.bindingKey || "(vacío)"}`;
  };

  return (
    <div>
      <div className="page-header" style={{ "--accent": MODULE_ACCENTS.alternate } as React.CSSProperties}>
        <div className="page-header-text">
          <h1>Alternate Exchange</h1>
          <p>
            Un exchange puede declarar un exchange alternativo: todo mensaje que no matchee ningún binding se
            reenvía automáticamente ahí, en vez de perderse.
          </p>
        </div>
        <span className="page-header-badge">Alternate</span>
      </div>

      <ExplanationPanel>
        <strong>El exchange alternativo es una red de seguridad automática.</strong> No hay ningún patrón que
        configurar para que se active: RabbitMQ lo dispara exactamente cuando la routing key <strong>no</strong>{" "}
        coincide con ningún binding del exchange principal. Como acá el alternativo sí tiene una cola conectada, el
        mensaje nunca se pierde ni se devuelve — ni siquiera con <code>mandatory=true</code>, porque para RabbitMQ
        terminar en el alternate exchange también cuenta como "enrutado".
      </ExplanationPanel>

      {error && <div className="banner-error">{error}</div>}

      <div className="layout-grid">
        <div className="stack">
          <div className="card card-padded">
            <AlternateExchangeCanvas
              mainExchangeLabel={scenario?.exchangeName || "exchange principal"}
              alternateExchangeLabel={scenario?.secondaryExchangeName || "exchange alternativo"}
              producerTick={producerTick}
              mainExchangeTick={mainExchangeTick}
              alternateExchangeTick={alternateExchangeTick}
              rerouteTick={rerouteTick}
              mainQueues={mainQueueStates}
              alternateQueues={alternateQueueStates}
              queueSubLabel={subLabel}
            />
          </div>
          {scenario && (
            <BindingEditor
              variant="alternate-exchange"
              queues={scenario.queues}
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
              { value: "PRIMARY", label: "Exchange principal" },
              { value: "SECONDARY", label: "Exchange alternativo" },
            ]}
            routingKeyPlaceholder="vip"
            routingKeyHint="Probá: urgente o normal (matchean directo), o cualquier otra key como vip (no matchea nada y RabbitMQ la reenvía sola al exchange alternativo)."
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
