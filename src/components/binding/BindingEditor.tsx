import { useEffect, useState } from "react";
import type { BoundExchange, QueueConfig } from "../../types";

interface HeaderRow {
  key: string;
  value: string;
}

interface EditableQueue {
  name: string;
  label: string;
  bindingKey: string;
  pattern: string;
  xMatch: "all" | "any";
  headerRows: HeaderRow[];
  boundExchange?: BoundExchange;
}

function toEditable(q: QueueConfig): EditableQueue {
  const headers = q.headers ?? {};
  return {
    name: q.name,
    label: q.label,
    bindingKey: q.bindingKey ?? "",
    pattern: q.pattern ?? "",
    xMatch: (q.xMatch as "all" | "any") ?? "all",
    headerRows: Object.entries(headers).length > 0 ? Object.entries(headers).map(([key, value]) => ({ key, value })) : [{ key: "", value: "" }],
    boundExchange: q.boundExchange,
  };
}

interface BindingEditorProps {
  variant: "direct" | "topic" | "headers" | "exchange-bridge" | "alternate-exchange" | "dead-letter";
  queues: QueueConfig[];
  resetKey: string;
  onSave: (updated: QueueConfig[], bridgeBindingKey?: string) => Promise<void> | void;
  /** Solo para variant="exchange-bridge": binding key actual del puente Exchange 1 -> Exchange 2. */
  bridgeBindingKey?: string;
}

