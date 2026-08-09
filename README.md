# RabbitMQ Playground

Aplicación web educativa e interactiva para aprender RabbitMQ experimentando de verdad: cada pantalla declara un exchange, colas y bindings reales en un broker RabbitMQ, te deja publicar mensajes y ver en tiempo real cómo se enrutan, se entregan y se confirman.

Este proyecto es la implementación de la propuesta de arquitectura acordada previamente (ver el documento `PROPUESTA_ARQUITECTURA_RABBITMQ_PLAYGROUND.md` compartido en la conversación). Cubre las etapas 0 a 6 del plan: los cinco tipos de Exchange (Fanout, Direct, Topic, Headers, Default) con topología real, animación en tiempo real vía WebSocket, y ciclo de vida de escenarios (crear/reiniciar/limpiar).

## Stack

- **Backend**: Spring Boot 3.3 (Java 21), Spring AMQP, WebSocket/STOMP.
- **Frontend**: React 19 + TypeScript, Vite, React Router, `@stomp/stompjs`.
- **Mensajería**: RabbitMQ (con el plugin de management, opcional, para poder inspeccionar la topología manualmente si querés).

## Cómo correrlo

### Opción rápida: un solo script (Windows / PowerShell)

```powershell
.\start.ps1
```

Levanta todo en el orden correcto — RabbitMQ (Docker), backend y frontend — esperando a que cada pieza esté lista antes de seguir con la siguiente. Backend y frontend corren **ocultos en segundo plano** (no abre ventanas nuevas), con su salida redirigida a `logs/backend.log` y `logs/frontend.log`; para seguirlos en vivo:

```powershell
Get-Content logs\backend.log -Wait
Get-Content logs\frontend.log -Wait
```

Si algún puerto ya estaba en uso (por ejemplo porque dejaste el backend corriendo de una vez anterior), el script lo detecta y no lo vuelve a levantar. Al terminar abre `http://localhost:5173` automáticamente.

Para detener todo (contenedor de RabbitMQ + procesos de backend/frontend):

```powershell
.\start.ps1 -Stop
```

Si PowerShell bloquea el script por la policy de ejecución de tu máquina:

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Requiere Docker Desktop corriendo, Java 21 y Node 18+ instalados.

### Opción manual, paso a paso

Si preferís levantar cada pieza a mano (por ejemplo, para ver los logs de cada una en su propia consola):

#### 1. Levantar RabbitMQ

```bash
docker compose up -d
```

Esto expone RabbitMQ en `localhost:5672` (AMQP) y `localhost:15672` (UI de management, usuario `guest` / contraseña `guest`).

Si no tenés Docker a mano, cualquier RabbitMQ local con el usuario `guest`/`guest` en el puerto `5672` sirve — no hace falta crear nada manualmente, la app declara toda su propia infraestructura.

#### 2. Levantar el backend

```bash
cd backend
mvn spring-boot:run
```

Queda escuchando en `http://localhost:8080`. Variables de entorno opcionales (todas con default razonable): `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_USERNAME`, `RABBITMQ_PASSWORD`, `APP_CORS_ORIGIN`.

#### 3. Levantar el frontend

```bash
cd frontend
npm install
npm run dev
```

Abrí `http://localhost:5173`.

## Qué podés hacer

- Elegir una de las cinco secciones (Fanout, Direct, Topic, Headers, Default Exchange) desde el menú lateral.
- Al entrar, la app declara automáticamente el exchange y las colas de demostración en RabbitMQ (botón "Crear escenario" si querés recrearlo a mano).
- Editar los bindings (binding key, patrón con `*`/`#`, o cabeceras con `x-match`) y guardarlos: se reconfiguran los bindings reales en RabbitMQ al instante.
- Publicar un mensaje y ver, en el diagrama, cómo viaja del productor al exchange, qué colas coinciden (y por qué) y cómo cada consumidor lo confirma (ACK) en tiempo real.
- Revisar el historial de mensajes enviados, con el detalle completo de payload, routing key/headers y el resultado del enrutamiento.
- "Reiniciar" vacía las colas y el historial sin tocar la topología; "Limpiar" borra exchange, colas y bindings por completo.

## Estructura del proyecto

```text
backend/    Spring Boot: config, scenario, topology, routing, messaging, events, history, api
frontend/   React: components/ (compartidos), features/ (una pantalla por tipo de exchange), hooks/, lib/
docker-compose.yml   RabbitMQ para desarrollo local
```

## Qué queda para etapas futuras

Este proyecto prioriza tener el ciclo completo (productor → exchange → routing → cola → consumer → ACK) funcionando de punta a punta con los cinco tipos de exchange, con datos reales de RabbitMQ. Quedan pendientes, tal como se planteó en la propuesta original:

- **UI para ACK manual vs. automático por cola**: el backend ya soporta ambos modos (`AckMode` en `QueueConfig`, con distinta demora antes de confirmar) y por defecto usa automático; falta exponer el selector en el editor de bindings.
- **Laboratorio de confiabilidad avanzado**: TTL, Dead Letter Exchange, `prefetch` configurable y rechazo explícito de mensajes (hoy todo consumidor confirma exitosamente).
- **Persistencia del historial**: hoy vive en memoria del backend (se pierde si se reinicia el proceso); alcanza para el uso educativo pero no sobrevive un restart.

Lo que sí está resuelto de punta a punta y probado contra un RabbitMQ real: declaración/limpieza dinámica de topología con nombres aislados por sesión de navegador, publicación con `mandatory` y devolución de mensajes no enrutados, evaluación explicada del enrutamiento para los 5 tipos de exchange, entrega y ACK real vía consumidores dinámicos, y la animación en tiempo real completa por WebSocket.
