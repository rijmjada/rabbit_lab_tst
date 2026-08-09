import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { ExchangeType, QueueConfig, Scenario } from "../types";

// Recuerda, por tipo de exchange, el último escenario creado en esta
// pestaña. Así, si el usuario navega entre secciones y vuelve, no se
// crea un escenario nuevo (y por lo tanto una topología duplicada) en
// cada visita.
const scenarioCache = new Map<ExchangeType, string>();

export function useScenario(type: ExchangeType) {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "Reiniciar" reutiliza el mismo scenario.id (solo vacía colas + borra
  // historial en el backend), así que nada que dependa únicamente del id
  // se entera del cambio. Este contador es la señal explícita que usan
  // useMessageHistory/useTopologyAnimation para saber que hay que
  // refrescar/limpiar su estado aunque el id no haya cambiado.
  const [resetSignal, setResetSignal] = useState(0);
  const mounted = useRef(true);

  const create = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const created = await api.createScenario(type);
      scenarioCache.set(type, created.id);
      if (mounted.current) setScenario(created);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [type]);

  const ensure = useCallback(async () => {
    setLoading(true);
    setError(null);
    const cachedId = scenarioCache.get(type);
    if (cachedId) {
      try {
        const existing = await api.getScenario(cachedId);
        if (mounted.current) {
          setScenario(existing);
          setLoading(false);
        }
        return;
      } catch {
        scenarioCache.delete(type);
      }
    }
    await create();
  }, [type, create]);

  useEffect(() => {
    mounted.current = true;
    ensure();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const reset = useCallback(async () => {
    if (!scenario) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await api.resetScenario(scenario.id);
      setScenario(updated);
      setResetSignal((s) => s + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [scenario]);

  const remove = useCallback(async () => {
    if (!scenario) return;
    setLoading(true);
    setError(null);
    try {
      await api.deleteScenario(scenario.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      scenarioCache.delete(type);
      setScenario(null);
      setLoading(false);
    }
  }, [scenario, type]);

  const updateBindings = useCallback(
    async (queues: QueueConfig[], bridgeBindingKey?: string) => {
      if (!scenario) return;
      setError(null);
      try {
        const updated = await api.updateBindings(scenario.id, queues, bridgeBindingKey);
        setScenario(updated);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [scenario],
  );

  return { scenario, loading, error, create, reset, remove, updateBindings, resetSignal };
}