export function BindingEditor({ variant, queues, resetKey, onSave, bridgeBindingKey }: BindingEditorProps) {
  const [rows, setRows] = useState<EditableQueue[]>(() => queues.map(toEditable));
  const [bridgeKey, setBridgeKey] = useState(bridgeBindingKey ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(queues.map(toEditable));
    setBridgeKey(bridgeBindingKey ?? "");
    // Se reinicia solo cuando cambia el escenario (resetKey), no en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function updateField(name: string, field: "bindingKey" | "pattern" | "xMatch", value: string) {
    setRows((prev) => prev.map((r) => (r.name === name ? { ...r, [field]: value } : r)));
  }

  function updateHeaderRow(name: string, index: number, field: "key" | "value", value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.name === name
          ? { ...r, headerRows: r.headerRows.map((h, i) => (i === index ? { ...h, [field]: value } : h)) }
          : r,
      ),
    );
  }

  function addHeaderRow(name: string) {
    setRows((prev) => prev.map((r) => (r.name === name ? { ...r, headerRows: [...r.headerRows, { key: "", value: "" }] } : r)));
  }

  function removeHeaderRow(name: string, index: number) {
    setRows((prev) =>
      prev.map((r) => (r.name === name ? { ...r, headerRows: r.headerRows.filter((_, i) => i !== index) } : r)),
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated: QueueConfig[] = rows.map((r) => ({
        name: r.name,
        label: r.label,
        bindingKey: variant === "direct" || variant === "alternate-exchange" || variant === "dead-letter" ? r.bindingKey : undefined,
        pattern: variant === "topic" || variant === "exchange-bridge" ? r.pattern : undefined,
        xMatch: variant === "headers" ? r.xMatch : undefined,
        headers:
          variant === "headers"
            ? Object.fromEntries(r.headerRows.filter((h) => h.key.trim()).map((h) => [h.key.trim(), h.value]))
            : undefined,
      }));
      await onSave(updated, variant === "exchange-bridge" ? bridgeKey : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card card-padded stack">
      <div className="section-title">Bindings de las colas</div>

      {(variant === "direct" || variant === "topic") && (
        <table className="binding-table">
          <thead>
            <tr>
              <th>Cola</th>
              <th>{variant === "direct" ? "Binding Key" : "Patrón (usa * y #)"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.label}</td>
                <td>
                  <input
                    type="text"
                    value={variant === "direct" ? r.bindingKey : r.pattern}
                    onChange={(e) =>
                      updateField(r.name, variant === "direct" ? "bindingKey" : "pattern", e.target.value)
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {variant === "exchange-bridge" && (
        <div className="stack">
          <div className="binding-group binding-group-bridge">
            <div className="binding-group-head">
              <strong>Puente Exchange 1 → Exchange 2</strong>
            </div>
            <div className="field">
              <label>Patrón del puente (usa * y #)</label>
              <input type="text" value={bridgeKey} onChange={(e) => setBridgeKey(e.target.value)} />
              <span className="hint">
                Solo los mensajes publicados en Exchange 1 cuya routing key coincida con este patrón se reenvían,
                intactos, a Exchange 2 — que vuelve a evaluar esa misma key contra sus propios patrones.
              </span>
            </div>
          </div>

          {(["PRIMARY", "SECONDARY"] as const).map((exchange, i) => {
            const exchangeRows = rows.filter((r) => (r.boundExchange ?? "PRIMARY") === exchange);
            if (exchangeRows.length === 0) return null;
            return (
              <table className="binding-table" key={exchange}>
                <thead>
                  <tr>
                    <th colSpan={2}>Colas de Exchange {i + 1}</th>
                  </tr>
                  <tr>
                    <th>Cola</th>
                    <th>Patrón (usa * y #)</th>
                  </tr>
                </thead>
                <tbody>
                  {exchangeRows.map((r) => (
                    <tr key={r.name}>
                      <td>{r.label}</td>
                      <td>
                        <input
                          type="text"
                          value={r.pattern}
                          onChange={(e) => updateField(r.name, "pattern", e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })}
        </div>
      )}

      {variant === "alternate-exchange" && (
        <div className="stack">
          <table className="binding-table">
            <thead>
              <tr>
                <th>Cola (exchange principal)</th>
                <th>Binding Key</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => (r.boundExchange ?? "PRIMARY") === "PRIMARY")
                .map((r) => (
                  <tr key={r.name}>
                    <td>{r.label}</td>
                    <td>
                      <input
                        type="text"
                        value={r.bindingKey}
                        onChange={(e) => updateField(r.name, "bindingKey", e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          {rows
            .filter((r) => r.boundExchange === "SECONDARY")
            .map((r) => (
              <div className="binding-group" key={r.name}>
                <div className="binding-group-head">
                  <strong>{r.label}</strong>
                  <span className="hint">exchange alternativo</span>
                </div>
                <span className="hint">
                  Recibe automáticamente todo mensaje que no matcheó ninguna binding key de arriba (fanout: sin
                  binding key propia, no es editable).
                </span>
              </div>
            ))}
        </div>
      )}

      {variant === "dead-letter" && (
        <div className="stack">
          <table className="binding-table">
            <thead>
              <tr>
                <th>Cola (exchange principal)</th>
                <th>Binding Key</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => (r.boundExchange ?? "PRIMARY") === "PRIMARY")
                .map((r) => (
                  <tr key={r.name}>
                    <td>{r.label}</td>
                    <td>
                      <input
                        type="text"
                        value={r.bindingKey}
                        onChange={(e) => updateField(r.name, "bindingKey", e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          {rows
            .filter((r) => r.boundExchange === "SECONDARY")
            .map((r) => (
              <div className="binding-group" key={r.name}>
                <div className="binding-group-head">
                  <strong>{r.label}</strong>
                  <span className="hint">dead letter queue</span>
                </div>
                <span className="hint">
                  Recibe automáticamente todo mensaje que la cola de arriba rechace (o cuyo TTL expire, o que
                  desborde un límite de tamaño) — nunca por routing directo (fanout: sin binding key propia, no es
                  editable).
                </span>
              </div>
            ))}
        </div>
      )}

      {variant === "headers" && (
        <div className="stack">
          {rows.map((r) => (
            <div key={r.name} className="binding-group">
              <div className="binding-group-head">
                <strong>{r.label}</strong>
                <select value={r.xMatch} onChange={(e) => updateField(r.name, "xMatch", e.target.value)}>
                  <option value="all">x-match: all</option>
                  <option value="any">x-match: any</option>
                </select>
              </div>
              {r.headerRows.map((h, i) => (
                <div className="header-row" key={i}>
                  <input type="text" placeholder="clave" value={h.key} onChange={(e) => updateHeaderRow(r.name, i, "key", e.target.value)} />
                  <input type="text" placeholder="valor" value={h.value} onChange={(e) => updateHeaderRow(r.name, i, "value", e.target.value)} />
                  <button
                    type="button"
                    className="icon-remove-btn"
                    onClick={() => removeHeaderRow(r.name, i)}
                    aria-label="Quitar cabecera"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-add" onClick={() => addHeaderRow(r.name)}>
                + Cabecera
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        className={"btn btn-primary" + (saving ? " btn-loading" : "")}
        onClick={handleSave}
        disabled={saving}
        style={{ alignSelf: "flex-start" }}
      >
        {saving ? "Guardando…" : "Guardar bindings"}
      </button>
    </div>
  );
}
