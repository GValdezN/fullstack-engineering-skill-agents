# Integraciones externas y comunicación entre servicios

Leer al conectar con APIs de terceros, servicios internos, proveedores de identidad, correo, colas o cualquier sistema fuera del dominio de la aplicación. Complementa [resilience.md](resilience.md) con patrones de implementación concretos.

## Adaptadores y proveedores intercambiables

Aislar cada integración externa en un adaptador con interfaz definida. No esparcir llamadas HTTP, credenciales o lógica de retry por controllers o servicios de dominio.

### Patrón Strategy/Factory para proveedores

Definir una interfaz para el proveedor y una factory que seleccione la implementación según configuración:

```text
integrations/<sistema>/
  types.ts           — Contrato del proveedor (interfaz/tipo)
  http-client.ts     — Implementación real (HTTP, SDK)
  mock-client.ts     — Implementación para desarrollo/testing
  index.ts           — Factory que elige según config
  diagnostics.ts     — Verificación de conectividad (opcional)
```

```typescript
// index.ts — factory
let instance: Provider | null = null;
function provider(): Provider {
  if (!instance) {
    instance = config.PROVIDER_MODE === 'mock'
      ? new MockProvider()
      : new HttpProvider(config.PROVIDER_URL, config.PROVIDER_KEY);
  }
  return instance;
}
function resetProvider() { instance = null; } // para tests
```

- Modo mock ejecuta validación, transformación y trazabilidad completas; solo omite la llamada HTTP real.
- Validar en producción que no se estén usando simuladores: `assertSafeConfig()` debe rechazar mocks en APP_ENV=production.
- No mezclar lógica de mock con lógica real en el mismo archivo; la factory es el único punto de decisión.

## Normalización de errores de integraciones

Mapear errores del proveedor externo a categorías internas consistentes:

```javascript
function normalizeExternalError(error) {
  if (error.code === 'ECONNABORTED' || error.name === 'TimeoutError')
    return { code: 'PROVIDER_TIMEOUT', retryable: true };
  if (!error.response)
    return { code: 'PROVIDER_NETWORK_ERROR', retryable: true };
  if (error.response.status >= 500)
    return { code: 'PROVIDER_SERVER_ERROR', retryable: true };
  if (error.response.status === 409)
    return { code: 'PROVIDER_CONFLICT', retryable: false };
  return { code: 'PROVIDER_VALIDATION_ERROR', retryable: false, details: error.response.data };
}
```

Clasificar como retryable solo errores transitorios. No reintentar validaciones fallidas ni conflictos. Registrar request ID del proveedor cuando lo exponga.

## Autenticación entre servicios (HMAC)

Para comunicación machine-to-machine entre servicios propios sin compartir DB ni sesiones de usuario:

### Firma de peticiones

```text
Payload firmado: timestamp.nonce.METHOD.path.sha256(body)
Signature: HMAC-SHA256(payload, shared_secret)
Headers: X-Key-Id, X-Timestamp, X-Nonce, X-Signature
```

### Verificación

1. Validar que el timestamp esté dentro de la ventana permitida (±300s).
2. Verificar que el nonce no se haya usado antes (registro en DB con TTL o constraint único).
3. Reconstruir el payload y comparar firma con `timingSafeEqual`.
4. Verificar scopes/permisos del key ID.

### Consideraciones

- Usar `crypto.timingSafeEqual` para comparar firmas; nunca `===`.
- Registrar nonces con TTL y limpiarlos oportunistamente (probabilístico, por ejemplo 2% de requests).
- Rotar keys con periodo de overlap: aceptar la key anterior durante la ventana de migración.
- No reutilizar secrets de JWT u otros mecanismos como key HMAC.
- Documentar scopes por key (lectura, escritura, administración).

## SSO con OIDC (Microsoft Entra ID y similares)

Para integración con proveedores de identidad corporativos:

1. Implementar Authorization Code + PKCE; no usar Implicit Flow.
2. Separar vinculación de identidad SSO de la cuenta interna: no vincular automáticamente por coincidencia de email sin verificación.
3. Modelo de vinculación recomendado: el primer SSO genera una solicitud de vinculación → un administrador aprueba la asociación con la persona interna.
4. Almacenar tokens de acceso/refresh cifrados; no exponer claims del proveedor en el frontend.
5. Manejar expiración de tokens y refresh; degradar a login manual si el proveedor no responde.

