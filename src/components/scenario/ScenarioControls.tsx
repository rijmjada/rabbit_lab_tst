import type { Scenario } from "../../types";

interface ScenarioControlsProps {
  scenario: Scenario | null;
  loading: boolean;
  onCreate: () => void;
  onReset: () => void;
  onClean: () => void;
}

export function ScenarioControls({ scenario, loading, onCreate, onReset, onClean }: ScenarioControlsProps) {
  return (
    <div className="card card-padded stack">
      <div className="section-title">Escenario</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <span className={`status-dot ${scenario ? "running" : "stopped"}`} />
        {scenario ? (
          <span>
            Activo · <code style={{ fontSize: 11 }}>{scenario.exchangeName || "(default)"}</code>
          </span>
        ) : (
          <span>Sin escenario creado</span>
        )}
      </div>
      <div className="btn-row">
        <button className="btn btn-primary" onClick={onCreate} disabled={loading || !!scenario}>
          Crear escenario
        </button>
        <button className="btn" onClick={onReset} disabled={loading || !scenario}>
          Reiniciar
        </button>
        <button className="btn btn-danger" onClick={onClean} disabled={loading || !scenario}>
          Limpiar
        </button>
      </div>
      <p className="hint">
        Crear declara el exchange y las colas reales en RabbitMQ. Reiniciar vacía las colas y el historial. Limpiar
        borra toda la infraestructura del escenario.
      </p>
    </div>
  );
}
