// Un identificador por navegador, que el backend usa para dar nombres
// únicos a los exchanges/colas de cada usuario y evitar que dos personas
// usando la app al mismo tiempo choquen entre sí.
//
// Se persiste en localStorage (no solo en memoria): si viviera solo en una
// variable de JS, cada recarga de página generaría una sesión nueva —y por
// lo tanto un cluster de exchanges/colas nuevo en RabbitMQ— abandonando el
// anterior, que solo el scheduler de limpieza por inactividad del backend
// termina borrando (por defecto, a los 30 minutos).
const STORAGE_KEY = "rabbitmq-playground:session-id";
let cachedSessionId: string | null = null;

export function getSessionId(): string {
  if (cachedSessionId) return cachedSessionId;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    cachedSessionId = stored;
    return cachedSessionId;
  }

  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  cachedSessionId = random.replace(/-/g, "").slice(0, 12);
  localStorage.setItem(STORAGE_KEY, cachedSessionId);
  return cachedSessionId;
}
