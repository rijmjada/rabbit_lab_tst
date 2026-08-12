import { engineEventBus } from "./engine";

/**
 * Antes esta app escuchaba eventos por STOMP sobre SockJS desde un backend
 * real. Ahora `engineEventBus` (en `lib/engine/eventBus.ts`) emite los
 * mismos eventos localmente, sin red — misma forma pública
 * (`listen(scenarioId, handler): () => void`), así que `useScenarioSocket`
 * no necesitó cambiar.
 */
export const scenarioSocket = engineEventBus;
