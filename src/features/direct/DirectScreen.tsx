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

export function DirectScreen() {
  const { scenario, loading, error, create, reset, remove, updateBindings, resetSignal } = useScenario("DIRECT");
  const queues = useMemo(() => scenario?.queues ?? [], [scenario]);
  const { producerTick, exchangeTick, queueStates } = useTopologyAnimation(scenario?.id, queues, resetSignal);
  const records = useMessageHistory(scenario?.id, resetSignal);

  const bindingByName = useMemo(() => new Map(queues.map((q) => [q.name, q.bindingKey ?? ""])), [queues]);

  return (
    <div>
      <div className="page-header" style={{ "--accent": MODULE_ACCENTS.direct } as React.CSSProperties}>
        <div className="page-header-text">
          <h1>Direct Exchange</h1>
          <p>El cartero preciso: entrega el mensaje solo a las colas cuya Binding Key coincide exactamente con la Routing Key.</p>
        </div>
        <span className="page-header-badge">Direct</span>
      </div>

      <ExplanationPanel>
        <strong>Coincidencia exacta.</strong> Si enviás <code>error</code> como routing key, solo recibe el mensaje la
        cola cuya binding key sea exactamente <code>error</code>. Probá con <code>error</code>, <code>info</code>,{" "}
        <code>warning</code> o algo que no exista, como <code>debug</code>, y compará el resultado.
      </ExplanationPanel>

      {error && <div className="banner-error">{error}</div>}

      <div className="layout-grid">
        <div className="stack">
          <div className="card card-padded">
            <TopologyCanvas
              exchangeLabel={scenario?.exchangeName || "direct"}
              exchangeSubLabel="tipo: direct"
              producerTick={producerTick}
              exchangeTick={exchangeTick}
              queues={queueStates}
              queueSubLabel={(name) => `binding: ${bindingByName.get(name) || "(vacío)"}`}
              accentColor={MODULE_ACCENTS.direct}
            />
          </div>
          {scenario && (
            <BindingEditor variant="direct" queues={scenario.queues} resetKey={scenario.id} onSave={updateBindings} />
          )}
        </div>

        <div className="stack">
          <ScenarioControls scenario={scenario} loading={loading} onCreate={create} onReset={reset} onClean={remove} />
          <MessageComposer
            disabled={!scenario}
            routingKeyPlaceholder="error"
            routingKeyHint="Debe coincidir exactamente con la binding key de una cola para llegar a ella."
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
