import type { ExchangeType, MessageRecord, PublishMessageRequest, PublishMessageResponse, QueueConfig, Scenario } from "../../types";
import * as scenarioStore from "./scenarioStore";
import { publish } from "./publisher";
import { listHistory } from "./history";
import { listen } from "./eventBus";

/**
 * Punto de ensamblado del motor de simulación. Expone exactamente la misma
 * superficie que antes exponían `lib/api.ts` (objeto `api`, 6 métodos) y
 * `lib/ws.ts` (`scenarioSocket.listen(...)`), para que ningún hook ni
 * componente del resto de la app necesite cambiar — ver `lib/api.ts` y
 * `lib/ws.ts`, que ahora son wrappers finos sobre este módulo.
 */

export const engineApi = {
  createScenario(type: ExchangeType): Promise<Scenario> {
    return Promise.resolve(scenarioStore.createScenario(type));
  },
  getScenario(id: string): Promise<Scenario> {
    return Promise.resolve(scenarioStore.getScenario(id));
  },
  resetScenario(id: string): Promise<Scenario> {
    return Promise.resolve(scenarioStore.resetScenario(id));
  },
  deleteScenario(id: string): Promise<void> {
    scenarioStore.deleteScenario(id);
    return Promise.resolve();
  },
  updateBindings(id: string, queues: QueueConfig[], bridgeBindingKey?: string): Promise<Scenario> {
    return Promise.resolve(scenarioStore.updateBindings(id, queues, bridgeBindingKey));
  },
  publishMessage(scenarioId: string, message: PublishMessageRequest): Promise<PublishMessageResponse> {
    return Promise.resolve(publish(scenarioId, message));
  },
  getHistory(scenarioId: string): Promise<MessageRecord[]> {
    return Promise.resolve(listHistory(scenarioId));
  },
};

export const engineEventBus = { listen };
