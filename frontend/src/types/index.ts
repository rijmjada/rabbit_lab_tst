export type ExchangeType = "FANOUT" | "DIRECT" | "TOPIC" | "HEADERS" | "DEFAULT" | "EXCHANGE_TO_EXCHANGE";

export type AckMode = "AUTO" | "MANUAL";

export type ScenarioStatus = "CREATED" | "RUNNING" | "STOPPED";

/** Solo tiene sentido para EXCHANGE_TO_EXCHANGE: a cuál de los dos exchanges pertenece algo. */
export type BoundExchange = "PRIMARY" | "SECONDARY";

export interface QueueConfig {
  name: string;
  label: string;
  bindingKey?: string | null;
  pattern?: string | null;
  headers?: Record<string, string> | null;
  xMatch?: "all" | "any" | null;
  ackMode?: AckMode;
  /** Solo para EXCHANGE_TO_EXCHANGE; fijo desde la creación del escenario. */
  boundExchange?: BoundExchange;
}

export interface Scenario {
  id: string;
  type: ExchangeType;
  status: ScenarioStatus;
  exchangeName: string;
  /** Solo para EXCHANGE_TO_EXCHANGE: el segundo exchange de la cadena. */
  secondaryExchangeName?: string;
  /** Solo para EXCHANGE_TO_EXCHANGE: binding key del puente exchangeName -> secondaryExchangeName. */
  bridgeBindingKey?: string;
  queues: QueueConfig[];
}

export interface RoutingDecision {
  queueName: string;
  queueLabel: string;
  matched: boolean;
  reason: string;
}

export interface PublishMessageRequest {
  payload: Record<string, unknown>;
  routingKey?: string;
  headers?: Record<string, string>;
  targetQueue?: string;
  /** Solo para EXCHANGE_TO_EXCHANGE: a cuál de los dos exchanges se publica. */
  targetExchange?: BoundExchange;
  mandatory?: boolean;
  persistent?: boolean;
}

export interface PublishMessageResponse {
  messageId: string;
  resolvedRoutingKey: string;
  routingResult: RoutingDecision[];
}

export type DeliveryStatus = "PENDING" | "DELIVERED" | "ACKED" | "REJECTED";

export interface MessageRecord {
  id: string;
  scenarioId: string;
  timestamp: number;
  payload: Record<string, unknown>;
  routingKey: string;
  headers?: Record<string, string>;
  mandatory: boolean;
  routingResult: RoutingDecision[];
  deliveries: Record<string, DeliveryStatus>;
  unrouted: boolean;
}

export type EventType =
  | "MESSAGE_PUBLISHED"
  | "ROUTING_EVALUATED"
  | "MESSAGE_DELIVERED"
  | "MESSAGE_ACKED"
  | "MESSAGE_REJECTED"
  | "MESSAGE_RETURNED";

export interface MessageEventDto {
  type: EventType;
  scenarioId: string;
  messageId: string;
  timestamp: number;
  payload?: Record<string, unknown>;
  routingKey?: string;
  headers?: Record<string, string>;
  /** Solo en MESSAGE_PUBLISHED de un escenario EXCHANGE_TO_EXCHANGE. */
  enteredExchange?: BoundExchange;
  routingResult?: RoutingDecision[];
  queueName?: string;
  queueLabel?: string;
  reason?: string;
}
