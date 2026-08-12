import { useEffect, useState } from "react";

export interface ComposerOption {
  value: string;
  label: string;
}

export interface ComposerSubmitData {
  payload: Record<string, unknown>;
  routingKey?: string;
  headers?: Record<string, string>;
  targetQueue?: string;
  targetExchange?: string;
  simulateFailure?: boolean;
}

interface MessageComposerProps {
  onSend: (data: ComposerSubmitData) => Promise<void> | void;
  showRoutingKey?: boolean;
  routingKeyIgnored?: boolean;
  routingKeyLabel?: string;
  routingKeyPlaceholder?: string;
  routingKeyHint?: string;
  showHeaders?: boolean;
  targetQueueOptions?: string[];
  /** Selector "a qué exchange publico" — coexiste con el campo de routing key (a diferencia de targetQueueOptions). */
  targetExchangeOptions?: ComposerOption[];
  defaultPayload?: string;
  disabled?: boolean;
  /** Solo para DEAD_LETTER_EXCHANGE: checkbox para que el consumidor rechace el mensaje a propósito. */
  showSimulateFailure?: boolean;
}

/**
 * El escenario (y por lo tanto las opciones que dependen de él) suele
 * llegar recién después del primer render, así que un useState inicial
 * no alcanza: hay que resincronizar la selección cada vez que las
 * opciones cambian, si la actual quedó vacía o ya no es válida — sino
 * el submit termina mandando "" en silencio aunque el <select> se vea
 * con la primera opción marcada.
 */
function useSyncedSelection(options: string[] | undefined) {
  const [value, setValue] = useState(options?.[0] ?? "");
  useEffect(() => {
    if (!options || options.length === 0) return;
    setValue((current) => (current && options.includes(current) ? current : options[0]));
  }, [options]);
  return [value, setValue] as const;
}

export function MessageComposer({
  onSend,
  showRoutingKey = true,
  routingKeyIgnored = false,
  routingKeyLabel = "Routing Key",
  routingKeyPlaceholder = "pedido.creado",
  routingKeyHint,
  showHeaders = false,
  targetQueueOptions,
  targetExchangeOptions,
  defaultPayload = '{\n  "mensaje": "Pedido creado",\n  "cliente": "ABC"\n}',
  disabled = false,
  showSimulateFailure = false,
}: MessageComposerProps) {
  const [payloadText, setPayloadText] = useState(defaultPayload);
  const [routingKey, setRoutingKey] = useState("");
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [targetQueue, setTargetQueue] = useSyncedSelection(targetQueueOptions);
  const [targetExchange, setTargetExchange] = useSyncedSelection(targetExchangeOptions?.map((o) => o.value));
  const [headerRows, setHeaderRows] = useState<Array<{ key: string; value: string }>>(
    showHeaders ? [{ key: "", value: "" }] : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function updateHeaderRow(index: number, field: "key" | "value", value: string) {
    setHeaderRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addHeaderRow() {
    setHeaderRows((rows) => [...rows, { key: "", value: "" }]);
  }

  function removeHeaderRow(index: number) {
    setHeaderRows((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let payload: Record<string, unknown>;
    try {
      payload = payloadText.trim() ? JSON.parse(payloadText) : {};
    } catch {
      setError("El payload no es un JSON válido.");
      return;
    }

    const headers: Record<string, string> = {};
    headerRows.forEach((row) => {
      if (row.key.trim()) headers[row.key.trim()] = row.value;
    });

    setSending(true);
    try {
      await onSend({
        payload,
        routingKey: showRoutingKey ? routingKey : undefined,
        headers: showHeaders ? headers : undefined,
        targetQueue: targetQueueOptions ? targetQueue : undefined,
        targetExchange: targetExchangeOptions ? targetExchange : undefined,
        simulateFailure: showSimulateFailure ? simulateFailure : undefined,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="card card-padded stack" onSubmit={handleSubmit}>
      <div className="section-title">Publicar mensaje</div>

      <div className="field">
        <label>Payload (JSON)</label>
        <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} spellCheck={false} />
      </div>

      {targetQueueOptions && (
        <div className="field">
          <label>Cola destino (routing key = nombre de la cola)</label>
          <select value={targetQueue} onChange={(e) => setTargetQueue(e.target.value)}>
            {targetQueueOptions.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      {targetExchangeOptions && (
        <div className="field">
          <label>Publicar en</label>
          <select value={targetExchange} onChange={(e) => setTargetExchange(e.target.value)}>
            {targetExchangeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {showRoutingKey && !targetQueueOptions && (
        <div className="field">
          <label>
            {routingKeyLabel}
            {routingKeyIgnored ? " (opcional, será ignorada)" : ""}
          </label>
          <input
            type="text"
            value={routingKey}
            onChange={(e) => setRoutingKey(e.target.value)}
            placeholder={routingKeyPlaceholder}
          />
          {routingKeyHint && <span className="hint">{routingKeyHint}</span>}
        </div>
      )}

      {showHeaders && (
        <div className="field">
          <label>Cabeceras del mensaje</label>
          {headerRows.map((row, i) => (
            <div className="header-row" key={i}>
              <input
                type="text"
                placeholder="clave (ej: type)"
                value={row.key}
                onChange={(e) => updateHeaderRow(i, "key", e.target.value)}
              />
              <input
                type="text"
                placeholder="valor (ej: invoice)"
                value={row.value}
                onChange={(e) => updateHeaderRow(i, "value", e.target.value)}
              />
              <button
                type="button"
                className="icon-remove-btn"
                onClick={() => removeHeaderRow(i)}
                aria-label="Quitar cabecera"
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-add" onClick={addHeaderRow} style={{ alignSelf: "flex-start" }}>
            + Agregar cabecera
          </button>
        </div>
      )}

      {showSimulateFailure && (
        <div className="field field-checkbox">
          <label>
            <input
              type="checkbox"
              checked={simulateFailure}
              onChange={(e) => setSimulateFailure(e.target.checked)}
            />
            Simular fallo de procesamiento (rechazar)
          </label>
          <span className="hint">
            El consumidor rechazará el mensaje (basic.nack, sin requeue) en vez de confirmarlo, disparando el
            dead lettering real hacia el DLX.
          </span>
        </div>
      )}

      {error && <div className="banner-error">{error}</div>}

      <button
        className={"btn btn-primary" + (sending ? " btn-loading" : "")}
        type="submit"
        disabled={disabled || sending}
      >
        {sending ? "Enviando…" : "Enviar mensaje"}
      </button>
    </form>
  );
}
