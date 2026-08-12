import type { ExchangeType } from "../../types";

/**
 * Port 1:1 de `ScenarioService` (backend Java): mismo esquema de nombres
 * `edu.<sessionId>.<typeSlug>.main` / `.exchange2` / `.<slug-cola>`, para
 * que la UI siga mostrando nombres "reales" con sentido pedagógico aunque
 * no haya ningún broker detrás.
 */

export function sanitizeSessionId(raw: string | undefined | null): string {
  if (!raw || !raw.trim()) return randomShortId();
  const cleaned = raw.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase().slice(0, 24);
  return cleaned || randomShortId();
}

function randomShortId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function typeSlug(type: ExchangeType): string {
  switch (type) {
    case "EXCHANGE_TO_EXCHANGE":
      return "bridge";
    case "ALTERNATE_EXCHANGE":
      return "alt";
    case "DEAD_LETTER_EXCHANGE":
      return "dlx";
    default:
      return type.toLowerCase();
  }
}

export function queueName(sessionId: string, slugType: string, label: string): string {
  return `edu.${sessionId}.${slugType}.${slug(label)}`;
}

export function mainExchangeName(sessionId: string, slugType: string, type: ExchangeType): string {
  return type === "DEFAULT" ? "" : `edu.${sessionId}.${slugType}.main`;
}

export function secondaryExchangeName(sessionId: string, slugType: string, hasSecondary: boolean): string | undefined {
  return hasSecondary ? `edu.${sessionId}.${slugType}.exchange2` : undefined;
}
