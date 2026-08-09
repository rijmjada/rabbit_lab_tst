package com.ayigroup.rabbitmq.playground.routing;

/**
 * Algoritmo de coincidencia de Topic Exchange de AMQP, compartido por
 * {@link TopicRoutingEvaluator} y {@link ExchangeToExchangeRoutingEvaluator}
 * (este último lo necesita porque, con el cambio a exchanges Topic, tanto
 * las colas como el binding puente usan patrones en vez de igualdad exacta).
 * Las claves se dividen en segmentos separados por '.', '*' coincide con
 * exactamente una palabra y '#' con cero o más palabras.
 */
final class TopicPatternMatcher {

    private TopicPatternMatcher() {
    }

    static boolean matches(String pattern, String routingKey) {
        String[] patternSegments = (pattern == null ? "" : pattern).split("\\.", -1);
        String[] keySegments = (routingKey == null ? "" : routingKey).split("\\.", -1);
        return matches(patternSegments, 0, keySegments, 0);
    }

    private static boolean matches(String[] pattern, int pi, String[] key, int ki) {
        if (pi == pattern.length) {
            return ki == key.length;
        }
        String segment = pattern[pi];
        if ("#".equals(segment)) {
            // '#' puede consumir cero palabras...
            if (matches(pattern, pi + 1, key, ki)) {
                return true;
            }
            // ...o consumir una palabra mas y seguir intentando con '#'.
            return ki < key.length && matches(pattern, pi, key, ki + 1);
        }
        if (ki >= key.length) {
            return false;
        }
        if ("*".equals(segment) || segment.equals(key[ki])) {
            return matches(pattern, pi + 1, key, ki + 1);
        }
        return false;
    }
}
