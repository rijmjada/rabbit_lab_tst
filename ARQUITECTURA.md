# Arquitectura y código — guía técnica extendida

Este documento complementa al `README.md` (que explica *cómo correr* la app y *qué podés hacer* con ella) explicando *cómo está construida por dentro*: cada paquete del backend, cada pieza del frontend, y — lo más importante — el recorrido completo de datos cuando pasa algo (creás un escenario, mandás un mensaje, editás un binding). Está pensado para que alguien que nunca vio el código pueda entender no solo *qué* hace cada archivo, sino *por qué* está hecho así.

No es un documento de diseño aspiracional: todo lo que describe abajo está verificado contra el código real. Cuando algo está declarado pero no funciona todavía (hay un par de casos), lo digo explícitamente en vez de dejarlo ambiguo.

> Si buscás el diseño *propuesto* originalmente antes de implementar, ese es `PROPUESTA_ARQUITECTURA_RABBITMQ_PLAYGROUND.md`. Este documento describe lo que **existe hoy** en el código.

---

## 1. La idea en una frase

Cada pantalla de la app (Fanout, Direct, Topic, Headers, Default) declara una topología **real** en un broker de RabbitMQ real — no hay nada simulado en el enrutamiento — y te deja publicar mensajes y ver, en vivo, tres cosas que normalmente son invisibles: **qué decide el exchange**, **qué mensaje efectivamente le llega a cada cola**, y **cuándo esa cola lo confirma (ACK)**.

La app es, en el fondo, un cliente de administración de RabbitMQ con superpoderes didácticos: declara exchanges/colas/bindings vía la Admin API de Spring AMQP, publica con `mandatory=true` para poder mostrar mensajes no enrutados, y usa WebSocket para narrar en tiempo real lo que va pasando.

---

## 2. Mapa mental de las piezas

```
┌─────────────────────────────┐        HTTP REST         ┌──────────────────────────────┐
│  Navegador (React + Vite)   │ ────────────────────────▶ │   Spring Boot backend :8080  │
│                              │  crear/reset/borrar        │                              │
│  - Shell + 5 pantallas       │  escenario, publicar msg,  │  api → scenario → topology   │
│  - TopologyCanvas (SVG+HTML) │  editar bindings           │              ↘  routing       │
│  - hooks de estado/animación │                            │  messaging ← routing          │
│                              │ ◀──────────────────────── │  events ← messaging           │
│                              │   WebSocket/STOMP (/ws)    │  history ← messaging          │
│                              │   eventos en vivo          │                              │
└─────────────────────────────┘                            └──────────────┬───────────────┘
                                                                            │ AMQP real
                                                                            ▼
                                                              ┌──────────────────────────┐
                                                              │   RabbitMQ (Docker)      │
                                                              │   exchange + colas       │
                                                              │   reales, por sesión     │
                                                              └──────────────────────────┘
```

Dos canales entre navegador y backend, con roles muy distintos:

- **REST** (`/api/**`) es el canal de **comandos**: "creá un escenario", "publicá este mensaje", "guardá estos bindings". Siempre lo inicia el frontend, siempre hay una respuesta puntual.
- **WebSocket/STOMP** (`/ws`) es el canal de **narración**: una vez que el backend acepta un comando, todo lo que pasa *después* (el exchange evaluó el routing, la cola recibió el mensaje, el consumer hizo ACK) se transmite como una secuencia de eventos por este canal, sin que el frontend tenga que pedir nada. Es lo que hace posible la animación en tiempo real.

---

## 3. Stack tecnológico

| Capa | Tecnología | Versión / detalle |
|---|---|---|
| Backend | Spring Boot | 3.3.4, Java 21 |
| Backend | Spring AMQP | `RabbitTemplate`, `RabbitAdmin`, `SimpleMessageListenerContainer` |
| Backend | Spring WebSocket | STOMP sobre WebSocket, fallback SockJS |
| Backend | Lombok | `@Data`, `@Builder`, `@Slf4j`, etc. — reduce boilerplate en los modelos/DTOs |
| Mensajería | RabbitMQ | `3.13-management` (imagen Docker, incluye la UI en `:15672`) |
| Frontend | React | 19, con Vite como bundler/dev server |
| Frontend | TypeScript | tipado estricto en toda la app |
| Frontend | React Router | 7 — ruteo de las 6 pantallas |
| Frontend | `@stomp/stompjs` + `sockjs-client` | cliente STOMP para el canal de eventos en vivo |
| Frontend | CSS plano | sin framework de UI; un sistema de diseño propio en `index.css` |

No hay base de datos en ningún lado: el estado de escenarios e historial vive en memoria del proceso backend (`ConcurrentHashMap`/`ConcurrentLinkedDeque`). Es una decisión deliberada, documentada en el propio código (`MessageHistoryService`): es una herramienta didáctica de un solo nodo, no un sistema en producción, así que agregar persistencia solo sumaría complejidad sin sumar valor educativo.

---

## 4. El modelo mental clave: un "escenario" por sesión y por tipo de exchange

Todo en esta app gira alrededor de un concepto: el **Scenario** (`backend/scenario/Scenario.java`). Un escenario es "la instancia de topología que le corresponde a esta pestaña del navegador, para este tipo de exchange, en este momento". Tiene:

- un `id` propio (UUID, lo usa el frontend para todas las llamadas siguientes),
- un `sessionId` (quién es "esta pestaña"),
- un `type` (`FANOUT`/`DIRECT`/`TOPIC`/`HEADERS`/`DEFAULT`),
- un `exchangeName` real de RabbitMQ,
- la lista de `QueueConfig` (colas reales, con su binding actual).

### ¿Cómo sabe el backend quién es "esta pestaña"?

No hay cookies de sesión HTTP ni login. El mecanismo es a propósito mucho más simple:

