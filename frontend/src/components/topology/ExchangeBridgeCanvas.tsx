import { Fragment, useEffect, useState } from "react";
import type { QueueVisualState } from "../../hooks/useTopologyAnimation";
import "./topology.css";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ExchangeBridgeCanvasProps {
  producerLabel?: string;
  primaryExchangeLabel: string;
  secondaryExchangeLabel: string;
  bridgeBindingKey: string;
  primaryQueues: QueueVisualState[];
  secondaryQueues: QueueVisualState[];
  queueSubLabel: (queueName: string) => string;
  producerTick: number;
  primaryExchangeTick: number;
  secondaryExchangeTick: number;
  bridgeTick: number;
}

const WIDTH = 1090;
const ROW_HEIGHT = 150;
const TOP_PADDING = 20;
// Espacio entre las dos "bandas" (Exchange 1 arriba, Exchange 2 abajo)
// donde vive el conector del binding puente.
const BAND_GAP = 110;

function bandHeight(count: number) {
  return Math.max(count * ROW_HEIGHT + TOP_PADDING, 260);
}

function layout(primaryCount: number, secondaryCount: number) {
  const primaryH = bandHeight(Math.max(primaryCount, 1));
  const secondaryH = bandHeight(Math.max(secondaryCount, 1));
  const height = primaryH + BAND_GAP + secondaryH;

  const primaryCenterY = primaryH / 2;
  const secondaryTop = primaryH + BAND_GAP;
  const secondaryCenterY = secondaryTop + secondaryH / 2;
  const allCenterY = height / 2;

  const producer = { x: 16, y: allCenterY - 34, w: 175, h: 68 };
  const primaryExchange = { x: 220, y: primaryCenterY - 42, w: 300, h: 84 };
  const secondaryExchange = { x: 220, y: secondaryCenterY - 42, w: 300, h: 84 };

  const primaryQueues = Array.from({ length: primaryCount }, (_, i) => ({
    x: 575,
    y: TOP_PADDING + i * ROW_HEIGHT,
    w: 250,
    h: 115,
  }));
  const secondaryQueues = Array.from({ length: secondaryCount }, (_, i) => ({
    x: 575,
    y: secondaryTop + TOP_PADDING + i * ROW_HEIGHT,
    w: 250,
    h: 115,
  }));
  const primaryConsumers = primaryQueues.map((q) => ({ x: 880, y: q.y + 21, w: 175, h: 72 }));
  const secondaryConsumers = secondaryQueues.map((q) => ({ x: 880, y: q.y + 21, w: 175, h: 72 }));

  return {
    height,
    producer,
    primaryExchange,
    secondaryExchange,
    primaryQueues,
    secondaryQueues,
    primaryConsumers,
    secondaryConsumers,
  };
}

