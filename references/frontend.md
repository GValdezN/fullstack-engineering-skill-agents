# Interfaz conectada, persistencia y navegador

Leer al modificar UI web, caché, edición, navegación, idiomas, mapas o exportaciones. Mantener Next.js y el sistema de diseño existente; no trasladar marcas ni decisiones visuales de proyectos de referencia.

## Estado y carreras

Evitar que un GET antiguo sobrescriba una mutación confirmada o que un refetch borre un borrador local. Usar generación/versionado de peticiones, cancelación y reconciliación por identidad. Una mutación pendiente debe distinguirse de la versión persistida; en fallo conservar el borrador y ofrecer reintento explícito. Probar GET lento seguido de POST/PUT, cambio de ruta durante carga, dos pestañas y recarga tras guardar.

La fuente de verdad de datos compartidos debe ser la API/DB. No simular persistencia guardando solo en memoria/localStorage un dato que otros usuarios deberían ver. Probar visibilidad desde otra sesión/rol y conservación tras reinicio. Acotar caché por usuario, permisos, idioma y versión del recurso; invalidarla tras escritura, logout o cambio de contexto. No servir datos privados desde caché compartida.

## Next.js y navegación

Separar lógica SSR de APIs solo disponibles en navegador (`window`, storage, geolocalización). Comprobar hidratación, refresh profundo y navegación cliente; que una ruta funcione con recarga no demuestra que funcione tras navegación sin reload. Manejar dependencias browser-only y carga dinámica cuando corresponda, sin desactivar SSR de toda la app indiscriminadamente.

Probar URLs directas, query/fragmentos, atrás/adelante, rutas no existentes, links externos y redirects reales; un 200 vacío no valida una redirección. Estados de sesión se verifican también en backend. Cookies en localhost pueden compartirse entre puertos: aislar perfiles de QA.

## Contenido, idioma y accesibilidad

Reutilizar tokens y componentes, preservar identidad visual y contenido editado. Separar textos editoriales originales de traducciones/presentación para no sobrescribirlos al editar o sembrar. Definir fallback de idioma campo por campo, indicar traducción incompleta cuando corresponda y no inventar traducciones/contenido aprobado. Probar locale del navegador, selector, persistencia y cambios de idioma sin recarga.

Comprobar viewport estrecho y amplio, teclado/foco, contraste, lectores/labels, reduced motion y contenido largo. Si se usan PWA/cámara/GPS/orientación, distinguir contexto seguro, permiso negado, API ausente y fallo temporal; ofrecer alternativa útil y probar en dispositivo real cuando la aceptación dependa de él. Un simulador no acredita hardware.

## Importar y exportar

En importaciones, validar primero y ofrecer dry-run/resumen si hay cambios masivos. Vincular confirmación al hash/versión del archivo y plan; revalidar/replanificar bajo el control de concurrencia antes de aplicar. Proteger campos manuales, claves e IDs; no duplicar al repetir el mismo lote ni borrar con celdas vacías sin contrato explícito.

En descargas verificar bytes actuales, MIME, nombre, tamaño, contenido/URLs y renderización; elegir carpeta limpia o umbral temporal para no validar una copia vieja con sufijo del navegador. Usar un verificador independiente del generador cuando sea viable (por ejemplo decodificar lo generado en vez de comparar su propia función). Probar Unicode, nombres largos, archivos malformados y presencia de datos privados. Una vista previa no acredita el archivo descargado; un archivo de prueba local no es un artefacto aprobado para producción.

## Despliegue en Docker y Output Standalone

Para empaquetar Next.js dentro de imágenes Docker multi-etapa (como se especifica en [web.Dockerfile.template](../assets/web.Dockerfile.template)), es **obligatorio** habilitar el modo standalone en el archivo de configuración (`next.config.js`, `next.config.mjs` o `next.config.ts`):

```js
// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const apiInternal = process.env.API_INTERNAL_URL || 'http://api:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiInternal}/api/:path*`,
      },
    ];
  },
};
export default nextConfig;
```

El destino de estos rewrites se fija durante `next build`; suministrar `API_INTERNAL_URL` como build arg en producción y reconstruir si cambia. En desarrollo `next dev` lee esa variable del entorno del contenedor. Para configuración dinámica sin rebuild usar un proxy runtime probado.

Sin `output: 'standalone'`, el comando `npm run build` no generará la carpeta `.next/standalone` y la compilación Docker fallará con error `directory .next/standalone not found`. Usar [next.config.template.mjs](../assets/next.config.template.mjs). Además, este snippet implementa el patrón Same-Origin mediante `rewrites`, permitiendo que el navegador llame a `/api/...` sin lidiar con CORS complejas ni exponer el DNS interno de Docker.

## Rendimiento y artefactos de referencia

Para afirmar mejoras de rendimiento, medir antes/después sobre build productivo con condiciones comparables de dispositivo/red y varias corridas. Registrar métrica y mediana/dispersión; lazy loading o compresión sin medición no acredita mejora. Reservar dimensiones, evitar diferir contenido inicial relevante y verificar invalidación de imágenes mutables. La optimización no debe alterar calidad/contratos sin evidencia.
