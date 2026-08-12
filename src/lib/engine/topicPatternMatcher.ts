/**
 * Port 1:1 de `TopicPatternMatcher` (backend Java): la recursión de
 * segmentos que decide si una routing key matchea un patrón con `*`/`#`.
 * Compartido por Topic y por el binding puente de Exchange↔Exchange.
 */
export function matchesTopicPattern(pattern: string | null | undefined, routingKey: string | null | undefined): boolean {
  const patternSegments = (pattern ?? "").split(".");
  const keySegments = (routingKey ?? "").split(".");
  return matchesFrom(patternSegments, 0, keySegments, 0);
}

function matchesFrom(pattern: string[], pi: number, key: string[], ki: number): boolean {
  if (pi === pattern.length) return ki === key.length;
  const segment = pattern[pi];
  if (segment === "#") {
    if (matchesFrom(pattern, pi + 1, key, ki)) return true;
    return ki < key.length && matchesFrom(pattern, pi, key, ki + 1);
  }
  if (ki >= key.length) return false;
  if (segment === "*" || segment === key[ki]) return matchesFrom(pattern, pi + 1, key, ki + 1);
  return false;
}
