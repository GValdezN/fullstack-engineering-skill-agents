# Fullstack Engineering Skill

**De un requerimiento a software ejecutable, probado y entregable.**

Una [Agent Skill](https://agentskills.io/) para trabajar en proyectos fullstack con criterio de ingeniería: entender el repositorio, definir el alcance, implementar el flujo completo, probarlo y entregar evidencia de lo que realmente funciona.

Creada por **[Gabriel Valdez](https://gvaldezn.cl/)** · Arquitectura, automatización y software.

## Qué hace

- Implementa aplicaciones nuevas y cambios acotados: funciones, módulos, integraciones, bugs, refactors y migraciones.
- Respeta el stack, los contratos y las convenciones de los proyectos existentes.
- Para aplicaciones nuevas, guía una entrega con **Next.js + API Node.js + PostgreSQL, MySQL o MongoDB**, según el dominio.
- Incluye **Docker Compose**, migraciones, configuración de ejemplo y arranque reproducible.
- Ajusta las pruebas al cambio: unitarias, de módulo, integración y E2E cuando corresponda.
- Distingue lo implementado de lo verificado y deja claros los bloqueos o riesgos pendientes.

La skill orienta al agente; no instala por sí sola Node.js, Docker, navegadores ni credenciales.

## Cuándo usarla

Úsala cuando quieras **código funcionando**, por ejemplo:

> `/fullstack-engineering Implementa un módulo de reservas con API, persistencia y pruebas de los flujos críticos.`

> `/fullstack-engineering Corrige el error de duplicación de pedidos, agrega una prueba de regresión y verifica la integración.`

No está pensada para preguntas conceptuales sin cambios de código.

## Instalación

Clona o descarga este repositorio. Desde su raíz, copia **`SKILL.md`, `references/`, `assets/` y `scripts/`** a una carpeta llamada `fullstack-engineering` en la ubicación de tu agente. Mantén esas cuatro piezas juntas: la skill enlaza guías, plantillas y verificadores mediante rutas relativas.

| Agente | En un proyecto | Para tu usuario |
| --- | --- | --- |
| [Claude Code](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) | `.claude/skills/fullstack-engineering/` | `~/.claude/skills/fullstack-engineering/` |
| [Antigravity App e IDE](https://antigravity.google/docs/skills?app=antigravity-ide) | `.agents/skills/fullstack-engineering/` | `~/.gemini/config/skills/fullstack-engineering/` |
| [Antigravity CLI](https://antigravity.google/docs/skills?app=antigravity-cli) | `.agents/skills/fullstack-engineering/` | `~/.gemini/antigravity-cli/skills/fullstack-engineering/` |
| [Codex](https://learn.chatgpt.com/docs/build-skills) | `.agents/skills/fullstack-engineering/` | `~/.agents/skills/fullstack-engineering/` |
| [GitHub Copilot CLI](https://docs.github.com/en/copilot/concepts/customizations/agent-skills) | `.github/skills/fullstack-engineering/` | `~/.copilot/skills/fullstack-engineering/` |

Por ejemplo, si ya estás en la raíz de este repositorio y quieres instalarla en un proyecto para **Claude Code**:

```bash
DESTINO=/ruta/a/tu-proyecto/.claude/skills/fullstack-engineering
mkdir -p "$DESTINO"
cp SKILL.md "$DESTINO/"
cp -R references assets scripts "$DESTINO/"
```

Para otro agente, cambia `DESTINO` por la ruta de la tabla. Para una instalación global, usa la ruta de tu usuario. En Copilot también puedes usar `.agents/skills/` o `.claude/skills/` dentro del proyecto.

Luego, invócala con una tarea concreta. En Claude Code, Antigravity y Copilot CLI puedes escribir `/fullstack-engineering`; en Codex, `$fullstack-engineering`:

```text
/fullstack-engineering Implementa [requerimiento] y verifica los flujos críticos hasta integración y E2E.
```

## Cómo trabaja

```text
Inspeccionar el proyecto → fijar criterios → implementar → probar → revisar → entregar evidencia
```

Para cambios en un proyecto existente, sigue sus convenciones y prueba los límites afectados. Para una app nueva, prepara una pila levantable con Docker Compose y verifica el flujo desde la interfaz hasta la base de datos. Un build exitoso o un contenedor `healthy` no sustituyen una prueba funcional.

## Qué hay en este repositorio

| Ruta | Contenido |
| --- | --- |
| [`SKILL.md`](SKILL.md) | Instrucciones principales de la skill. |
| [`references/`](references/) | Guías de arquitectura, frontend, bases de datos, Docker, operaciones y pruebas. |
| [`assets/`](assets/) | Plantillas y fichas de entrega y verificación. |
| [`scripts/`](scripts/) | Verificadores y preparación de evaluaciones. |
| [`tests/`](tests/) | Pruebas de plantillas y una app sintética para smoke tests. |

Si modificas la skill, puedes ejecutar sus pruebas locales con Node.js:

```bash
node --test tests/templates.test.mjs tests/smoke-preparation.test.mjs
```

Las comprobaciones de Docker requieren Docker y Compose disponibles en el entorno.

## Autor

**Gabriel Valdez** — desarrollo fullstack, arquitectura y automatización.

Conoce mi trabajo y proyectos en **[gvaldezn.cl](https://gvaldezn.cl/)**.
