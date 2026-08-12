import { useMemo } from "react";
import { api } from "../../lib/api";
import { useScenario } from "../../hooks/useScenario";
import { useMessageHistory } from "../../hooks/useMessageHistory";
import { useDeadLetterAnimation } from "../../hooks/useDeadLetterAnimation";
import { DeadLetterCanvas } from "../../components/topology/DeadLetterCanvas";
import { ScenarioControls } from "../../components/scenario/ScenarioControls";
import { ExplanationPanel } from "../../components/explain/ExplanationPanel";
import { MessageComposer } from "../../components/messaging/MessageComposer";
import { MessageHistoryList } from "../../components/messaging/MessageHistoryList";
import { BindingEditor } from "../../components/binding/BindingEditor";
import { MODULE_ACCENTS } from "../../lib/moduleColors";

export function DeadLetterScreen() {
  const { scenario, loading, error, create, reset, remove, updateBindings, resetSignal } =
    useScenario("DEAD_LETTER_EXCHANGE");
  const queues = useMemo(() => scenario?.queues ?? [], [scenario]);
  const { producerTick, primaryExchangeTick, dlxExchangeTick, deadLetterTick, primaryQueueStates, dlxQueueStates } =
    useDeadLetterAnimation(scenario?.id, queues, resetSignal);
  const records = useMessageHistory(scenario?.id, resetSignal);

  const subLabel = (name: string) => {
    const q = queues.find((qq) => qq.name === name);
    if (!q) return "";
    return q.boundExchange === "SECONDARY" ? "fanout: recibe los rechazados" : `binding: ${q.bindingKey || "(vacío)"}`;
  };

  return (
    <div>
      <div className="page-header" style={{ "--accent": MODULE_ACCENTS.dlx } as React.CSSProperties}>
        <div className="page-header-text">
          <h1>Dead Letter Exchange</h1>
          <p>
            Una cola puede declarar un dead letter exchange: todo mensaje que esa cola rechace (o cuyo TTL expire, o
            que desborde un límite de tamaño) se reenvía automáticamente ahí, en vez de perderse.
          </p>
        </div>
        <span className="page-header-badge">DLX</span>
      </div>

      <ExplanationPanel>
        <strong>El dead lettering no es una decisión de routing: es un evento de entrega a nivel de cola.</strong>{" "}
        A diferencia de Exchange↔Exchange (reenvía lo que matchea un patrón) y Alternate Exchange (reenvía lo que no
        matchea nada), acá el routing hacia "Procesar pago" <strong>sí funciona</strong> — el mensaje llega bien. El
        reenvío ocurre después, cuando esa cola lo rechaza explícitamente (<code>basic.nack</code> sin requeue). En
        producción los otros dos disparadores típicos son un TTL que expira o una cola que alcanza su tamaño máximo
        (<code>x-max-length</code>); en esta demo, con consumidores que siempre están activos, el disparador
        interactivo es el checkbox "simular fallo" del composer.
      </ExplanationPanel>

      {error && <div className="banner-error">{error}</div>}

      <div className="layout-grid">
        <div className="stack">
          <div className="card card-padded">
            <DeadLetterCanvas
              primaryExchangeLabel={scenario?.exchangeName || "exchange principal"}
              dlxExchangeLabel={scenario?.secondaryExchangeName || "dead letter exchange"}
              producerTick={producerTick}
              primaryExchangeTick={primaryExchangeTick}
              dlxExchangeTick={dlxExchangeTick}
              deadLetterTick={deadLetterTick}
              primaryQueues={primaryQueueStates}
              dlxQueues={dlxQueueStates}
              queueSubLabel={subLabel}
            />
          </div>
          {scenario && (
            <BindingEditor
              variant="dead-letter"
              queues={scenario.queues}
              resetKey={scenario.id}
              onSave={updateBindings}
            />
          )}
        </div>

        <div className="stack">
          <ScenarioControls scenario={scenario} loading={loading} onCreate={create} onReset={reset} onClean={remove} />
          <MessageComposer
            disabled={!scenario}
            targetExchangeOptions={[
              { value: "PRIMARY", label: "Exchange principal" },
              { value: "SECONDARY", label: "Dead Letter Exchange (directo)" },
            ]}
            routingKeyPlaceholder="pago.nuevo"
            routingKeyHint='Probá "pago.nuevo" (matchea "Procesar pago"). Tildá el checkbox de abajo para que el consumidor la rechace y veas el reenvío real al DLX.'
            showSimulateFailure
            onSend={async ({ payload, routingKey, targetExchange, simulateFailure }) => {
              if (!scenario) return;
              await api.publishMessage(scenario.id, {
                payload,
                routingKey,
                targetExchange: targetExchange as "PRIMARY" | "SECONDARY" | undefined,
                simulateFailure,
                mandatory: true,
                persistent: true,
              });
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
