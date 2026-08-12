import { useEffect, useRef } from "react";
import { scenarioSocket } from "../lib/ws";
import type { MessageEventDto } from "../types";

/**
 * Se suscribe al topic de un escenario. La suscripción real solo se
 * recrea cuando cambia `scenarioId`; el callback se invoca siempre en
 * su versión más reciente (vía ref) para que los componentes no
 * necesiten memoizarlo manualmente con useCallback.
 */
export function useScenarioSocket(scenarioId: string | undefined, onEvent: (event: MessageEventDto) => void) {
  const handlerRef = useRef(onEvent);

  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!scenarioId) return;
    return scenarioSocket.listen(scenarioId, (event) => handlerRef.current(event));
  }, [scenarioId]);
}
