# Checklist de proyecto entregable

Rellenar en el proyecto generado, sin copiar datos privados de otras fuentes.

## Arranque fácil

- [ ] Docker y Compose son los únicos requisitos del host para el flujo estándar.
- [ ] Preparación inicial de `.env` documentada; no sobrescribe configuración existente.
- [ ] `docker compose up --build -d` construye y arranca frontend, API y DB.
- [ ] URL real, puertos y acceso inicial documentados.
- [ ] Proveedores opcionales no impiden el arranque ni simulan resultados sin indicarlo.

## Archivos completos

- [ ] Compose base local, override de desarrollo y Compose QA.
- [ ] Dockerfiles de web/API; contextos y `.dockerignore` correctos.
- [ ] Manifiestos, lockfiles y todos los scripts/paths referenciados existen.
- [ ] Migraciones/seed automáticos, idempotentes y registrados.
- [ ] Variables de build/runtime separadas; `.env.example` sin secretos reales.
- [ ] Persistencia de DB/uploads, permisos y recuperación definidos.
- [ ] README del proyecto con arranque, parada, logs, tests y diagnóstico.
- [ ] Configuración productiva completa si fue solicitada; sin depender de infraestructura privada.

## Gates

Registrar PASS, FAIL, BLOCKED, INCONCLUSIVE o N/A justificado, comando y evidencia para DC-01 a DC-09. No marcar casillas por existencia de archivos.

- [ ] Build y primer arranque desde limpio.
- [ ] Salud funcional, migraciones y flujo navegador–API–DB.
- [ ] Reinicio y recreación de DB/API preservan datos; seed no duplica.
- [ ] QA aislado, dos instancias no colisionan.
- [ ] Unitarias, módulo, integración y E2E ejecutadas desde contenedores.
- [ ] Recursos de QA y logs gestionados sin afectar otros proyectos.

## Estado de entrega

- Implementación:
- Verificación estática:
- Docker ejecutado:
- Tests ejecutados:
- Bloqueos y comandos pendientes:
- Comando final para levantar:
- URL:

No escribir “listo para usar” si el arranque no se ha ejecutado y verificado. Entregar archivos completos aun si la ejecución está bloqueada.