function curve(x1: number, y1: number, x2: number, y2: number) {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

function verticalCurve(x1: number, y1: number, x2: number, y2: number) {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

// Mismo truco que en TopologyCanvas: todo se posiciona en % de este
// sistema de coordenadas virtual, y el <svg> usa preserveAspectRatio
// "none" para estirarse igual, así ambas capas quedan siempre alineadas.
function box(b: Box, height: number) {
  return {
    left: `${(b.x / WIDTH) * 100}%`,
    top: `${(b.y / height) * 100}%`,
    width: `${(b.w / WIDTH) * 100}%`,
    height: `${(b.h / height) * 100}%`,
  } as const;
}

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

/** Los <path>/<circle> de las conexiones exchange -> cola -> consumer de una banda. */
function queueEdgesAndDots(exchangePoint: { x: number; y: number }, queues: QueueVisualState[], queuePositions: Box[], consumerPositions: Box[]) {
  return queues.map((q, i) => {
    const qp = queuePositions[i];
    const cp = consumerPositions[i];
    const edgeClass = [
      "topology-edge",
      q.matchState === "matched" ? "edge-matched" : "",
      q.matchState === "unmatched" ? "edge-unmatched" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const exchangeToQueueD = curve(exchangePoint.x, exchangePoint.y, qp.x, qp.y + qp.h / 2);
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
          className={"topology-edge" + (q.deliveryState !== "idle" ? " edge-matched" : "") + (delivering ? " edge-flowing" : "")}
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
  });
}

/** Las cajas HTML (cola + consumer) de una banda. */
function queueAndConsumerNodes(
  queues: QueueVisualState[],
  queuePositions: Box[],
  consumerPositions: Box[],
  height: number,
  queueSubLabel: (name: string) => string,
  delayBase: number,
) {
  return (
    <>
      {queues.map((q, i) => {
        const qp = queuePositions[i];
        const stateClass = q.matchState === "matched" ? "matched" : q.matchState === "unmatched" ? "unmatched" : "";
        const ackedClass = q.deliveryState === "acked" ? "acked" : "";
        const sub = queueSubLabel(q.name);
        return (
          <Fragment key={q.name}>
            <div
              className={`topology-node node-queue ${stateClass} ${ackedClass}`.trim()}
              style={{ ...box(qp, height), animationDelay: `${delayBase + i * 0.06}s` }}
            >
              <div className="node-queue-head">
                <span className="node-kind">Cola</span>
                <span className="node-counter">{q.ackTick}</span>
              </div>
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
        const cp = consumerPositions[i];
        return (
          <div
            key={`consumer-${q.name}`}
            className={"topology-node node-consumer" + (q.deliveryState === "acked" ? " node-acked" : "")}
            style={{ ...box(cp, height), animationDelay: `${delayBase + 0.05 + i * 0.06}s` }}
          >
            <span className="node-consumer-dot" />
            <div className="node-consumer-text">
              <div className="node-kind">Consumer</div>
              <div className="node-label">
                {q.deliveryState === "acked" ? "ACK ✓" : q.deliveryState === "delivered" ? "Procesando…" : "En espera"}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

export function ExchangeBridgeCanvas({
  producerLabel = "Productor",
  primaryExchangeLabel,
  secondaryExchangeLabel,
  bridgeBindingKey,
  primaryQueues,
  secondaryQueues,
  queueSubLabel,
  producerTick,
  primaryExchangeTick,
  secondaryExchangeTick,
  bridgeTick,
}: ExchangeBridgeCanvasProps) {
  const {
    height,
    producer,
    primaryExchange,
    secondaryExchange,
    primaryQueues: primaryQueuePositions,
    secondaryQueues: secondaryQueuePositions,
    primaryConsumers,
    secondaryConsumers,
  } = layout(Math.max(primaryQueues.length, 1), Math.max(secondaryQueues.length, 1));

  const producerActive = usePulseClass(producerTick);
  const primaryActive = usePulseClass(primaryExchangeTick);
  const secondaryActive = usePulseClass(secondaryExchangeTick);

  const bridgeD = verticalCurve(
    primaryExchange.x + primaryExchange.w / 2,
    primaryExchange.y + primaryExchange.h,
    secondaryExchange.x + secondaryExchange.w / 2,
    secondaryExchange.y,
  );
  const bridgeMidX = (primaryExchange.x + primaryExchange.w / 2 + secondaryExchange.x + secondaryExchange.w / 2) / 2;
  const bridgeMidY = (primaryExchange.y + primaryExchange.h + secondaryExchange.y) / 2;
  const bridgeLabelBox: Box = { x: bridgeMidX - 130, y: bridgeMidY - 18, w: 260, h: 36 };

  return (
    <div className="topology-wrapper" style={{ height, "--accent": "var(--color-bridge)" } as React.CSSProperties}>
      <svg className="topology-svg" viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none">
        <path
          className="topology-edge"
          d={curve(producer.x + producer.w, producer.y + producer.h / 2, primaryExchange.x, primaryExchange.y + primaryExchange.h / 2)}
        />
        <path
          className="topology-edge"
          d={curve(producer.x + producer.w, producer.y + producer.h / 2, secondaryExchange.x, secondaryExchange.y + secondaryExchange.h / 2)}
        />

        <path
          key={`bridge-${bridgeTick}`}
          className={"topology-edge edge-bridge" + (bridgeTick > 0 ? " edge-flowing" : "")}
          d={bridgeD}
        />
        {bridgeTick > 0 && (
          <circle
            key={`packet-bridge-${bridgeTick}`}
            className="packet-dot packet-bridge"
            r={5}
            style={{ offsetPath: `path('${bridgeD}')` } as React.CSSProperties}
          />
        )}

        {queueEdgesAndDots(
          { x: primaryExchange.x + primaryExchange.w, y: primaryExchange.y + primaryExchange.h / 2 },
          primaryQueues,
          primaryQueuePositions,
          primaryConsumers,
        )}
        {queueEdgesAndDots(
          { x: secondaryExchange.x + secondaryExchange.w, y: secondaryExchange.y + secondaryExchange.h / 2 },
          secondaryQueues,
          secondaryQueuePositions,
          secondaryConsumers,
        )}
      </svg>

      <div className={"topology-node node-producer" + (producerActive ? " node-pulse" : "")} style={box(producer, height)}>
        <div className="node-kind">Producer</div>
        <div className="node-label">{producerLabel}</div>
        <div className="node-sub node-producer-sub">basic_publish()</div>
      </div>

      <div
        className={"topology-node node-exchange" + (primaryActive ? " node-pulse" : "")}
        style={{ ...box(primaryExchange, height), animationDelay: "0.05s" }}
      >
        <div className="node-kind">Exchange 1</div>
        <div className="node-label" title={primaryExchangeLabel}>{primaryExchangeLabel}</div>
        <div className="node-sub">tipo: topic</div>
      </div>

      <div
        className={"topology-node node-exchange" + (secondaryActive ? " node-pulse" : "")}
        style={{ ...box(secondaryExchange, height), animationDelay: "0.08s" }}
      >
        <div className="node-kind">Exchange 2</div>
        <div className="node-label" title={secondaryExchangeLabel}>{secondaryExchangeLabel}</div>
        <div className="node-sub">tipo: topic</div>
      </div>

      <div className="bridge-label" style={box(bridgeLabelBox, height)} title={`Binding puente: ${bridgeBindingKey}`}>
        puente: {bridgeBindingKey || "(vacío)"}
      </div>

      {queueAndConsumerNodes(primaryQueues, primaryQueuePositions, primaryConsumers, height, queueSubLabel, 0.1)}
      {queueAndConsumerNodes(secondaryQueues, secondaryQueuePositions, secondaryConsumers, height, queueSubLabel, 0.16)}
    </div>
  );
}
