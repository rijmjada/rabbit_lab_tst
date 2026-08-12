import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useScenarioSocket } from "./useScenarioSocket";
import type { MessageEventDto, MessageRecord } from "../types";

export function useMessageHistory(scenarioId: string | undefined, resetSignal?: number) {
  const [records, setRecords] = useState<MessageRecord[]>([]);

  useEffect(() => {
    if (!scenarioId) {
      setRecords([]);
      return;
    }
    api
      .getHistory(scenarioId)
      .then(setRecords)
      .catch(() => setRecords([]));
    // resetSignal no se usa dentro del efecto, pero "Reiniciar" borra el
    // historial en el backend sin cambiar el scenarioId — hay que
    // reconsultarlo a propósito cuando cambia esta señal.
  }, [scenarioId, resetSignal]);

  const handleEvent = useCallback(
    (event: MessageEventDto) => {
      setRecords((prev) => {
        if (event.type === "MESSAGE_PUBLISHED") {
          const record: MessageRecord = {
            id: event.messageId,
            scenarioId: event.scenarioId,
            timestamp: event.timestamp,
            payload: event.payload ?? {},
            routingKey: event.routingKey ?? "",
            headers: event.headers,
            mandatory: true,
            routingResult: [],
            deliveries: {},
            unrouted: false,
          };
          return [record, ...prev].slice(0, 50);
        }

        return prev.map((record) => {
          if (record.id !== event.messageId) return record;
          switch (event.type) {
            case "ROUTING_EVALUATED":
              return { ...record, routingResult: event.routingResult ?? [] };
            case "MESSAGE_DELIVERED":
              return {
                ...record,
                deliveries: { ...record.deliveries, [event.queueName!]: "DELIVERED" },
              };
            case "MESSAGE_ACKED":
              return {
                ...record,
                deliveries: { ...record.deliveries, [event.queueName!]: "ACKED" },
              };
            case "MESSAGE_REJECTED":
              return {
                ...record,
                deliveries: { ...record.deliveries, [event.queueName!]: "REJECTED" },
              };
            case "MESSAGE_RETURNED":
              return { ...record, unrouted: true };
            default:
              return record;
          }
        });
      });
    },
    [],
  );

  useScenarioSocket(scenarioId, handleEvent);

  return records;
}
