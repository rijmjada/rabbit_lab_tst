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

export function HeadersScreen() {
  const { scenario, loading, error, create, reset, remove, updateBindings, resetSignal } = useScenario("HEADERS");
  const queues = useMemo(() => scenario?.queues ?? [], [scenario]);
  const { producerTick, exchangeTick, queueStates } = useTopologyAnimation(scenario?.id, queues, resetSignal);
  const records = useMessageHistory(scenario?.id, resetSignal);

  const summaryByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of queues) {
      const headers = Object.entries(q.headers ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      map.set(q.name, `${q.xMatch ?? "all"}: ${headers || "(sin cabeceras)"}`);
    }
    return map;
  }, [queues]);

  return (
    <div>
      <div className="page-header" style={{ "--accent": MODULE_ACCENTS.headers } as React.CSSProperties}>
        <div className="page-header-text">
          <h1>Headers Exchange</h1>
          <p>El enrutador por metadatos: compara cabeceras clave-valor del mensaje contra las que pide cada binding.</p>
        </div>
        <span className="page-header-badge">Headers</span>
      </div>

      <ExplanationPanel>
        Con <strong>x-match: all</strong> deben coincidir todas las cabeceras del binding; con{" "}
        <strong>x-match: any</strong> alcanza con una sola. La Routing Key se ignora por completo en este tipo de
        exchange.
      </ExplanationPanel>

      {error && <div className="banner-error">{error}</div>}

      <div className="layout-grid">
        <div className="stack">
          <div className="card card-padded">
            <TopologyCanvas
              exchangeLabel={scenario?.exchangeName || "headers"}
              exchangeSubLabel="tipo: headers"
              producerTick={producerTick}
              exchangeTick={exchangeTick}
              queues={queueStates}
              queueSubLabel={(name) => summaryByName.get(name) || ""}
              accentColor={MODULE_ACCENTS.headers}
            />
          </div>
          {scenario && (
            <BindingEditor variant="headers" queues={scenario.queues} resetKey={scenario.id} onSave={updateBindings} />
          )}
        </div>

        <div className="stack">
          <ScenarioControls scenario={scenario} loading={loading} onCreate={create} onReset={reset} onClean={remove} />
          <MessageComposer
            disabled={!scenario}
            showRoutingKey={false}
            showHeaders
            onSend={async ({ payload, headers }) => {
              if (!scenario) return;
              await api.publishMessage(scenario.id, { payload, headers, mandatory: true, persistent: true });
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
