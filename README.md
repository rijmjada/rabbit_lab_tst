# RabbitMQ Playground

Aplicación web interactiva para aprender RabbitMQ de forma visual: simula exchanges, colas y bindings, y te deja publicar mensajes y ver en tiempo real cómo se enrutan, se entregan y se confirman (o rechazan). Cubre los 5 tipos base de exchange (Fanout, Direct, Topic, Headers, Default) más 3 patrones que los combinan (Exchange↔Exchange, Alternate Exchange, Dead Letter Exchange).

## Cómo correrlo

```bash
npm install
npm run dev
```

Abrí `http://localhost:5173`.

Para un build de producción (para desplegar como página estática en GitHub Pages, Netlify, Vercel, etc.):

```bash
npm run build
```

Genera `dist/`, listo para subir tal cual a cualquier hosting estático.