## Correo (SMTP saliente, IMAP entrante)

### SMTP saliente

- Construir emails multipart: texto plano + HTML con la misma información.
- Imágenes embebidas como CID inline en vez de adjuntos separados cuando deban verse en el cuerpo.
- Rate limiting entre envíos para respetar límites del proveedor.
- Dry-run por defecto en scripts de envío masivo; flag explícito para confirmar envío real.
- Checkpoint/log por destinatario para reanudar tras fallos sin reenviar.
- Validar formato de email antes de intentar envío.
- Cerrar conexión SMTP en `finally`; usar `quit()` preferentemente, `close()` como fallback.

### IMAP entrante

- Polling periódico con intervalo configurable.
- Procesar mensajes por UID para idempotencia.
- Mover mensajes procesados a carpeta dedicada (no borrar).
- Manejar reconexión ante pérdida de conexión.

## Pipelines de documentos con trazabilidad

Para procesamiento de documentos o datos que pasan por múltiples etapas:

```text
RECIBIDO → VALIDADO → TRANSFORMADO → PROCESADO
                ↓            ↓            ↓
         ERROR_VALIDACION  ERROR_TRANSFORMACION  ERROR_ENVIO
```

- Registrar cada transición de estado con timestamp en DB.
- Mantener tabla de intentos de envío con request/response, status y duración.
- Soportar reprocesamiento selectivo por estado y rango de fecha.
- Mappers separados para transformación entre formatos (interno ↔ externo).

### Data mappers

Separar la transformación de datos en módulos dedicados:

```text
modules/<dominio>/
  <dominio>.mapper.js   — Transformación entre formatos
```

Funciones utilitarias reutilizables: `getField(obj, [aliases])` para campos con múltiples nombres entre sistemas, `toNumber()`, `roundMoney()`, `toIsoDateTime()`.

## Validación flexible para múltiples orígenes

Cuando los datos llegan de diferentes sistemas con convenciones de nombres distintas:

```javascript
function requireAny(obj, keys, errors, field, message) {
  const value = keys.map(k => obj[k]).find(v => v != null && v !== '');
  if (!value) errors.push({ field, message });
  return value;
}
```

No asumir que todos los sistemas usan los mismos nombres de campo. Documentar los alias aceptados por campo.

## Servicios auxiliares en Docker Compose

Para herramientas complementarias (corrector ortográfico, captura de correo en dev, procesador de documentos):

- Definir como servicio adicional en Compose con healthcheck propio.
- Comunicación vía HTTP interno entre contenedores (DNS de servicio).
- Hacerlos opcionales cuando sea posible: la app principal degrada funcionalidad si el servicio auxiliar no está disponible.
- Para servicios de terceros (imágenes Docker publicadas), fijar versión y documentar requisitos de recursos (memoria, disco).
- Para dev, usar herramientas de captura (Mailpit para correo, mocks para APIs externas) en vez de servicios reales.

## Polyglot: servicios auxiliares en otro lenguaje

Cuando un servicio complementario se beneficia de otro runtime (Python para ML/Excel, etc.):

- Encapsular como microservicio con API HTTP o CLI.
- Definir contrato explícito de entrada/salida.
- Healthcheck independiente.
- Si es CLI invocado por `child_process`, capturar stdout/stderr, manejar timeout y códigos de salida.
- Mantener el servicio principal en Node.js; el servicio auxiliar no reemplaza la API principal.

## Pruebas de integraciones

- Probar con mock y documentar qué queda pendiente de verificar con el proveedor real.
- Probar timeout, error de red, respuesta malformada, error de autenticación y rate limiting del proveedor.
- Para HMAC, probar firma válida, inválida, nonce repetido, timestamp expirado y scope insuficiente.
- Para pipelines, probar cada transición de estado y la reanudación desde cada estado de error.
- Para mappers, probar con fixtures de datos reales anonimizados; cubrir campos faltantes, tipos inesperados y alias.
- Para correo, usar Mailpit u otra herramienta de captura en el entorno de testing; nunca enviar a destinatarios reales.
