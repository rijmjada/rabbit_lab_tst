import type { ExchangeType, QueueConfig } from "../../types";

/** Port 1:1 de `ScenarioDefaults` (backend Java): la topología de demo por cada uno de los 8 tipos. */

function q(partial: Partial<QueueConfig> & { label: string }): QueueConfig {
  return {
    name: "", // se completa en scenarioStore al crear el escenario (necesita sessionId/typeSlug)
    bindingKey: null,
    pattern: null,
    headers: null,
    xMatch: null,
    ackMode: "AUTO",
    boundExchange: "PRIMARY",
    ...partial,
  };
}

export function buildDefaultQueues(type: ExchangeType): QueueConfig[] {
  switch (type) {
    case "FANOUT":
      return [q({ label: "Cola A" }), q({ label: "Cola B" }), q({ label: "Cola C" })];

    case "DIRECT":
      return [
        q({ label: "Errores criticos", bindingKey: "error" }),
        q({ label: "Logs info", bindingKey: "info" }),
        q({ label: "Warnings", bindingKey: "warning" }),
      ];

    case "TOPIC":
      return [
        q({ label: "Europa", pattern: "eu.#" }),
        q({ label: "Clima global", pattern: "#.temperatura" }),
        q({ label: "Estados Unidos", pattern: "us.#" }),
      ];

    case "HEADERS":
      return [
        q({ label: "Facturas en espanol", xMatch: "all", headers: { type: "invoice", lang: "es" } }),
        q({ label: "Reportes en ingles", xMatch: "all", headers: { type: "report", lang: "en" } }),
        q({ label: "Facturas procesadas (any)", xMatch: "any", headers: { type: "invoice", status: "processed" } }),
      ];

    case "DEFAULT":
      return [q({ label: "pedidos" }), q({ label: "notificaciones" })];

    case "EXCHANGE_TO_EXCHANGE":
      return [
        q({ label: "Urgentes", pattern: "pedido.urgente.#", boundExchange: "PRIMARY" }),
        q({ label: "Todos los pedidos", pattern: "pedido.#", boundExchange: "SECONDARY" }),
        q({ label: "Cancelaciones", pattern: "pedido.cancelado.*", boundExchange: "SECONDARY" }),
      ];

    case "ALTERNATE_EXCHANGE":
      return [
        q({ label: "Urgentes", bindingKey: "urgente", boundExchange: "PRIMARY" }),
        q({ label: "Normales", bindingKey: "normal", boundExchange: "PRIMARY" }),
        q({ label: "Huerfanos", boundExchange: "SECONDARY" }),
      ];

    case "DEAD_LETTER_EXCHANGE":
      return [
        q({ label: "Procesar pago", bindingKey: "pago.nuevo", boundExchange: "PRIMARY" }),
        q({ label: "Pagos fallidos", boundExchange: "SECONDARY" }),
      ];

    default:
      throw new Error(`Tipo de escenario desconocido: ${type}`);
  }
}

export const DEFAULT_BRIDGE_BINDING_KEY = "pedido.#";
