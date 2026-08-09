import { Fragment, useEffect, useState } from "react";
import type { QueueVisualState } from "../../hooks/useTopologyAnimation";
import "./topology.css";

interface TopologyCanvasProps {
  producerLabel?: string;
  exchangeLabel: string;
  exchangeSubLabel: string;
  queues: QueueVisualState[];
  queueSubLabel: (queueName: string) => string;
  producerTick: number;
  exchangeTick: number;
  /** Color de identidad del módulo (ver `lib/moduleColors`); si no se pasa, cae a `--color-primary`. */
  accentColor?: string;
}

const WIDTH = 1050;
// Las colas son las que más texto variable cargan (nombre + resumen de
// bindings, que puede tener varias cabeceras): les damos una fila alta y
// ancha para que casi nunca necesiten más de las 2-3 líneas para las que
// están pensadas. Si el usuario agrega muchas cabeceras igual puede
// desbordar un poco — pero eso es preferible a comerse texto en silencio.
const ROW_HEIGHT = 150;
const TOP_PADDING = 20;

function layout(count: number) {
  const height = Math.max(count * ROW_HEIGHT + TOP_PADDING, 300);
  const centerY = height / 2;
  const producer = { x: 16, y: centerY - 28, w: 150, h: 56 };
  const exchange = { x: 190, y: centerY - 42, w: 300, h: 84 };
  const queues = Array.from({ length: count }, (_, i) => ({
    x: 575,
    y: TOP_PADDING + i * ROW_HEIGHT,
    w: 250,
    h: 115,
  }));
  const consumers = queues.map((q) => ({ x: 870, y: q.y + 21, w: 160, h: 72 }));
  return { height, producer, exchange, queues, consumers };
}

function curve(x1: number, y1: number, x2: number, y2: number) {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

// El wrapper tiene una altura en px igual al valor "virtual" de height,
// así que un porcentaje vertical (y / height) coincide 1:1 con la
// altura real. Para el ancho, todo se expresa como % de WIDTH, y el
// SVG usa preserveAspectRatio="none" para estirarse exactamente igual
// que los nodos HTML posicionados en % — así ambos quedan siempre
// alineados sin importar el ancho real del contenedor.
function box(b: { x: number; y: number; w: number; h: number }, height: number) {
  return {
    left: `${(b.x / WIDTH) * 100}%`,
    top: `${(b.y / height) * 100}%`,
    width: `${(b.w / WIDTH) * 100}%`,
    height: `${(b.h / height) * 100}%`,
  } as const;
}

/** Pequeño hook que dispara una clase de animación cada vez que `tick` cambia. */
function usePulseClass(tick: number, duration = 700) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (tick === 0) return;
    setActive(true);
    const t = window.setTimeout(() => setActive(false), duration);
    return () => window.clearTimeout(t);
  }, [tick, duration]);
  return active;
}

