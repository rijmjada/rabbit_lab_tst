import { useMemo } from "react";
import { api } from "../../lib/api";
import { useScenario } from "../../hooks/useScenario";
import { useMessageHistory } from "../../hooks/useMessageHistory";
import { useTopologyAnimation } from "../../hooks/useTopologyAnimation";
import { TopologyCanvas } from "../../components/topology/TopologyCanvas";
import { ScenarioControls } from "../../components/scenario/ScenarioControls";
import { ExplanationPanel } from "../../components/explain/ExplanationPanel";
import { MessageComposer } from "../../components/messaging/MessageComposer";
import { MessageHistoryList } from "../../components/messaging/MessageHistoryList";
import { BindingEditor } from "../../components/binding/BindingEditor";
import { MODULE_ACCENTS } from "../../lib/moduleColors";

export function TopicScreen() {
  const { scenario, loading, error, create, reset, remove, updateBindings, resetSignal } = useScenario("TOPIC");
  const queues = useMemo(() => scenario?.queues ?? [], [scenario]);
  const { producerTick, exchangeTick, queueStates } = useTopologyAnimation(scenario?.id, queues, resetSignal);
  const records = useMessageHistory(scenario?.id, resetSignal);

  const patternByName = useMemo(() => new Map(queues.map((q) => [q.name, q.pattern ?? ""])), [queues]);

  return (
    <div>
      <div className="page-header" style={{ "--accent": MODULE_ACCENTS.topic } as React.CSSProperties}>
        <div className="page-header-text">
          <h1>Topic Exchange</h1>
          <p>El enrutador por patrones: compara la Routing Key contra patrones jerárquicos con comodines.</p>
        </div>
        <span className="page-header-badge">Topic</span>
      </div>

      <ExplanationPanel>
        <strong>*</strong> = exactamente una palabra. <strong>#</strong> = cero o más palabras. Probá enviar{" "}
        <code>eu.es.temperatura</code> y mirá qué patrones coinciden y cuáles no, con el motivo explicado en el
        historial.
      </ExplanationPanel>

      {error && <div className="banner-error">{error}</div>}

      <div className="layout-grid">
        <div className="stack">
          <div className="card card-padded">
            <TopologyCanvas
              exchangeLabel={scenario?.exchangeName || "topic"}
              exchangeSubLabel="tipo: topic"
              producerTick={producerTick}
              exchangeTick={exchangeTick}
              queues={queueStates}
              queueSubLabel={(name) => `patrón: ${patternByName.get(name) || "(vacío)"}`}
              accentColor={MODULE_ACCENTS.topic}
            />
          </div>
          {scenario && (
            <BindingEditor variant="topic" queues={scenario.queues} resetKey={scenario.id} onSave={updateBindings} />
          )}
        </div>

        <div className="stack">
          <ScenarioControls scenario={scenario} loading={loading} onCreate={create} onReset={reset} onClean={remove} />
          <MessageComposer
            disabled={!scenario}
            routingKeyPlaceholder="eu.es.temperatura"
            routingKeyHint="Usá segmentos separados por puntos para que los patrones con * y # tengan sentido."
            onSend={async ({ payload, routingKey }) => {
              if (!scenario) return;
              await api.publishMessage(scenario.id, { payload, routingKey, mandatory: true, persistent: true });
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
