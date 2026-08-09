/**
 * Color de identidad de cada módulo, compartido por el nav, la home y los
 * diagramas de topología. Son referencias var(--module-*) (definidas en
 * index.css con un valor por tema claro/oscuro), no hex fijos — así el
 * color de cada módulo se ajusta solo al cambiar de tema, sin re-render.
 * Exchange↔Exchange reusa --color-bridge en vez de tener su propio token.
 */
export const MODULE_ACCENTS = {
  fanout: "var(--module-fanout)",
  direct: "var(--module-direct)",
  topic: "var(--module-topic)",
  headers: "var(--module-headers)",
  default: "var(--module-default)",
  bridge: "var(--color-bridge)",
} as const;
