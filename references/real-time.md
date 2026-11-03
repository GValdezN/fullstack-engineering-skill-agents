# Comunicación en tiempo real

Leer al implementar actualizaciones en vivo, colaboración, notificaciones push o streaming de datos entre servidor y cliente. Elegir el mecanismo según la dirección del flujo y los requisitos de la aplicación.

## Elegir mecanismo

| Mecanismo | Dirección | Cuándo preferir | Verificar |
|---|---|---|---|
| Server-Sent Events (SSE) | Servidor → cliente | Logs en vivo, progreso, estado de sistema, dashboards de monitoreo | Reconexión automática, `Last-Event-ID`, buffering de proxy |
| Socket.IO / WebSocket | Bidireccional | Colaboración, presencia, edición concurrente, chat, acciones entre usuarios | Autenticación en handshake, reconexión, rooms, orden de mensajes |
| Polling largo | Cliente → servidor | Fallback cuando SSE/WS no están disponibles o el dato cambia con poca frecuencia | Intervalo adaptativo, deduplicación, timeout |

No usar WebSocket cuando SSE basta; no usar polling cuando hay soporte para conexiones persistentes. Un endpoint REST con refresh manual no es tiempo real.

## Server-Sent Events

Implementar un helper reutilizable que encapsule la configuración de headers, keepalive y cierre limpio:

```javascript
function openSseStream(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const ping = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, 15_000);
  return {
    writeEvent(event, data) {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    writeComment(text) { if (!res.writableEnded) res.write(`: ${text}\n\n`); },
    close() { clearInterval(ping); if (!res.writableEnded) res.end(); },
  };
}
```

- `X-Accel-Buffering: no` evita que Nginx almacene la respuesta en buffer.
- El ping periódico mantiene la conexión viva a través de proxies y balanceadores.
- Verificar `res.writableEnded` antes de cada escritura; el cliente puede desconectarse en cualquier momento.
- En Nginx, configurar `proxy_buffering off` o confiar en el header; verificar que el timeout del proxy sea mayor que el intervalo de ping.
- Limpiar recursos (timers, listeners) cuando el cliente cierra la conexión (`res.on('close', ...)`).

### Reconexión y consistencia

El navegador reconecta SSE automáticamente. Para no perder eventos, enviar un `id:` con cada evento y manejar `Last-Event-ID` en el servidor para reenviar desde el punto de interrupción. Si no se puede garantizar replay, documentar la ventana de pérdida y usar refresh explícito como respaldo.

## Socket.IO / WebSocket

### Autenticación en el handshake

Usar el mismo mecanismo de sesión que HTTP (JWT o cookie). Verificar el token en el middleware de conexión, no después:

```javascript
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token
    || parseCookie(socket.handshake.headers.cookie)?.session;
  if (!token) return next(new Error('AUTH_REQUIRED'));
  try {
    const user = await verifyAndLoadUser(token);
    socket.data.user = user;
    next();
  } catch { next(new Error('AUTH_INVALID')); }
});
```

No confiar en el token inicial indefinidamente: revalidar periódicamente o al cambiar permisos. Si el usuario se desactiva o su rol cambia, desconectar la sesión WebSocket activa.

### Rooms y presencia

Usar rooms para agrupar conexiones por entidad (documento, sala, recurso). Verificar autorización antes de unir a una room:

```javascript
socket.on('join', async ({ entityId }) => {
  const allowed = await checkAccess(socket.data.user, entityId);
  if (!allowed) return socket.emit('error', { code: 'FORBIDDEN' });
  socket.join(`entity:${entityId}`);
  io.to(`entity:${entityId}`).emit('presence', { user: socket.data.user.id, action: 'joined' });
});
```

- Mantener un mapa de presencia en memoria si se necesita mostrar quién está conectado; limpiarlo en `disconnect`.
- No persistir presencia en DB salvo que se requiera entre reinicios del servidor.
- Usar `socket.data` para datos de sesión por conexión, no variables globales.

### Filtrado de cambios por rol

Si diferentes roles ven diferentes campos, filtrar los eventos antes de emitir:

```javascript
function broadcastChange(roomId, change, io) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return;
  for (const sid of room) {
    const s = io.sockets.sockets.get(sid);
    const filtered = filterFieldsForRole(change, s.data.user.role);
    s.emit('update', filtered);
  }
}
```

No emitir datos sensibles confiando en que el frontend los oculta.

### Escalabilidad

Socket.IO en un solo proceso mantiene estado en memoria. Para múltiples instancias, usar un adaptador (Redis, etc.) para sincronizar rooms y eventos. No asumir que `io.to()` alcanza conexiones en otros procesos sin adaptador. Verificar reconexión del cliente cuando el servidor se reinicia.

## Apagado ordenado con conexiones persistentes

Al recibir SIGTERM, cerrar conexiones SSE y WebSocket antes de cerrar el servidor HTTP. Para SSE, invocar `close()` en cada stream activo. Para Socket.IO, emitir un evento de cierre y desconectar:

```javascript
function gracefulShutdown(server, io) {
  io.emit('server:shutdown');
  io.disconnectSockets(true);
  server.close(() => { /* cerrar pool, etc. */ });
}
```

El `stop_grace_period` de Docker debe ser mayor que el tiempo de drenado esperado. Probar que los clientes reconectan correctamente cuando el servidor vuelve.

## Proxy y Docker

- En Nginx, habilitar upgrade de WebSocket:
  ```nginx
  location /socket.io/ {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
  ```
- En Docker Compose, si el frontend usa Same-Origin (Next.js rewrites), Socket.IO puede compartir el mismo origen. Si el backend está separado, configurar CORS de Socket.IO explícitamente.
- Verificar que el transporte WebSocket funciona; Socket.IO cae a long-polling si falla el upgrade, lo cual puede enmascarar un problema de proxy.

## Pruebas

- Probar conexión, autenticación válida e inválida, unión a room, emisión y recepción de eventos, desconexión y reconexión.
- Probar que un usuario desautorizado no recibe eventos de una room a la que no pertenece.
- Probar comportamiento bajo desconexión del servidor: el cliente debe reconectar y restaurar estado sin duplicar suscripciones.
- Para SSE, probar reconexión con `Last-Event-ID` y pérdida de eventos durante la desconexión.
- En E2E, usar clientes programáticos (socket.io-client, EventSource) en los tests; no depender solo de la UI para verificar tiempo real.
