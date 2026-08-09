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
import { MODULE_ACCENTS } from "../../lib/moduleColors";

export function DefaultScreen() {
  const { scenario, loading, error, create, reset, remove, resetSignal } = useScenario("DEFAULT");
  const queues = useMemo(() => scenario?.queues ?? [], [scenario]);
  const { producerTick, exchangeTick, queueStates } = useTopologyAnimation(scenario?.id, queues, resetSignal);
  const records = useMessageHistory(scenario?.id, resetSignal);
  const queueLabels = useMemo(() => queues.map((q) => q.label), [queues]);

  return (
    <div>
      <div className="page-header">
        <h1>Default Exchange</h1>
        <p>El exchange sin nombre ("") que viene incluido en RabbitMQ: cada cola queda vinculada automáticamente a él usando su propio nombre.</p>
      </div>

      <ExplanationPanel>
        Acá <strong>Exchange = ""</strong> y <strong>Routing Key = nombre de la cola</strong>. No hay bindings que
        configurar: son automáticos e inmutables. Es cómodo para empezar, pero acopla al productor con el nombre
        exacto de la cola destino.
      </ExplanationPanel>

      {error && <div className="banner-error">{error}</div>}

      <div className="layout-grid">
        <div className="card card-padded">
          <TopologyCanvas
            exchangeLabel='Default ("")'
            exchangeSubLabel="binding automático por nombre de cola"
            producerTick={producerTick}
            exchangeTick={exchangeTick}
            queues={queueStates}
            queueSubLabel={(name) => {
              const q = queues.find((qq) => qq.name === name);
              return q ? `routing key = "${q.label}"` : "";
            }}
            accentColor={MODULE_ACCENTS.default}
          />
        </div>

        <div className="stack">
          <ScenarioControls scenario={scenario} loading={loading} onCreate={create} onReset={reset} onClean={remove} />
          <MessageComposer
            disabled={!scenario}
            showRoutingKey={false}
            targetQueueOptions={queueLabels}
            onSend={async ({ payload, targetQueue }) => {
              if (!scenario) return;
              await api.publishMessage(scenario.id, { payload, targetQueue, mandatory: true, persistent: true });
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