export function TopologyCanvas({
  producerLabel = "Productor",
  exchangeLabel,
  exchangeSubLabel,
  queues,
  queueSubLabel,
  producerTick,
  exchangeTick,
  accentColor,
}: TopologyCanvasProps) {
  const { height, producer, exchange, queues: queuePositions, consumers } = layout(Math.max(queues.length, 1));
  const producerActive = usePulseClass(producerTick);
  const exchangeActive = usePulseClass(exchangeTick);

  return (
    <div className="topology-wrapper" style={{ height, "--accent": accentColor } as React.CSSProperties}>
      <svg className="topology-svg" viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none">
        <path
          className="topology-edge"
          d={curve(producer.x + producer.w, producer.y + producer.h / 2, exchange.x, exchange.y + exchange.h / 2)}
        />
        {queues.map((q, i) => {
          const qp = queuePositions[i];
          const cp = consumers[i];
          const edgeClass = [
            "topology-edge",
            q.matchState === "matched" ? "edge-matched" : "",
            q.matchState === "unmatched" ? "edge-unmatched" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const exchangeToQueueD = curve(exchange.x + exchange.w, exchange.y + exchange.h / 2, qp.x, qp.y + qp.h / 2);
          const queueToConsumerD = curve(qp.x + qp.w, qp.y + qp.h / 2, cp.x, cp.y + cp.h / 2);
          const delivering = q.deliveryState === "delivered" || q.deliveryState === "acked";
          return (
            <g key={q.name}>
              <path
                key={`ex-${q.name}-${q.flowTick}-${q.rejectTick}`}
                className={edgeClass + (q.matchState === "matched" ? " edge-flowing" : "")}
                d={exchangeToQueueD}
              />
              <path
                key={`co-${q.name}-${q.ackTick}`}
                className={
                  "topology-edge" +
                  (q.deliveryState !== "idle" ? " edge-matched" : "") +
                  (delivering ? " edge-flowing" : "")
                }
                d={queueToConsumerD}
              />
              {q.matchState === "matched" && q.flowTick > 0 && (
                <circle
                  key={`packet-ex-${q.name}-${q.flowTick}`}
                  className="packet-dot"
                  r={5}
                  style={{ offsetPath: `path('${exchangeToQueueD}')` } as React.CSSProperties}
                />
              )}
              {q.matchState === "unmatched" && q.rejectTick > 0 && (
                <circle
                  key={`packet-rej-${q.name}-${q.rejectTick}`}
                  className="packet-dot packet-reject"
                  r={5}
                  style={{ offsetPath: `path('${exchangeToQueueD}')` } as React.CSSProperties}
                />
              )}
              {delivering && q.deliverTick > 0 && (
                <circle
                  key={`packet-co-${q.name}-${q.deliverTick}`}
                  className={"packet-dot" + (q.deliveryState === "acked" ? " packet-ack" : "")}
                  r={5}
                  style={{ offsetPath: `path('${queueToConsumerD}')` } as React.CSSProperties}
                />
              )}
            </g>
          );
        })}
      </svg>

      <div
        className={"topology-node node-producer" + (producerActive ? " node-pulse" : "")}
        style={box(producer, height)}
      >
        <div className="node-kind">Producer</div>
        <div className="node-label">{producerLabel}</div>
      </div>

      <div
        className={"topology-node node-exchange" + (exchangeActive ? " node-pulse" : "")}
        style={{ ...box(exchange, height), animationDelay: "0.05s" }}
      >
        <div className="node-kind">Exchange</div>
        <div className="node-label" title={exchangeLabel}>{exchangeLabel}</div>
        <div className="node-sub" title={exchangeSubLabel}>{exchangeSubLabel}</div>
      </div>

      {queues.map((q, i) => {
        const qp = queuePositions[i];
        const stateClass =
          q.matchState === "matched" ? "matched" : q.matchState === "unmatched" ? "unmatched" : "";
        const ackedClass = q.deliveryState === "acked" ? "acked" : "";
        const sub = queueSubLabel(q.name);
        return (
          <Fragment key={q.name}>
            <div
              className={`topology-node node-queue ${stateClass} ${ackedClass}`.trim()}
              style={{ ...box(qp, height), animationDelay: `${0.1 + i * 0.06}s` }}
            >
              <div className="node-kind">Cola</div>
              <div className="node-label" title={q.label}>{q.label}</div>
              <div className="node-sub" title={sub}>{sub}</div>
            </div>
            {q.matchState === "unmatched" && q.rejectTick > 0 && (
              <div
                key={`reject-${q.name}-${q.rejectTick}`}
                className="node-reject-flash"
                style={box(qp, height)}
                aria-hidden="true"
              />
            )}
          </Fragment>
        );
      })}

      {queues.map((q, i) => {
        const cp = consumers[i];
        return (
          <div
            key={`consumer-${q.name}`}
            className={"topology-node node-consumer" + (q.deliveryState === "acked" ? " node-acked" : "")}
            style={{ ...box(cp, height), animationDelay: `${0.15 + i * 0.06}s` }}
          >
            <div className="node-kind">Consumer</div>
            <div className="node-label">
              {q.deliveryState === "acked" ? "ACK ✓" : q.deliveryState === "delivered" ? "Procesando…" : "En espera"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
