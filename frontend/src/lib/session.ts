// Un identificador por pestaña, generado una sola vez, que el backend usa
// para dar nombres únicos a los exchanges/colas de cada usuario y evitar
// que dos personas usando la app al mismo tiempo choquen entre sí.
let cachedSessionId: string | null = null;

export function getSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  cachedSessionId = random.replace(/-/g, "").slice(0, 12);
  return cachedSessionId;
}
