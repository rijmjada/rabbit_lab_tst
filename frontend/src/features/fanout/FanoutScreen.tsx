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

export function FanoutScreen() {
  const { scenario, loading, error, create, reset, remove, resetSignal } = useScenario("FANOUT");
  const queues = useMemo(() => scenario?.queues ?? [], [scenario]);
  const { producerTick, exchangeTick, queueStates } = useTopologyAnimation(scenario?.id, queues, resetSignal);
  const records = useMessageHistory(scenario?.id, resetSignal);

  return (
    <div>
      <div className="page-header">
        <h1>Fanout Exchange</h1>
        <p>El difusor: entrega una copia del mensaje a todas las colas vinculadas, sin mirar la routing key.</p>
      </div>

      <ExplanationPanel>
        <strong>Fanout ignora la Routing Key.</strong> No importa qué envíes en ese campo (o si lo dejás vacío): el
        mensaje llegará a todas las colas conectadas a este exchange por igual. Probá cambiar la routing key abajo y
        vas a ver que el resultado en el diagrama no cambia.
      </ExplanationPanel>

      {error && <div className="banner-error">{error}</div>}

      <div className="layout-grid">
        <div className="card card-padded">
          <TopologyCanvas
            exchangeLabel={scenario?.exchangeName || "fanout"}
            exchangeSubLabel="tipo: fanout"
            producerTick={producerTick}
            exchangeTick={exchangeTick}
            queues={queueStates}
            queueSubLabel={() => "sin filtro"}
            accentColor={MODULE_ACCENTS.fanout}
          />
        </div>

        <div className="stack">
          <ScenarioControls scenario={scenario} loading={loading} onCreate={create} onReset={reset} onClean={remove} />
          <MessageComposer
            disabled={!scenario}
            routingKeyIgnored
            routingKeyPlaceholder="pedido.creado (opcional)"
            routingKeyHint="Este valor se envía pero Fanout no lo usa para decidir el destino."
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