1. La primera vez que el frontend arranca, `lib/session.ts` genera un id aleatorio corto (`crypto.randomUUID()` recortado a 12 caracteres) y lo guarda en memoria de esa pestaña (variable de módulo, `cachedSessionId` — **no** en `localStorage**, así que si recargás la página cambia).
2. Cada vez que el frontend crea un escenario (`api.createScenario`), manda ese `sessionId` en el body del `POST`.
3. El backend (`ScenarioService.sanitize()`) lo limpia — solo deja `[a-zA-Z0-9-]`, minúsculas, máximo 24 caracteres — y si viene vacío genera uno propio.
4. Ese `sessionId` saneado queda incrustado **literalmente** en el nombre del exchange y de cada cola: `edu.<sessionId>.<tipo>.main` para el exchange, `edu.<sessionId>.<tipo>.<slug-del-label>` para cada cola.

Por eso en el frontend ves nombres como `edu.c457f5c004d3.direct.main`: `edu` es un prefijo fijo (para que sea obvio en la UI de management de RabbitMQ cuáles son recursos de esta app), `c457f5c004d3` es tu `sessionId`, y `direct` el tipo. **No es un hash criptográfico de nada** — es literalmente tu id de sesión.

Esto es lo que garantiza que dos personas (o dos pestañas) usando la app al mismo tiempo no choquen: cada una tiene su propio namespace de recursos en el mismo broker.

### ¿Uno o varios escenarios por sesión?

Varios: cada tipo de exchange que visitás genera su propio `Scenario` (con su propio `id`), pero todos comparten el mismo `sessionId`. El frontend recuerda, por tipo (`hooks/useScenario.ts`, `scenarioCache`), cuál fue el último escenario creado para no duplicar topología si volvés a esa pantalla — mientras la pestaña siga abierta.

### ¿Y si cerrás la pestaña sin apretar "Limpiar"?

La topología queda huérfana en RabbitMQ (exchange + colas reales, sin nadie usándolas) hasta que `ScenarioCleanupScheduler` (backend) la detecte. Corre cada 5 minutos por defecto (`app.scenario.cleanup-interval-ms`) y borra escenarios sin actividad hace más de 30 minutos (`app.scenario.idle-timeout-minutes`) — "actividad" se refresca (`Scenario.touch()`) en cada publish. **Ojo**: esto depende de que el escenario siga en el mapa en memoria del backend; si el backend se reinicia, ese mapa se vacía y los recursos de RabbitMQ creados antes del reinicio quedan huérfanos sin que nada los limpie automáticamente.

---

## 5. Backend en profundidad

Ubicación: `backend/src/main/java/com/ayigroup/rabbitmq/playground/`. Ocho paquetes con una dependencia bastante lineal:

```
api  →  scenario  →  topology     (declara/borra en RabbitMQ real)
              │
              ├──────→  routing    (explica cómo va a enrutar, sin tocar RabbitMQ)
              │
              └──────→  messaging  →  events   (transmite por WebSocket)
                              │
                              └────→  history   (guarda en memoria)
```

### 5.1. `config` — cablear Spring

| Clase | Rol |
|---|---|
| `RabbitMqConfig` | Define el `RabbitAdmin` (con `ignoreDeclarationExceptions(true)`, para poder re-declarar un exchange existente sin que explote) y **reemplaza** el `RabbitTemplate` autoconfigurado por uno con `mandatory=true` fijo. |
| `WebSocketConfig` | Habilita STOMP: broker simple en `/topic`, endpoint de conexión `/ws` con SockJS. |
| `WebConfig` | CORS para `/api/**` — origen permitido configurable (`APP_CORS_ORIGIN`, default `http://localhost:5173`). |
| `SchedulerConfig` | Un `ScheduledExecutorService` de 4 hilos (`eventScheduler`) usado para espaciar en el tiempo la secuencia de eventos de un publish. |

**Por qué `mandatory=true` está fijo a nivel de bean y no por request**: es la pieza que hace posible mostrar "este mensaje no llegó a ninguna cola". Sin `mandatory`, RabbitMQ simplemente descarta en silencio un mensaje que no matchea ningún binding. Con `mandatory=true`, si nadie lo enruta, el broker lo **devuelve** al publisher (ver `ReturnsCallback` en la sección 5.5) en vez de tirarlo — y de ahí sale el evento `MESSAGE_RETURNED` que ves en la UI.

### 5.2. `scenario` — el orquestador

La pieza central es `ScenarioService`. Guarda todo en un `Map<String, Scenario>` en memoria (`ConcurrentHashMap`, clave = `scenario.id`) y expone las operaciones que el controller REST necesita:

| Operación | Qué hace realmente |
|---|---|
| `create(type, sessionId)` | Sanea el `sessionId`, genera los nombres `edu.*`, copia la config default para ese tipo (`ScenarioDefaults`), **declara todo en RabbitMQ real** (`TopologyManager.declare`), arranca los consumers (`DynamicConsumerManager.start`), guarda el escenario. |
| `reset(id)` | Vacía las colas (`purgeQueue`, no borra nada) + borra el historial. La topología (exchange/bindings) queda intacta. |
| `delete(id)` | Para los consumers, borra bindings + colas + exchange de RabbitMQ, borra el historial, saca el escenario del mapa. |
| `updateBindings(id, updates)` | Aplica los cambios de binding/pattern/headers por nombre de cola (ignora nombres desconocidos — no se pueden crear colas nuevas desde el editor de bindings) y re-declara en RabbitMQ (`TopologyManager.rebind`). |

`ScenarioDefaults.build(type)` es la que define qué colas/bindings trae cada pantalla al crear el escenario por primera vez — es la config "de fábrica" que ves reflejada en el editor de bindings al entrar.

`ScenarioCleanupScheduler` es la red de seguridad para pestañas cerradas sin limpiar (ver sección 4).

### 5.3. `topology` — la única clase que toca la Admin API de RabbitMQ

`TopologyManager` es literalmente el único punto del backend que llama a `RabbitAdmin`. Esto es intencional: si algún día hay que cambiar *cómo* se declaran las cosas (por ejemplo, para agregar TTL o Dead Letter Exchange), hay un solo lugar donde tocar.

Mapeo directo tipo → clase de Spring AMQP:

```java
FANOUT  → new FanoutExchange(name, durable=true, autoDelete=false)
DIRECT  → new DirectExchange(name, true, false)
TOPIC   → new TopicExchange(name, true, false)
HEADERS → new HeadersExchange(name, true, false)
DEFAULT → no declara exchange (usa el exchange anónimo "" de AMQP)
```

Los bindings de Headers son el caso más interesante — usan el mecanismo `x-match` **real** de RabbitMQ, no una simulación:

```java
BindingBuilder.bind(queue).to(headersExchange).whereAll(headerValues).match();  // x-match: all
BindingBuilder.bind(queue).to(headersExchange).whereAny(headerValues).match();  // x-match: any
```

Es decir: cuando editás los bindings de Headers en la UI, esos argumentos `x-match` se declaran de verdad en el broker — podés verificarlo abriendo la UI de management de RabbitMQ (`localhost:15672`) y mirando los argumentos del binding.

`purge()` vacía colas sin borrarlas (para "Reiniciar"); `delete()` borra todo (para "Limpiar"). El Default Exchange nunca tiene bindings que declarar/borrar — sus colas quedan vinculadas automáticamente por RabbitMQ usando su propio nombre como binding key, por diseño del protocolo AMQP, no por nada que haga esta app.

### 5.4. `routing` — la explicación didáctica (no es RabbitMQ hablando)

Este es el paquete que hace única a la herramienta frente a simplemente usar la consola de RabbitMQ: **antes** de publicar el mensaje de verdad, el backend calcula y explica cómo *debería* enrutar, cola por cola, con una razón en texto.

`RoutingEvaluator` es la interfaz (`evaluate(scenario, routingKey, headers) → List<RoutingDecision>`), y hay una implementación por tipo de exchange, todas inyectadas por Spring e indexadas en un mapa por `RoutingEvaluatorFactory`:

| Evaluator | Lógica |
|---|---|
| `FanoutRoutingEvaluator` | Sin lógica de matching: todas las colas `matched=true`, siempre. |
| `DirectRoutingEvaluator` | `bindingKey.equals(routingKey)` — coincidencia exacta. |
| `TopicRoutingEvaluator` | **Reimplementa** el algoritmo real de topic matching de AMQP: separa la routing key en segmentos por `.`, y hace backtracking recursivo para que `#` pueda matchear cero o más palabras y `*` exactamente una. |
| `HeadersRoutingEvaluator` | Reimplementa `x-match all/any`: compara cada header requerido contra el del mensaje (igualdad exacta de string) y decide según `all`/`any`. |
| `DefaultRoutingEvaluator` | Compara el label de la cola (no su nombre real de RabbitMQ) contra la routing key "de exhibición" — ver más abajo por qué. |

**Punto importante para entender bien la app**: esta evaluación es un *cálculo paralelo* hecho en Java, que imita lo que hará RabbitMQ, para poder mostrar la razón *antes* de que el mensaje viaje. El enrutamiento real después lo hace RabbitMQ con sus propios bindings reales (declarados por `TopologyManager`) — son dos caminos independientes que, si todo está bien implementado, siempre coinciden. La confirmación de que coincidieron es justamente lo que ves en la UI: la "decisión explicada" (evento `ROUTING_EVALUATED`, cálculo de Java) versus la entrega real reportada por los consumers (`MESSAGE_DELIVERED`/`MESSAGE_ACKED`, viene de RabbitMQ de verdad).

El caso de Topic vale la pena mirarlo en el código (`TopicRoutingEvaluator.matches`) si te interesa entender el algoritmo de matching de patrones — es una recursión corta pero no trivial:

```java
private boolean matches(String[] pattern, int pi, String[] key, int ki) {
    if (pi == pattern.length) return ki == key.length;
    if (pattern[pi].equals("#")) {
        return matches(pattern, pi + 1, key, ki)          // "#" no consume nada...
            || (ki < key.length && matches(pattern, pi, key, ki + 1)); // ...o consume una palabra y se prueba de nuevo
    }
    if (ki == key.length) return false;
    if (pattern[pi].equals("*") || pattern[pi].equals(key[ki])) {
        return matches(pattern, pi + 1, key, ki + 1);
    }
    return false;
}
```

### 5.5. `messaging` — publicar y consumir de verdad

Dos clases, cada una con una responsabilidad AMQP muy concreta.

**`MessagePublisherService`** — publica, y orquesta la *narración* de lo que va pasando:

1. Genera un `messageId` (UUID) — este id es la clave que correlaciona todo lo que pasa después con este mensaje puntual (headers AMQP `correlation-id`, historial, eventos WebSocket).
2. Calcula la "routing key de exhibición": para Default es el label de cola elegido en la UI; para el resto, la routing key tal cual la tipeó el usuario.
3. Llama al `RoutingEvaluator` correspondiente **antes** de publicar — esa es la `List<RoutingDecision>` que se guarda en el historial y se emite como evento.
4. Emite `MESSAGE_PUBLISHED` inmediatamente, y programa (`eventScheduler`, con `ScheduledExecutorService`) `ROUTING_EVALUATED` a los 350ms y la publicación AMQP real a los 500ms. **Estos delays son puramente cosméticos** — existen para que la animación en el frontend tenga un ritmo legible en vez de que todo pase en el mismo frame; no tienen ningún efecto en la semántica de AMQP.
5. La publicación real usa `rabbitTemplate.convertAndSend(exchangeName, routingKey, payload, postProcessor)`. El `postProcessor` fija `correlation-id`, `content-type: application/json`, el `delivery-mode` (persistente o no, según lo que pidió el usuario) y un header interno `x-edu-scenario-id` (para poder identificar a qué escenario pertenece un mensaje que vuelve por el `ReturnsCallback`).
6. Para Default Exchange, la routing key AMQP real que efectivamente viaja al broker es el **nombre completo de la cola** (`edu.<sesión>.default.<slug>`), no el label — el label es solo para que la UI sea legible.

El mecanismo de "mensaje no enrutado" es el `ReturnsCallback` de Spring AMQP (variante moderna del `ReturnCallback` clásico), registrado en `@PostConstruct`:

```java
rabbitTemplate.setReturnsCallback(this::handleReturned);
```

Se activa porque `mandatory=true` está fijo (sección 5.1) **y** porque `spring.rabbitmq.publisher-returns: true` está en `application.yml`. Cuando el broker no encuentra ninguna cola para enrutar, devuelve el mensaje acá; el handler busca el `messageId`/`scenarioId` en los headers, marca el registro de historial como `unrouted` y emite `MESSAGE_RETURNED`.

**`DynamicConsumerManager`** — un `SimpleMessageListenerContainer` por cola, con `AcknowledgeMode.MANUAL` **siempre** a nivel de Spring AMQP. La diferencia entre `AckMode.AUTO` y `AckMode.MANUAL` del *dominio de la app* no cambia ese modo — cambia únicamente cuánto tarda el código en llamar `channel.basicAck(...)`: 250ms para "automático", 900ms para "manual" (de nuevo, delays cosméticos para la animación, documentado explícitamente en el código: *"los consumidores confirman de verdad los mensajes al broker; lo único simulado es una pequeña demora antes del ACK"*).

Secuencia real por mensaje entregado:

```
RabbitMQ entrega el mensaje al listener
        │
        ▼
handleDelivery(): historial → "DELIVERED", emite MESSAGE_DELIVERED
        │
        ▼
   (250ms o 900ms después, según AckMode)
        │
        ▼
channel.basicAck(deliveryTag, false)   ← ACK real al broker, vía el Channel nativo
        │
        ▼
historial → "ACKED", emite MESSAGE_ACKED
```

### 5.6. `events` — la narración en tiempo real

`EventBroadcaster` tiene un único método:

```java
messagingTemplate.convertAndSend("/topic/scenarios/" + scenarioId + "/events", event);
```

Ese es **el** destination STOMP: un topic por escenario. El frontend se suscribe a `/topic/scenarios/{scenarioId}/events` apenas monta la pantalla correspondiente (ver `hooks/useScenarioSocket.ts`) y desde ahí recibe todo — no hay polling en ningún lado.

`MessageEventDto` es deliberadamente un DTO "ancho": un solo tipo con campos opcionales según el `EventType`, para que el frontend tenga un solo shape que parsear en vez de una unión de tipos distinta por evento. Los tipos posibles:

| `EventType` | Cuándo se emite | Campos relevantes |
|---|---|---|
| `MESSAGE_PUBLISHED` | Justo al recibir el `POST` de publish | `payload`, `routingKey`, `headers` |
| `ROUTING_EVALUATED` | 350ms después | `routingResult: List<RoutingDecision>` |
| `MESSAGE_DELIVERED` | Cuando el consumer real recibe el mensaje | `queueName`, `queueLabel`, `reason` (motivo de `x-death` si es una redelivery por dead-letter; `null` en la entrega normal) |
| `MESSAGE_ACKED` | Cuando el consumer real confirma | `queueName`, `queueLabel` |
| `MESSAGE_RETURNED` | Cuando el broker devuelve un mensaje sin enrutar | `reason` |
| `MESSAGE_REJECTED` | Cuando el consumer real rechaza el mensaje (`basicNack`, solo en el módulo Dead Letter Exchange — ver sección 13) | `queueName`, `queueLabel`, `reason` |

El endpoint de conexión (`/ws`, con SockJS de fallback) solo acepta *suscripciones* del cliente — hay un prefijo `/app` configurado para que el cliente pudiera enviar mensajes STOMP al servidor, pero no hay ningún `@MessageMapping` implementado, así que ese canal no se usa: toda escritura pasa por REST.

### 5.7. `history` — memoria de corto plazo

`MessageHistoryService` guarda, por escenario, un `ConcurrentLinkedDeque<MessageRecord>` acotado a 50 registros (FIFO: al superar el límite, se descarta el más viejo). Cada `MessageRecord` es el "expediente completo" de un mensaje: payload, routing key, headers, el resultado de la evaluación de routing, un mapa `cola → estado de entrega` (`PENDING/DELIVERED/ACKED/REJECTED`) que se va completando a medida que llegan eventos, y una bandera `unrouted`.

Es lo que respalda tanto el bloque "Historial de mensajes" de cada pantalla como la reconstrucción del estado inicial cuando el frontend entra a una pantalla con un escenario ya existente (`GET /api/scenarios/{id}/messages`).

### 5.8. `api` — la puerta REST

| Verbo + path | Hace |
|---|---|
| `POST /api/scenarios/{type}` | Crea un escenario del tipo dado. Body opcional `{ sessionId }`. |
| `GET /api/scenarios/{id}` | Estado actual del escenario. |
| `POST /api/scenarios/{id}/reset` | Purga colas + borra historial. |
| `DELETE /api/scenarios/{id}` | Borra todo (topología + historial + registro en memoria). |
| `PUT /api/scenarios/{id}/bindings` | Reconfigura bindings de las colas existentes. |
| `POST /api/scenarios/{scenarioId}/messages` | Publica un mensaje (dispara la secuencia de eventos, responde antes de que termine). |
| `GET /api/scenarios/{scenarioId}/messages` | Historial (hasta 50, más reciente primero). |

`GlobalExceptionHandler` traduce `ScenarioNotFoundException` → 404, `IllegalArgumentException` → 400, cualquier otra excepción → 500 con `{"error": "..."}`. No hay Bean Validation activa (`@Valid`) pese a que la dependencia está en el `pom.xml` — los DTOs no tienen anotaciones de validación todavía.

---

## 6. Frontend en profundidad

Ubicación: `frontend/src/`.

```
src/
├── main.tsx              punto de entrada — sin <StrictMode> a propósito (ver más abajo)
├── App.tsx                define las rutas con react-router-dom
├── index.css              sistema de diseño completo de la app (tokens, componentes, animaciones)
├── types/index.ts          todos los tipos compartidos, calcados 1:1 de los DTOs del backend
├── lib/
│   ├── api.ts              cliente REST (fetch envuelto)
│   ├── session.ts          genera/cachea el sessionId de esta pestaña
│   └── ws.ts               cliente STOMP compartido (una sola conexión para toda la app)
├── hooks/
│   ├── useScenario.ts       ciclo de vida de un escenario (crear/reset/borrar/bindings)
│   ├── useScenarioSocket.ts  se suscribe al topic de eventos de un escenario
│   ├── useMessageHistory.ts  historial + lo va actualizando con eventos en vivo
│   ├── useTopologyAnimation.ts  traduce eventos crudos → estado visual para el diagrama
│   ├── useExchangeBridgeAnimation.ts  lo mismo que el anterior, pero para dos exchanges + puente
│   └── useAlternateExchangeAnimation.ts  lo mismo, para exchange principal + alternativo
├── components/
│   ├── layout/Shell.tsx       sidebar + navegación + outlet de rutas
│   ├── topology/TopologyCanvas.tsx + topology.css   el diagrama SVG+HTML animado (1 exchange)
│   ├── topology/ExchangeBridgeCanvas.tsx             el mismo diagrama, para 2 exchanges + puente
│   ├── topology/AlternateExchangeCanvas.tsx          el mismo diagrama, para principal + alternativo
│   ├── scenario/ScenarioControls.tsx   botones Crear/Reiniciar/Limpiar
│   ├── messaging/MessageComposer.tsx    formulario de publicar
│   ├── messaging/MessageHistoryList.tsx  lista expandible de mensajes enviados
│   ├── binding/BindingEditor.tsx         editor de bindings (5 variantes: direct/topic/headers/exchange-bridge/alternate-exchange)
│   └── explain/ExplanationPanel.tsx      el cartel celeste con la explicación de cada pantalla
└── features/
    ├── home/HomeScreen.tsx
    ├── fanout/FanoutScreen.tsx
    ├── direct/DirectScreen.tsx
    ├── topic/TopicScreen.tsx
    ├── headers/HeadersScreen.tsx
    ├── default/DefaultScreen.tsx
    ├── exchange-to-exchange/ExchangeToExchangeScreen.tsx
    └── alternate-exchange/AlternateExchangeScreen.tsx
```

### 6.1. Por qué no hay `<StrictMode>`

Está comentado explícitamente en `main.tsx`: esta app crea infraestructura real en RabbitMQ al montar cada pantalla. El doble-montado que hace `StrictMode` en desarrollo (para ayudar a detectar efectos secundarios mal limpiados) generaría **dos escenarios reales** por cada visita a una pantalla. Es un trade-off consciente: se pierde una red de seguridad de React a cambio de no duplicar recursos en RabbitMQ en cada hot-reload.

### 6.2. `lib/` — las tres piezas de infraestructura

- **`session.ts`**: un id por pestaña, en memoria (no persiste entre recargas). Es lo que el backend usa como semilla del namespace `edu.<sessionId>` (ver sección 4).
- **`api.ts`**: un wrapper fino sobre `fetch`. Todo pasa por `request<T>()`, que agrega el header JSON, parsea errores (`{error: "..."}`) del backend y los relanza como `Error` de JS, y devuelve `undefined` en un 204. La URL base es configurable por variable de entorno de Vite (`VITE_API_BASE_URL`, default `http://localhost:8080`).
- **`ws.ts`**: la pieza más interesante de este grupo. `ScenarioSocket` mantiene **una sola conexión STOMP compartida** para toda la app (patrón singleton, `export const scenarioSocket = new ScenarioSocket()`), y expone `listen(scenarioId, handler) → unsubscribe`. Internamente:
  - Si todavía no hay conexión, la crea (`Client` de `@stomp/stompjs`, transporte `SockJS` apuntando a `/ws`) y la activa.
  - Guarda los handlers pendientes por `scenarioId` en un `Map<string, Set<handler>>`, así varios componentes pueden escuchar el mismo escenario sin pisarse.
  - Al conectar (o reconectar — `reconnectDelay: 3000`), se suscribe a todos los topics pendientes.
  - Cuando el último handler de un `scenarioId` se desuscribe, cancela la suscripción STOMP real — no deja topics fantasma escuchando.

  Esto significa que si navegás de Fanout a Direct, no se abre un socket nuevo: se reutiliza la conexión y simplemente cambia a qué topic estás suscripto.

### 6.3. `hooks/` — la lógica de estado, separada de la UI

- **`useScenario(type)`**: dueño del ciclo de vida completo de un escenario para una pantalla. Al montar, intenta reusar el escenario cacheado para ese tipo (`scenarioCache`, `Map` en memoria de módulo — sobrevive a re-renders pero no a un refresh de página) llamando `GET /api/scenarios/{id}`; si no existe o falló, crea uno nuevo. Expone `{ scenario, loading, error, create, reset, remove, updateBindings }` — cada feature-screen simplemente consume esto sin preocuparse por las llamadas HTTP.
- **`useScenarioSocket(scenarioId, onEvent)`**: la capa fina sobre `ws.ts` para components de React. Usa un `useRef` para guardar la versión más reciente del callback sin tener que forzar a quien lo llama a memoizarlo con `useCallback` — solo la suscripción real (ligada a `scenarioId`) se recrea cuando cambia el escenario.
- **`useMessageHistory(scenarioId)`**: carga el historial inicial por REST y después lo mantiene actualizado escuchando eventos (agrega un registro nuevo en `MESSAGE_PUBLISHED`, y va completando `routingResult`/`deliveries`/`unrouted` en los eventos siguientes que llegan para ese `messageId`). Maneja `MESSAGE_REJECTED` (`case "MESSAGE_REJECTED"`) igual que `MESSAGE_ACKED` — hoy el único emisor real es el módulo Dead Letter Exchange (sección 13), pero el hook no depende de ningún tipo de escenario en particular.
- **`useTopologyAnimation(scenarioId, queues)`**: el traductor entre "eventos crudos de WebSocket" y "qué debe brillar y cuándo en el diagrama". Mantiene, por cola, contadores (`flowTick`, `rejectTick`, `deliverTick`, `ackTick`) que se incrementan en cada evento relevante — esos contadores son la clave de cómo se re-disparan las animaciones (ver sección 6.5): en vez de depender de que una clase CSS cambie de valor (que no alcanza si dos mensajes consecutivos caen en el mismo estado), cada evento nuevo incrementa un número, y ese número se usa como parte de la `key` de React de un elemento — forzando que React lo desmonte y remonte, lo cual reinicia cualquier animación CSS asociada.

### 6.4. `components/` — piezas reusadas por las 5 pantallas de exchange

Las cinco pantallas (`features/*/....Screen.tsx`) son deliberadamente casi idénticas en estructura — cada una es básicamente una configuración distinta de las mismas piezas:

```
<page-header>              título + descripción de una línea
<ExplanationPanel>          el cartel celeste con la explicación pedagógica específica de ese tipo
<layout-grid>
  ├─ <TopologyCanvas>        el diagrama
  ├─ <BindingEditor>         (no existe en Fanout/Default — no hay nada que bindear)
  ├─ <ScenarioControls>       Crear/Reiniciar/Limpiar
  └─ <MessageComposer>        el formulario de publicar
<MessageHistoryList>         el historial, debajo de todo
```

Lo que cambia entre pantallas son props: qué label mostrar, si se muestra el campo de routing key o un selector de cola destino (Default) o cabeceras (Headers), y la variante del `BindingEditor` (`"direct" | "topic" | "headers"`).

- **`ScenarioControls`**: tres botones atados 1:1 a `useScenario`. "Crear" solo habilitado si no hay escenario; "Reiniciar"/"Limpiar" solo si hay uno.
- **`MessageComposer`**: un formulario configurable por props (`showRoutingKey`, `routingKeyIgnored`, `showHeaders`, `targetQueueOptions`) que cubre los 5 casos distintos de "qué le tengo que pedir al usuario para publicar en este tipo de exchange" con un solo componente. Valida el JSON del payload en el cliente antes de mandarlo.
- **`MessageHistoryList`**: lista de mensajes enviados, con cada ítem expandible (click) para ver el payload completo, headers, y el detalle de la evaluación de routing por cola (ícono ✓/✗ + razón textual que viene del backend).
- **`BindingEditor`**: tres variantes de UI para el mismo propósito — editar la config de binding de cada cola y guardarla (`PUT /api/scenarios/{id}/bindings`). Direct/Topic son una tabla simple (un input por cola); Headers es más elaborado porque cada cola puede tener varias cabeceras clave/valor más un selector `x-match: all/any`.
- **`ExplanationPanel`**: un wrapper de una sola clase CSS — existe como componente separado más por consistencia semántica que por lógica.

### 6.5. `TopologyCanvas` — el diagrama, en detalle

Es la pieza más elaborada del frontend, así que vale la pena entender su arquitectura interna.

**El problema que resuelve**: dibujar cajas (producer, exchange, colas, consumers) y las líneas curvas que las conectan, de forma que ambas cosas — cajas en HTML, líneas en SVG — queden siempre alineadas entre sí sin importar el ancho real del contenedor (la página es responsive).

**La solución**: un sistema de coordenadas "virtual" fijo (`WIDTH = 1050` unidades, alto variable según cuántas colas haya) calculado una sola vez por `layout()`. Todo (posición y tamaño de cada caja, y los puntos de las curvas SVG) se calcula en esas unidades virtuales, y después:

- Las cajas HTML se posicionan con `left`/`top`/`width`/`height` en **porcentaje** de esas unidades virtuales (función `box()`).
- El `<svg>` usa `viewBox="0 0 WIDTH height"` con `preserveAspectRatio="none"` — esto le dice al navegador "estirate para llenar el contenedor sin mantener proporción", exactamente el mismo comportamiento que el porcentaje de las cajas HTML. Como resultado, ambas capas escalan idéntico sin ningún cálculo en JavaScript en tiempo de resize.

Las curvas se generan con una Bézier cúbica simple (`curve(x1,y1,x2,y2)`) que sale horizontal de un lado y entra horizontal del otro, con el punto de control a mitad de camino — es lo que le da esa forma de "S" suave a las conexiones.

**Cómo se dispara cada animación** — este es el punto más sutil del componente, y vale la pena entenderlo porque es un patrón que se repite:

1. **Pulso del producer/exchange** (`usePulseClass`): un hook chiquito que, cuando el `tick` que recibe cambia, activa una clase por 700ms y la desactiva con un `setTimeout`. Sirve para nodos que no se remontan (producer/exchange existen todo el tiempo).
2. **Paquete viajando** (el punto naranja/verde que recorre la curva): en vez de animar con JS la posición de un elemento, se usa **CSS motion path** (`offset-path: path('<mismo d que el <path> SVG>')` + `animation` que anima `offset-distance` de 0% a 100%). El truco para que la animación se "repita" en cada mensaje nuevo, incluso si el mensaje anterior tuvo el mismo resultado (matched → matched otra vez), es que el `<circle>` se renderiza condicionalmente con una **`key` que incluye un contador** (`flowTick`, `deliverTick`, etc.). Como React ve una key distinta, desmonta el círculo viejo y monta uno nuevo — lo cual reinicia la animación CSS desde cero, sin necesitar ningún código imperativo.
3. **Mensaje rechazado (no matchea)**: a propósito **no** viaja nada por la línea — el feedback es un pequeño destello (`reject-blip`) pegado al borde del exchange (`offset-distance` fijo, sin animar la posición) más un aro rojo que destella sobre la cola. La idea es que el exchange evalúa el binding y descarta el mensaje ahí mismo — nunca "sale" nada hacia la cola que no matchea, que es justamente lo que pasa en RabbitMQ real.
4. **Texto de largo variable** (nombre de exchange generado, resumen de varias cabeceras): las cajas del exchange y de las colas están dimensionadas generosamente y el label se corta a 2 líneas con `-webkit-line-clamp`, pero el sub-texto de la cola (que puede crecer si el usuario agrega muchas cabeceras) **no** tiene límite de líneas — prefiere desbordar visualmente la tarjeta a comerse texto en silencio.

### 6.6. `index.css` — el sistema de diseño

No hay ningún framework de UI (ni Tailwind, ni MUI, etc.): todo el look de la app — tokens de color/espaciado/sombra, botones, cards, badges, formularios, sidebar colapsable, y las animaciones de entrada (`rise-in`, `pop-in`) — vive en este único archivo (más `topology.css`, específico del diagrama). Ideas clave si vas a tocarlo:

- Todas las variables de diseño están en `:root` (`--color-*`, `--radius-*`, `--shadow-*`, `--ease-*`) — cambiar la paleta es cambiar unas pocas líneas ahí arriba.
- Los estilos de `input`/`textarea`/`select` son **globales** (no solo dentro de `.field`) a propósito: los inputs de las filas de cabeceras y la tabla de bindings no viven dentro de un `.field`, así que si el estilo estuviera scoped ahí quedarían con el look nativo del navegador.
- El sidebar colapsable (`Shell.tsx`) guarda su estado en `localStorage` para que se recuerde entre sesiones.
- `@media (prefers-reduced-motion: reduce)` apaga las animaciones más notorias (el paquete viajando, el destello de rechazo) para quien lo prefiera.

---

## 7. El recorrido completo, paso a paso

### 7.a. Entrás a `/fanout` por primera vez

1. `FanoutScreen` monta → `useScenario("FANOUT")` corre su efecto: no hay nada en `scenarioCache` para `FANOUT`, así que llama `create()`.
2. `POST /api/scenarios/FANOUT` con `{ sessionId: "<el de esta pestaña>" }`.
3. Backend: `ScenarioService.create()` sanea el `sessionId`, arma `exchangeName = "edu.<sessionId>.fanout.main"` y 3 colas de demo (`ScenarioDefaults`), declara todo en RabbitMQ real (`TopologyManager.declare`), arranca 3 `SimpleMessageListenerContainer` (`DynamicConsumerManager.start`), devuelve el `ScenarioResponse`.
4. Frontend recibe el escenario, lo guarda en `scenarioCache` y en el estado de React. `TopologyCanvas` ya tiene qué dibujar (colas reales, con sus nombres/labels).
5. En paralelo, `useMessageHistory` pide `GET /api/scenarios/{id}/messages` (vacío, recién creado) y `useScenarioSocket` abre/reusa la conexión STOMP y se suscribe a `/topic/scenarios/{id}/events`.

### 7.b. Publicás un mensaje

1. `MessageComposer` valida el JSON del payload en el cliente y llama `onSend`, que dispara `api.publishMessage(scenarioId, { payload, routingKey, mandatory: true, persistent: true })`.
2. `POST /api/scenarios/{id}/messages`. El controller delega en `MessagePublisherService.publish()`.
3. Backend calcula la routing key de exhibición, evalúa el routing con el evaluator de Fanout (todas las colas `matched=true`), guarda el registro en `MessageHistoryService`, **responde de inmediato** al HTTP con `{ messageId, resolvedRoutingKey, routingResult }` — la publicación AMQP real todavía no pasó.
4. En simultáneo (mismo hilo, antes de responder), emite `MESSAGE_PUBLISHED` por WebSocket → el frontend recibe el evento, `useTopologyAnimation` incrementa `producerTick` → el producer "pulsa".
5. 350ms después (timer del backend): evento `ROUTING_EVALUATED` → el frontend marca las 3 colas como `matched`, cada una dispara su pulso verde y el "paquete" empieza a viajar por la curva exchange→cola.
6. 500ms después: el backend hace la publicación AMQP **real** (`rabbitTemplate.convertAndSend`). Como es Fanout, RabbitMQ entrega una copia a cada una de las 3 colas.
7. Cada consumer real recibe su copia → `DynamicConsumerManager.handleDelivery()` emite `MESSAGE_DELIVERED` por cola → 250ms después, `channel.basicAck()` real + evento `MESSAGE_ACKED`.
8. El frontend va reflejando cada uno de estos eventos en tiempo real: el consumer pasa de "En espera" a "Procesando…" a "ACK ✓", con su propio paquete viajando por la curva cola→consumer.

Si en cambio fuera Direct/Topic/Headers y el mensaje **no** matcheara ninguna cola: en el paso 6, `mandatory=true` hace que RabbitMQ devuelva el mensaje al backend en vez de descartarlo → `ReturnsCallback` → evento `MESSAGE_RETURNED` → el frontend marca el mensaje como "no enrutado" en el historial, y ninguna cola muestra actividad de entrega (solo el destello de rechazo puntual en el exchange).

### 7.c. Editás un binding (por ejemplo, cambiás la binding key de una cola en Direct)

1. `BindingEditor` guarda el cambio en estado local (no pega nada al backend hasta apretar "Guardar").
2. Al guardar: `PUT /api/scenarios/{id}/bindings` con la lista completa de `QueueConfigDto`.
3. Backend: `ScenarioService.updateBindings()` aplica los cambios sobre una copia de la config actual, y `TopologyManager.rebind()` remueve los bindings viejos y declara los nuevos en RabbitMQ real — sin recrear las colas (los mensajes que ya estaban en cola no se pierden).
4. El frontend recibe el `ScenarioResponse` actualizado y reemplaza su estado — el diagrama y el editor reflejan el binding nuevo inmediatamente.

### 7.d. Apretás "Limpiar" (o cerrás la pestaña sin apretarlo)

- **Con el botón**: `DELETE /api/scenarios/{id}` → para consumers, borra bindings + colas + exchange en RabbitMQ, borra historial, sacando el escenario del mapa. El frontend limpia su estado local y muestra "Sin escenario creado".
- **Cerrando la pestaña sin limpiar**: nada se dispara del lado del cliente (no hay un handler de `beforeunload`). El escenario queda vivo en el backend y la topología sigue existiendo en RabbitMQ hasta que `ScenarioCleanupScheduler` lo detecte como inactivo (ver sección 4).

---

## 8. Protocolo WebSocket/STOMP — referencia rápida

| | |
|---|---|
| Endpoint de conexión | `ws://localhost:8080/ws` (con fallback SockJS si el navegador no soporta WebSocket nativo) |
| Prefijo de broker | `/topic` (simple broker en memoria, no hay un broker externo como ActiveMQ detrás) |
| Destination al que te suscribís | `/topic/scenarios/{scenarioId}/events` — uno por escenario |
| Canal de escritura cliente→servidor | No implementado (`/app` está configurado pero sin `@MessageMapping`) — toda escritura es REST |
| Formato del mensaje | JSON, deserializable directo a `MessageEventDto` (frontend) / serializado desde el mismo tipo (backend) |
| Reconexión | El cliente (`ws.ts`) reintenta cada 3000ms si se cae la conexión, y re-suscribe automáticamente todos los topics pendientes al reconectar |

---

## 9. Glosario rápido de RabbitMQ (para ubicarse en el código)

- **Exchange**: el punto de entrada al que publicás. No almacena nada — solo decide, según su tipo y sus bindings, a qué colas reenviar cada mensaje.
- **Binding**: la regla que conecta una cola a un exchange. Según el tipo de exchange, lleva distinta información: una *binding key* (Direct), un *patrón* con `*`/`#` (Topic), o pares clave/valor + `x-match` (Headers). Fanout no necesita ninguna información extra en el binding — conecta y ya.
- **Routing key**: la etiqueta que le pones al mensaje al publicarlo. El exchange la usa (o la ignora, en Fanout) para decidir a qué colas va.
- **`mandatory`**: flag de publicación que le dice al broker "si no podés enrutar este mensaje a ninguna cola, devolvémelo en vez de descartarlo". Sin este flag, un mensaje no enrutado desaparece silenciosamente — es indistinguible de que todo funcionó.
- **ACK (`basicAck`)**: la confirmación explícita de un consumer de "recibí y procesé este mensaje, podés borrarlo de la cola". Si un consumer se desconecta sin confirmar, RabbitMQ reencola el mensaje para otro consumer.
- **`x-match` (Headers exchange)**: `all` exige que coincidan *todas* las cabeceras configuradas en el binding; `any` alcanza con que coincida una sola.
- **Default Exchange**: el exchange sin nombre (`""`) que trae RabbitMQ de fábrica. Cada cola queda ligada a él automáticamente usando su propio nombre como binding key — por eso "publicar a una cola por su nombre" funciona sin declarar nada.
- **Publisher returns**: el mecanismo (`ReturnsCallback`) por el cual el broker devuelve al publisher un mensaje `mandatory` que no pudo enrutar. Distinto de los *publisher confirms* (que confirman que el broker recibió el mensaje, no que lo enrutó) — este proyecto tiene confirms habilitado en la config de conexión pero no lo usa en el código (ver limitaciones).

---

## 10. Limitaciones conocidas (declaradas en el código, no implementadas del todo)

Para no generar una imagen más prolija de la que hay — esto es exactamente lo que encontré revisando el código fuente, no una lista aspiracional:

1. **Publisher confirms configurados pero no usados.** `application.yml` tiene `publisher-confirm-type: correlated`, pero no hay ningún `ConfirmCallback`/`CorrelationData` registrado en el código — solo se usa el mecanismo de *returns*.
2. **El canal de escritura STOMP cliente→servidor no existe.** El prefijo `/app` está configurado pero sin ningún `@MessageMapping` — toda escritura es HTTP REST.
3. **Sin Bean Validation activa.** La dependencia `spring-boot-starter-validation` está en el `pom.xml`, pero no hay `@Valid`/`@NotNull` en los DTOs ni controllers.
4. **Sin persistencia.** Escenarios e historial viven en memoria del proceso backend — un restart los pierde a todos (y, como se explicó en la sección 4, deja huérfanos los recursos ya declarados en RabbitMQ).
5. **Sin autenticación.** Ni los endpoints REST ni el handshake WebSocket requieren credenciales — cualquiera con acceso a la red puede crear/borrar escenarios.
6. **El flag `mandatory` del request es informativo.** El request de publish acepta `mandatory: boolean`, y se guarda en el historial, pero el flag AMQP real siempre es `true` (fijado permanentemente en el bean `RabbitTemplate`) sin importar lo que mande el cliente.

---

## 11. El módulo "Exchange → Exchange": binding entre exchanges

Los primeros cinco tipos cubren cómo decide *un* exchange. Este módulo enseña algo distinto: un exchange puede estar bindeado a **otro exchange**, no solo a colas — los mensajes que matchean ese binding se reenvían, con la routing key intacta, al segundo exchange, que vuelve a evaluar sus propios bindings sobre esa misma key. Verificado contra un RabbitMQ real durante el desarrollo (no es una simulación): la UI de management muestra el binding con `destination_type: "exchange"`, y un mensaje publicado en Exchange 1 que cruza el puente llega con un ACK real del consumer de la cola en Exchange 2.

### 11.1. Por qué reusa `ExchangeType` en vez de un concepto nuevo

Se agregó `EXCHANGE_TO_EXCHANGE` como un valor más del enum `ExchangeType` (backend y frontend), en vez de introducir un "tipo de escenario" paralelo. Mantiene la API REST uniforme (`POST /api/scenarios/{type}` sigue funcionando igual) a costa de una pequeña impureza semántica: este valor no describe un *algoritmo de matching* como los otros cinco, describe una *forma de escenario* (dos exchanges encadenados). Se aceptó el trade-off porque evita duplicar el ciclo de vida completo (crear/reset/borrar/idle-timeout) para un caso que en todo lo demás se comporta igual.

Los dos exchanges encadenados son **ambos Topic** (no Direct, como en el diseño inicial). Se cambió a propósito: con Direct, el binding puente era una simple igualdad de strings, que no dejaba ver nada nuevo sobre *cómo* viaja la routing key entre exchanges. Con Topic, la misma key se reevalúa con patrones (`*`/`#`) **de forma independiente en cada salto** — el patrón del puente en Exchange 1 no tiene por qué parecerse al patrón de la cola que finalmente matchea en Exchange 2 — lo que deja mucho más claro que el puente reenvía la key intacta y que cada exchange la reinterpreta desde cero con sus propias reglas. El costo es que el módulo ahora asume que ya viste el algoritmo de matching de Topic (cubierto en la sección de ese módulo); el foco pedagógico sigue siendo el binding puente en sí, no volver a enseñar wildcards.

### 11.2. Modelo y nombres reales en RabbitMQ

- `Scenario` gana `secondaryExchangeName` (el "Exchange 2") y `bridgeBindingKey`.
- `QueueConfig` gana `boundExchange` (`PRIMARY` | `SECONDARY`, enum `BoundExchange`): a cuál de los dos exchanges pertenece la cola. Se fija en `ScenarioDefaults.build(EXCHANGE_TO_EXCHANGE)` al crear el escenario y **nunca se reasigna después** — `ScenarioService.updateBindings()` deliberadamente no lo toca, porque no es un binding editable, es la topología misma.
- Nombres reales: `ScenarioService.typeSlug()` mapea este tipo al slug corto `"bridge"` (en vez de `"exchange_to_exchange"`, para que el nombre no quede innecesariamente largo en la UI — la misma lección aprendida con el desborde de texto del exchange en el resto de la app). Resultado: `edu.<sesión>.bridge.main` (Exchange 1), `edu.<sesión>.bridge.exchange2` (Exchange 2), `edu.<sesión>.bridge.<slug-cola>` por cada cola.

Escenario de demostración por defecto (`ScenarioDefaults`) — `bindingKey` de `QueueConfig` queda sin usar para este tipo, todas las binding keys (de colas y del puente) se guardan en el campo `pattern`:

```
Exchange 1 "Pedidos" (Topic)
  └─ Cola "Urgentes"          patrón = "pedido.urgente.#"

Binding puente Exchange 1 → Exchange 2:  patrón = "pedido.#"

Exchange 2 "Auditoría" (Topic)
  ├─ Cola "Todos los pedidos" patrón = "pedido.#"
  └─ Cola "Cancelaciones"     patrón = "pedido.cancelado.*"
```

El puente usa `pedido.#` (todo lo que sea del dominio "pedido") y no algo más angosto como `pedido.creado.#`: la idea es que el puente decide qué *entra* al dominio de auditoría, y una vez adentro, las colas de Exchange 2 son las que filtran subconjuntos — igual que pasaría con un exchange Topic real bindeado a colas. Si el puente fuera más angosto, "Todos los pedidos" mentiría con su nombre (no recibiría *todos* los pedidos, solo los creados).

### 11.3. Declarar el binding puente de verdad (`TopologyManager`)

Spring AMQP soporta bindings exchange-a-exchange de forma nativa: `BindingBuilder.bind(Exchange).to(Exchange)` devuelve un `Binding` con `Binding.DestinationType.EXCHANGE` en vez de `QUEUE`, y `RabbitAdmin.declareBinding()` lo traduce a un `exchangeBind` de AMQP (no a un `queueBind`). `TopologyManager` agrega tres métodos paralelos a los que ya tenía — `declareExchangeToExchange`, `rebindExchangeToExchange`, `deleteExchangeToExchange` — sin tocar el camino de los otros cuatro tipos:

```java
private Binding bridgeBindingWithKey(TopicExchange primary, TopicExchange secondary, String bridgePattern) {
    return BindingBuilder.bind(secondary).to(primary).with(nullToEmpty(bridgePattern));
}
```

Nótese que el código de `BindingBuilder` es idéntico al que usa `DIRECT`/`TOPIC` para bindings cola-exchange — la diferencia entre igualdad exacta y wildcards no vive en cómo se declara el binding, sino en el tipo de exchange (`TopicExchange` en vez de `DirectExchange`) y en cómo el broker interpreta esa key al enrutar.

`declare()`/`rebind()`/`delete()` ganan un branch al principio que delega a estos métodos cuando `scenario.getType() == EXCHANGE_TO_EXCHANGE`; `purge()` no necesitó cambios (ya itera `getQueues()` sin importar a qué exchange pertenece cada una). Al editar la binding key del puente desde la UI, `rebindExchangeToExchange` remueve el binding viejo (con la key anterior, capturada por `ScenarioService.updateBindings()` **antes** de mutar el escenario) y declara el nuevo — sin tocar las colas.

### 11.4. Routing explicado en dos saltos (`ExchangeToExchangeRoutingEvaluator`)

A propósito **no** implementa la interfaz `RoutingEvaluator` que usan los otros cuatro: esa interfaz no tiene noción de "a qué exchange entró el mensaje" (acá hay dos exchanges posibles como puerta de entrada), y no valía la pena forzarle ese parámetro a evaluadores que no lo necesitan. Es un `@Component` aparte, invocado directamente por `MessagePublisherService` cuando el escenario es de este tipo, con una firma distinta: `evaluate(Scenario, BoundExchange target, String routingKey)`.

Un mensaje matchea una cola de dos formas: **directo** (la cola vive en el mismo exchange donde se publicó, y su patrón coincide con la routing key) o **reenviado** (se publicó en Exchange 1, la routing key coincide con el patrón del puente, y la cola vive en Exchange 2 con un patrón que *también* coincide con esa misma key). El puente nunca reenvía en sentido inverso. Como ambos exchanges son Topic, el matching ya no es una igualdad de strings: se reusa el mismo algoritmo recursivo de segmentos que `TopicRoutingEvaluator` (extraído a `TopicPatternMatcher`, una clase de paquete compartida por los dos evaluadores para no duplicar la recursión de `*`/`#`). El `reason` de cada `RoutingDecision` distingue explícitamente 5 casos (match directo / reenviado cruzando el puente / no coincide con el patrón propio / no puede llegar por estar del otro lado / cruza el puente pero no coincide con esta cola en particular) — verificado con los 4 casos de la demo:

| Se publica en | Routing key | Resultado real (verificado) |
|---|---|---|
| Exchange 1 | `pedido.urgente.entrega` | Matchea "Urgentes" (directo, `pedido.urgente.#`) **y** cruza el puente (`pedido.#`) → ACK real también en "Todos los pedidos" (Exchange 2) — un mismo mensaje matcheando en los dos exchanges a la vez |
| Exchange 1 | `pedido.cancelado.stock` | No matchea "Urgentes"; cruza el puente → ACK real en **dos** colas de Exchange 2 a la vez: "Todos los pedidos" (`pedido.#`) y "Cancelaciones" (`pedido.cancelado.*`) — fan-out dentro del exchange de destino |
| Exchange 1 | `envio.confirmado` | No matchea "Urgentes" ni el patrón del puente (no empieza con `pedido.`) → mensaje devuelto (`MESSAGE_RETURNED`): no pertenece al dominio de este exchange, nunca cruza |
| Exchange 2 | `pedido.cancelado.stock` | Matchea "Todos los pedidos" y "Cancelaciones" directo, sin pasar por el puente — el mismo fan-out de arriba, pero sin cruzar nada |

La lección central del módulo sigue siendo la misma: el puente decide qué entra a Exchange 2, de forma completamente independiente de los patrones de sus colas — pero acá, además, se ve que una vez que un mensaje cruza (o se publica directo), Exchange 2 lo trata como cualquier Topic exchange: puede fan-outear a varias colas si varios patrones matchean.

### 11.5. Publicar a uno de dos exchanges (`MessagePublisherService`, `PublishMessageRequest`)

`PublishMessageRequest` gana `targetExchange: BoundExchange` (null se trata como `PRIMARY`). `MessagePublisherService.resolveAmqpExchange()` elige `scenario.getExchangeName()` o `scenario.getSecondaryExchangeName()` según ese campo antes de llamar `rabbitTemplate.convertAndSend(...)`. `MessageEventDto.published(...)` gana un parámetro `enteredExchange` (mismo enum) para que **cualquier pestaña** escuchando el WebSocket sepa qué línea del diagrama pulsar, sin depender de haber sido ella la que publicó — el mismo desacople que ya tenía el resto de la animación.

### 11.6. Frontend: un diagrama y un hook nuevos, en paralelo a los existentes

Se optó por **no** generalizar `TopologyCanvas`/`useTopologyAnimation` para soportar N exchanges — hubiera significado tocar el layout y el reducer de eventos que ya usan, sin cambios, las otras 5 pantallas. En cambio:

- **`ExchangeBridgeCanvas`** reimplementa el mismo sistema de coordenadas virtuales (`box()`/`curve()`) que `TopologyCanvas`, pero apilando dos "bandas" (Exchange 1 arriba con sus colas, Exchange 2 abajo con las suyas) separadas por un hueco donde va el conector del puente — una curva vertical propia (`verticalCurve()`), con su color (`--color-bridge`, un rosa/magenta distinto de los otros cinco) y su propio "paquete" viajando (reusa la misma técnica de `offset-path` + remount por `key` que ya usan las otras conexiones). Reusa las clases CSS existentes (`.topology-node`, `.topology-edge`, `.packet-dot`, `.node-reject-flash`) para verse consistente con el resto de la app.
- **`useExchangeBridgeAnimation`** reimplementa (no comparte) el reducer de `useTopologyAnimation`, agregando `primaryExchangeTick`/`secondaryExchangeTick`/`bridgeTick`. La parte no trivial: `ROUTING_EVALUATED` no repite a qué exchange entró el mensaje (ese dato solo viaja en `MESSAGE_PUBLISHED`), así que el hook guarda `enteredExchange` por `messageId` en un `Map` (`useRef`, no dispara re-render) para poder decidir, al recibir `ROUTING_EVALUATED`, si un match en una cola de Exchange 2 fue directo o llegó cruzando el puente.
- **`BindingEditor`** gana una cuarta variante (`"exchange-bridge"`): un campo destacado para el patrón del puente, y dos tablas ("Colas de Exchange 1" / "Colas de Exchange 2") agrupando por `boundExchange`, editando el campo `pattern` de cada cola (igual que la variante `"topic"`). `onSave` ahora acepta un segundo parámetro opcional (`bridgeBindingKey`) — como es opcional, las otras 3 variantes (que no lo mandan) siguen compilando sin tocarlas.
- **`MessageComposer`** gana `targetExchangeOptions` (selector "Publicar en: Exchange 1 / Exchange 2"), que a diferencia de `targetQueueOptions` (Default Exchange) **coexiste** con el campo de routing key en vez de reemplazarlo. Ambos selectores comparten ahora el mismo hook interno `useSyncedSelection` — la solución al bug de Default Exchange donde el `<select>` mostraba una opción marcada pero el estado real seguía vacío porque las opciones llegaban recién después del primer render.

---

## 12. El módulo "Alternate Exchange": reenvío automático de lo no enrutado

Contraste pedagógico con el módulo anterior: en "Exchange → Exchange" un binding reenvía lo que **sí** matchea un patrón. Acá es la otra cara de la misma moneda — un exchange puede declararse con un argumento `alternate-exchange` apuntando a otro exchange, y RabbitMQ reenvía ahí, automáticamente, **todo mensaje que no matchea ningún binding** del exchange principal. No hay ningún patrón que configurar para que el reenvío se dispare: el disparador es, exactamente, "nada matcheó".

Verificado contra un RabbitMQ real: la UI de management muestra el `arguments` del exchange principal con `"alternate-exchange": "<nombre del alternativo>"`, y un mensaje con `mandatory=true` que no matchea ningún binding propio termina con ACK real en la cola del alternativo — **no** se devuelve (`MESSAGE_RETURNED`), porque para RabbitMQ terminar en el alternate exchange también cuenta como "enrutado".

### 12.1. Por qué el exchange principal es Direct y el alternativo es Fanout

`ALTERNATE_EXCHANGE` es un valor más de `ExchangeType`, mismo criterio que `EXCHANGE_TO_EXCHANGE`. El principal es **Direct** (matching trivial de leer, para no competir por atención con el concepto nuevo) y el alternativo es **Fanout** — el uso real más común de esta feature es justamente un "catch-all" que recibe todo sin importar la key, sin necesidad de declarar ningún binding key en el alternativo. También le da variedad de tipos frente al módulo anterior (que encadenaba dos Topic).

### 12.2. Modelo: reusa `BoundExchange`, sin equivalente al "bridge key"

- Reusa `secondaryExchangeName` (el exchange alternativo) y el enum `BoundExchange` (`PRIMARY`/`SECONDARY`) tal cual como están, sin agregar ningún tipo nuevo — a diferencia del puente, que sí tiene una key editable (`bridgeBindingKey`), la relación alternate-exchange **no tiene ningún estado editable propio**: es un argumento fijo del exchange principal, declarado una sola vez al crear el escenario y nunca vuelto a tocar. `bridgeBindingKey` queda `null` para este tipo.
- Escenario de demostración por defecto (`ScenarioDefaults`):

```
Exchange "Pedidos" (Direct) — con alternate-exchange = exchange de abajo
  ├─ Cola "Urgentes"  bindingKey = "urgente"
  └─ Cola "Normales"  bindingKey = "normal"

Exchange "Sin clasificar" (Fanout, alternativo)
  └─ Cola "Huérfanos"  (fanout, sin binding key)
```

- Nombres reales: `ScenarioService.typeSlug()` mapea este tipo al slug corto `"alt"`. Resultado: `edu.<sesión>.alt.main` (principal), `edu.<sesión>.alt.exchange2` (alternativo), `edu.<sesión>.alt.<slug-cola>` por cada cola.

### 12.3. Declarar el alternate exchange de verdad (`TopologyManager`)

Spring AMQP tiene soporte de primera clase para esto — no hace falta declarar el argumento a mano con `withArgument("alternate-exchange", ...)`, `ExchangeBuilder` ya tiene un método dedicado (confirmado con `javap` contra el jar real del proyecto):

```java
DirectExchange main = ExchangeBuilder.directExchange(scenario.getExchangeName())
        .durable(true)
        .alternate(scenario.getSecondaryExchangeName())
        .build();
```

`declareAlternateExchange` declara primero el Fanout alternativo y después el Direct principal (con el argumento ya apuntando a un nombre que existe). A diferencia del puente de `EXCHANGE_TO_EXCHANGE`, acá `rebindAlternateExchange` es más simple: no hay nada análogo a "la binding key del puente" que quitar y volver a poner — el argumento se fija una sola vez al declarar y nunca se reconfigura, así que reconfigurar bindings solo significa re-bindear colas (`alternateQueueBinding`: la cola `SECONDARY` se bindea al Fanout sin key, las `PRIMARY` al Direct con su `bindingKey`, mismo patrón que el caso `DIRECT` ya existente).

### 12.4. Routing explicado (`AlternateExchangeRoutingEvaluator`)

Mismo motivo que `ExchangeToExchangeRoutingEvaluator` para no implementar `RoutingEvaluator`: necesita `BoundExchange target`, que esa interfaz no modela. La lógica es más simple que la del puente porque no hay ningún patrón que evaluar para el reenvío:

- Si se publica directo en el alternativo, se comporta como un Fanout puro (todas sus colas matchean, las del principal no).
- Si se publica en el principal: match exacto por `bindingKey` en cada cola `PRIMARY` (igual que `DirectRoutingEvaluator`); la cola `SECONDARY` matchea **si y solo si ninguna cola `PRIMARY` matcheó** — ese `anyDirectMatch` es el corazón del concepto.

Verificado con los 4 casos de la demo:

| Se publica en | Routing key | Resultado real (verificado) |
|---|---|---|
| Principal | `urgente` | Matchea "Urgentes" directo; el alternativo nunca se activa |
| Principal | `normal` | Matchea "Normales" directo; el alternativo nunca se activa |
| Principal | `vip` | No matchea ni "Urgentes" ni "Normales" → RabbitMQ reenvía sola al alternativo → ACK real en "Huérfanos", **`unrouted: false`** a pesar de `mandatory=true` |
| Alternativo | (cualquiera) | Matchea "Huérfanos" directo (fanout), sin pasar por el principal |

El tercer caso es la lección central del módulo, y es lo opuesto exacto a la lección del puente: ahí "no matchear nada" significaba mensaje devuelto; acá, gracias al alternate exchange, "no matchear nada" significa que el mensaje de todos modos llega a algún lado.

### 12.5. Publicar a uno de dos exchanges — generalización en `MessagePublisherService`

En vez de agregar un segundo `if (scenario.getType() == ExchangeType.ALTERNATE_EXCHANGE)` al lado del que ya existía para `EXCHANGE_TO_EXCHANGE`, se generalizaron los dos chequeos de `resolveAmqpExchange()` y del cálculo de `enteredExchange` en `publish()` para que miren `scenario.getSecondaryExchangeName() != null` en vez del tipo puntual — ese campo ya es `null` salvo en los tipos que efectivamente tienen un segundo exchange, así que cualquier módulo futuro con la misma forma reusa la rama sin tocar código.

### 12.6. Frontend: mismo patrón de "diagrama y hook dedicados", con una generalización de CSS

Se reimplementó el mismo patrón que `ExchangeBridgeCanvas`/`useExchangeBridgeAnimation` (`AlternateExchangeCanvas`/`useAlternateExchangeAnimation`), con dos diferencias de fondo:

- **El disparador del "reenvío" es distinto**: en el puente, `ROUTING_EVALUATED` cruza si alguna decisión de la cola remota matcheó un patrón; acá, `useAlternateExchangeAnimation` dispara `rerouteTick` si la cola `SECONDARY` matcheó — que, por la lógica del evaluador, pasa exactamente cuando nada matcheó en el lado principal. Mismo delay (`REROUTE_DELAY_MS`, 750ms) antes de aplicar las decisiones del lado alternativo, para que la cola no "se entere" antes de que se vea viajar el paquete — la misma lección visual ya aprendida con el módulo anterior, esta vez incluida desde el primer commit (ahí se había olvidado inicialmente pasar `resetSignal`, rompiendo "Reiniciar"; acá se agregó de entrada).
- **Se generalizó el CSS del conector**: `.edge-bridge`/`.packet-bridge`/`.bridge-label` (hardcodeados a `var(--color-bridge)`, rosa) pasaron a llamarse `.edge-connector`/`.packet-connector`/`.connector-label`, usando `var(--accent, var(--color-primary))` — el mismo patrón que ya usaba `.node-exchange`. `ExchangeBridgeCanvas` sigue viéndose igual (fija `--accent: var(--color-bridge)` en su wrapper); `AlternateExchangeCanvas` fija `--accent: var(--module-alternate)` (índigo, token nuevo en `index.css` con su variante para tema oscuro) y reusa las mismas tres reglas sin duplicarlas.
- **`BindingEditor`** gana una quinta variante (`"alternate-exchange"`): una tabla editable tipo Direct solo para las colas del exchange principal, y una línea informativa (no editable) para la cola del alternativo — coherente con que el módulo Fanout standalone tampoco expone nada editable para sus colas.

---

## 13. El módulo "Dead Letter Exchange": reenvío automático de lo rechazado

Tercer patrón, y el que más contrasta con los dos anteriores. En "Exchange → Exchange" un binding reenvía lo que **matchea** un patrón; en "Alternate Exchange" el reenvío se dispara cuando **nada matchea**. Acá el disparador no tiene nada que ver con el routing: una cola puede declarar un dead letter exchange (`x-dead-letter-exchange`), y RabbitMQ reenvía ahí, automáticamente, todo mensaje que esa cola **rechace explícitamente** (`basic.nack`/`basic.reject` sin requeue) — o, en otros escenarios no cubiertos interactivamente por esta demo, cuyo TTL expire o que desborde un límite de tamaño (`x-max-length`). El punto pedagógico central: el **routing sí funcionó** — el mensaje llegó bien a la cola — y el reenvío ocurre *después*, como consecuencia de un evento de entrega a nivel de cola, no de una decisión del exchange.

Verificado contra un RabbitMQ real durante el desarrollo: la UI de management muestra el `arguments` de la cola principal con `"x-dead-letter-exchange": "<nombre del DLX>"`, y un mensaje rechazado a propósito reaparece con ACK real en la cola del DLX, con el `messageId` original preservado (RabbitMQ mantiene las propiedades del mensaje, incluido el `correlationId`, al dead-letterarlo) — lo que permite que el historial de mensajes correlacione ambas entregas como el mismo mensaje.

### 13.1. Por qué el disparador interactivo es el rechazo manual, no TTL

`DynamicConsumerManager` arranca un consumer activo por cola apenas se crea el escenario, y ese consumer confirma (o, ahora, rechaza) cada mensaje en 250-900ms. Con consumers siempre activos, un TTL de cola nunca llegaría a expirar en una demo en vivo — el mensaje se consume antes. Por eso el único disparador interactivo de este módulo es un checkbox en el composer ("Simular fallo de procesamiento") que agrega un header AMQP (`x-edu-simulate-reject`) al mensaje publicado; TTL y `x-max-length` se explican en prosa (`ExplanationPanel`) como los otros dos disparadores reales de RabbitMQ, sin demostrarlos interactivamente — mismo criterio de alcance que el resto de los módulos.

### 13.2. Modelo y nombres reales en RabbitMQ

- Reusa `secondaryExchangeName` (acá, el DLX) y el enum `BoundExchange` (`PRIMARY`/`SECONDARY`) tal cual, sin ningún campo nuevo en `Scenario` — mismo criterio que `ALTERNATE_EXCHANGE`: no hay ningún "binding key del puente" que editar, la relación es un argumento fijo de la cola principal.
- `PublishMessageRequest` gana `simulateFailure: boolean` (default `false`) — el único campo nuevo de todo el módulo del lado del request.
- Nombres reales: `ScenarioService.typeSlug()` mapea este tipo al slug corto `"dlx"`. Resultado: `edu.<sesión>.dlx.main` (principal, Direct), `edu.<sesión>.dlx.exchange2` (el DLX, Fanout), `edu.<sesión>.dlx.<slug-cola>` por cada cola.
- Escenario de demostración por defecto (`ScenarioDefaults`):

```
Exchange "Pagos" (Direct)
  └─ Cola "Procesar pago"   bindingKey = "pago.nuevo"
     con argumento x-dead-letter-exchange -> el Fanout de abajo

Exchange "Pagos.dlx" (Fanout, el DLX)
  └─ Cola "Pagos fallidos"  (dead letter queue, fanout, sin binding key)
```

### 13.3. Declarar el dead letter exchange de verdad (`TopologyManager`)

Igual que con `alternate-exchange`, Spring AMQP tiene soporte de primera clase: `QueueBuilder` expone un método dedicado `deadLetterExchange(String)` (confirmado con `javap` contra el jar real del proyecto), evitando declarar el argumento a mano con `withArgument("x-dead-letter-exchange", ...)`:

```java
Queue procesarPago = QueueBuilder.durable(scenario.getQueues().get(0).getName())
        .deadLetterExchange(scenario.getSecondaryExchangeName())
        .build();
```

`declareDeadLetterExchange` declara primero el Fanout (DLX) y después el Direct principal con sus colas — la cola `PRIMARY` se construye con este `QueueBuilder` especial, la cola `SECONDARY` (la dead letter queue) se declara como una cola común. `rebindDeadLetterExchange` es tan simple como el de `alternate-exchange`: no hay ningún argumento que reconfigurar, solo re-bindear colas si cambia la `bindingKey` de la cola principal.

### 13.4. Routing explicado (`DeadLetterRoutingEvaluator`)

El más simple de los tres evaluadores custom (mismo motivo que los otros dos para no implementar `RoutingEvaluator`: necesita `BoundExchange target`). A diferencia de `ExchangeToExchangeRoutingEvaluator` y `AlternateExchangeRoutingEvaluator`, acá **no hay ninguna lógica de "cruce" ligada a la routing key**: el dead lettering no es una decisión de routing en absoluto.

- Si se publica directo en el DLX, se comporta como un Fanout puro.
- Si se publica en el principal: match exacto por `bindingKey` para "Procesar pago" (igual que `DirectRoutingEvaluator`); la cola del DLX **nunca** matchea por routing directo — su `reason` aclara explícitamente que solo recibe un mensaje si la cola principal lo rechaza (evento aparte, evaluado en `DynamicConsumerManager`, no acá).

Verificado con los 3 casos de la demo:

| Se publica en | Routing key / flag | Resultado real (verificado) |
|---|---|---|
| Principal | `pago.nuevo`, sin el checkbox | Matchea "Procesar pago" → ACK real, nunca toca el DLX |
| Principal | `pago.nuevo`, con "simular fallo" tildado | Matchea "Procesar pago" (el routing funcionó) → el consumer la rechaza (`basicNack`, sin requeue) → RabbitMQ la reenvía sola al DLX → ACK real en "Pagos fallidos", con el mismo `messageId` correlacionado en el historial y el motivo (`rejected`) tomado del header `x-death` real |
| DLX (directo) | (cualquiera) | Matchea "Pagos fallidos" directo (fanout), sin pasar por "Procesar pago" |

### 13.5. Simular el rechazo y leerlo de vuelta (`MessagePublisherService`, `DynamicConsumerManager`)

`MessagePublisherService.doPublish()` agrega el header AMQP `x-edu-simulate-reject: true` cuando `request.isSimulateFailure()` — mismo mecanismo que ya usa `HEADER_SCENARIO_ID` para viajar metadata educativa fuera del payload.

`DynamicConsumerManager.handleDelivery()` es donde vive la lógica real:

- Lee el header `x-death` (una lista de mapas que RabbitMQ agrega automáticamente a un mensaje ya dead-letterado) para extraer un `deathReason` humano (`"rejected"`, `"expired"`, `"maxlen"`, según el motivo real). Ese `deathReason` viaja en el evento `MESSAGE_DELIVERED` de esa entrega — es lo que permite, por ejemplo, mostrar "rejected" como motivo real en la cola del DLX en vez de un texto genérico.
- Solo honra `x-edu-simulate-reject` **si `x-death` está ausente** — es decir, si esta es la primera entrega del mensaje, no una redelivery ya dead-letterada. Sin este chequeo, la propia cola del DLX volvería a rechazar el mismo mensaje reenviado (el header de simulación no se "hereda" ni se limpia solo).
- Si corresponde rechazar: tras el mismo delay ya existente según `AckMode`, `channel.basicNack(deliveryTag, false, false)` en vez de `basicAck`, `historyService.markRejected(...)` y `eventBroadcaster.broadcast(..., MessageEventDto.rejected(...))`. Esto termina de cablear `EventType.MESSAGE_REJECTED`, `MessageHistoryService.markRejected()` y `MessageRecord.DeliveryStatus.REJECTED` — que existían como scaffolding sin usar desde antes de este módulo (ver sección 10, que hasta esta versión documentaba esto como limitación conocida).

### 13.6. Frontend: el hook más simple de los tres módulos de "dos exchanges"

`useDeadLetterAnimation` reimplementa el mismo patrón que `useExchangeBridgeAnimation`/`useAlternateExchangeAnimation`, pero es el más simple: no necesita el truco de "separar decisiones locales de decisiones de fallback y aplicarlas con un delay artificial" que usan los otros dos, porque el cruce hacia la cola del DLX **no es una decisión de routing simulada** — es la secuencia real de eventos que ya emite el backend (`MESSAGE_REJECTED` en la cola principal, y más tarde un `MESSAGE_DELIVERED`/`MESSAGE_ACKED` real en la cola del DLX), manejada por la misma lógica genérica por-nombre-de-cola que el hook ya necesita para todo lo demás. `ROUTING_EVALUATED` se aplica directo, sin ninguna separación.

- **`DeadLetterCanvas`** reusa el mismo esqueleto de dos bandas que `AlternateExchangeCanvas` (`box()`/`curve()`/`verticalCurve()`, clases `.edge-connector`/`.packet-connector`/`.connector-label` ya generalizadas), con una diferencia de layout deliberada: el conector arranca en la **cola** "Procesar pago" (no en el exchange principal) y termina en el exchange del DLX — refuerza visualmente que el disparador es un evento de la cola, no del exchange. Usa `--module-dlx` (rosa/carmesí, distinto de `--color-danger` para no confundir "rechazado" semántico con el color del módulo) como `--accent`.
- Nuevo modificador CSS `.topology-node.node-consumer.node-rejected` (rojo, mismo criterio que `.node-acked` pero con `--color-danger`/`--color-danger-soft`) para el estado "Rechazado ✗" del consumer.
- **`BindingEditor`** gana una sexta variante (`"dead-letter"`): misma estructura que `"alternate-exchange"` (tabla editable para la cola principal, línea informativa no editable para la dead letter queue).
- **`MessageComposer`** gana `showSimulateFailure` (checkbox "Simular fallo de procesamiento (rechazar)"), incluido en `onSend(...)` como `simulateFailure`.

### 13.7. La home y el sidebar: separar "tipos de exchange" de "patrones y arquitecturas"

Con tres módulos de este segundo tipo, se volvía confuso mostrarlos en la misma grilla plana que los cinco tipos base — parecía un 6to/7mo/8vo tipo de exchange en vez de una combinación de los tipos base. `HomeScreen.tsx` y `Shell.tsx` agrupan ahora las secciones en dos bloques con título propio ("Tipos de Exchange" / "Patrones y arquitecturas"), sin ningún cambio de lógica de routing o de datos — es puramente una reorganización visual de arrays ya existentes.

---

## 14. Cómo correr todo

Ver `README.md` para el paso a paso completo. Como referencia rápida: RabbitMQ vía `docker compose up -d`, backend con `mvn spring-boot:run` (puerto 8080), frontend con `npm run dev` (puerto 5173). Hay un script `start.ps1` en la raíz del repo que automatiza las tres cosas en orden, esperando a que cada una esté lista antes de seguir con la siguiente (`./start.ps1` para levantar todo, `./start.ps1 -Stop` para bajarlo).
