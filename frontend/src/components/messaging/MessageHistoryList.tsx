import { useState } from "react";
import type { MessageRecord } from "../../types";

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("es-AR", { hour12: false });
}

function DeliveryBadge({ status }: { status?: string }) {
  const key = status ?? "PENDING";
  if (status === "ACKED") return <span key={key} className="badge badge-success">ACK</span>;
  if (status === "DELIVERED") return <span key={key} className="badge badge-info">entregado</span>;
  if (status === "REJECTED") return <span key={key} className="badge badge-danger">rechazado</span>;
  return <span key={key} className="badge badge-neutral">pendiente</span>;
}

export function MessageHistoryList({ records }: { records: MessageRecord[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (records.length === 0) {
    return <div className="empty-state">Todavía no enviaste ningún mensaje en este escenario.</div>;
  }

  return (
    <div>
      {records.map((record) => {
        const expanded = expandedId === record.id;
        const matchedCount = record.routingResult.filter((r) => r.matched).length;
        return (
          <div className="history-item" key={record.id} onClick={() => setExpandedId(expanded ? null : record.id)}>
            <div className="history-item-head">
              <span className="hi-key">{record.routingKey || "(sin routing key)"}</span>
              <span style={{ color: "var(--color-text-muted)" }}>{formatTime(record.timestamp)}</span>
              {record.unrouted ? (
                <span className="badge badge-danger">no enrutado</span>
              ) : (
                <span className="badge badge-success">{matchedCount} cola(s)</span>
              )}
            </div>
            {expanded && (
              <div className="history-item-details">
                <div>
                  <strong style={{ fontSize: 11.5 }}>Payload</strong>
                  <pre>{JSON.stringify(record.payload, null, 2)}</pre>
                </div>
                {record.headers && Object.keys(record.headers).length > 0 && (
                  <div>
                    <strong style={{ fontSize: 11.5 }}>Headers</strong>
                    <pre>{JSON.stringify(record.headers, null, 2)}</pre>
                  </div>
                )}
                <div className="stack-sm">
                  <strong style={{ fontSize: 11.5 }}>Resultado del enrutamiento</strong>
                  {record.routingResult.map((decision) => (
                    <div className="match-line" key={decision.queueName}>
                      <span className={`match-icon ${decision.matched ? "yes" : "no"}`}>
                        {decision.matched ? "✓" : "✗"}
                      </span>
                      <span style={{ fontWeight: 600 }}>{decision.queueLabel}</span>
                      <DeliveryBadge status={record.deliveries[decision.queueName]} />
                      <span className="hint" style={{ flex: 1 }}>
                        {decision.reason}
                      </span>
                    </div>
                  ))}
                  {record.unrouted && (
                    <div className="banner-error" style={{ marginTop: 4 }}>
                      RabbitMQ devolvió el mensaje: ninguna cola coincidió y se publicó con <code>mandatory</code>.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
