# Git Flow & Nomenclaturas — Guía de Kross

> Convenciones oficiales para el desarrollo de Kross.
>
> **Stack:** Claude Code + VS Code + Git + GitHub + Vercel + Supabase

---

## 🚀 Resumen Rápido

| Prefijo | Significado | Cuándo usarlo | Ejemplo |
|----------|-------------|---------------|----------|
| ⭐ **feat/** | Nueva funcionalidad | Agregar algo nuevo | `feat/chatbot` |
| ⭐ **fix/** | Corrección de bug | Arreglar un error | `fix/login` |
| ⭐ **hotfix/** | Bug crítico en Producción | Solución urgente | `hotfix/payment-crash` |
| ⭐ **refactor/** | Mejorar código sin cambiar funcionalidades | Limpiar arquitectura | `refactor/auth-service` |
| ⭐ **chore/** | Mantenimiento del proyecto | Dependencias, configuración | `chore/update-eslint` |
| **docs/** | Documentación | README, guías | `docs/api` |
| **test/** | Pruebas | Unit, integration, e2e | `test/auth` |
| **style/** | Estilos o formato | CSS, prettier, espaciado | `style/buttons` |
| **perf/** | Rendimiento | Optimizaciones | `perf/cache` |
| **build/** | Compilación | Docker, Vite, Webpack | `build/vite` |
| **ci/** | Integración continua | GitHub Actions, Vercel | `ci/deploy` |
| **release/** | Nueva versión | Publicación de versión | `release/v1.2.0` |

> El mismo prefijo aplica a la **rama** (`feat/chatbot`) y al **commit**
> (`feat: agrega chatbot de soporte`).

---

## 🌳 Ramas base

| Rama | Rol | Regla |
|---|---|---|
| **`main`** | 🟢 Producción / estable. Vercel despliega desde aquí. | **NUNCA** commit/push directo. Solo se actualiza vía Pull Request. |
| **`feat/*` · `fix/*` · etc.** | 🔧 Trabajo diario | Toda funcionalidad, fix o refactor vive en su rama, basada en `main`. |

---

## 🔁 Flujo de trabajo (equipo de devs)

1. **Partir de `main` actualizado:**
   ```
   git checkout main
   git pull origin main
   git checkout -b feat/mi-tarea
   ```
2. **Commits pequeños** bajo **Conventional Commits** (`feat:`, `fix:`, `refactor:`…).
3. **Push a la rama de trabajo** (nunca a `main`):
   ```
   git push -u origin feat/mi-tarea
   ```
4. **Pull Request** `feat/*` → `main` en GitHub. Lo revisa el dueño del repo / equipo.
5. Al **mergear el PR**, Vercel despliega a producción automáticamente.
6. Borrar la rama ya mergeada para mantener limpio el repo.

### Mantenerse al día si otro dev mergea a `main`
```
git fetch origin
git rebase origin/main        # sobre tu rama feat/*, deja el PR limpio
```

---

## 📝 Conventional Commits — formato

```
<tipo>: <descripción en imperativo, minúscula>

[cuerpo opcional]
```

Ejemplos:
- `feat: implementa mapa interactivo con pin arrastrable`
- `fix: corrige autocompletado de DNI`
- `refactor: extrae la máquina de estados del checkout`
- `docs: agrega guía de git flow`

---

## 🛡️ Guardarraíles intransigibles

1. **NUNCA** commit/push directo a `main`.
2. Antes de cada commit, `git status` para confirmar que estás en una rama `feat/*`/`fix/*`.
3. Una **rama = una tarea = un tema** (no mezclar features en la misma rama).
4. El autor de la rama **no** aprueba su propio PR sin revisión (equipo de 3 devs).
5. **El merge a `main` lo hace Uxbriel.** Cualquiera del equipo abre PR y revisa; el
   botón de mergear es de una sola persona.

   No es jerarquía por gusto: mergear a `main` **despliega a producción** (Vercel lo
   hace solo, paso 5 de arriba) y varios cambios de este repo además necesitan que
   alguien corra un SQL o despliegue una Edge Function *antes* de que el código llegue
   —la lista viva está en [`ESTADO-OPERATIVO.md`](./ESTADO-OPERATIVO.md#lo-que-falta-desplegar-al-28-ago-2026)—.
   Un merge sin ese paso deja producción con el frontend nuevo pidiéndole a un backend
   viejo cosas que no sabe dar. Quien mergea es quien sabe si el backend ya está listo.

   El mismo reparto que en el panel: el **operador** hace todo el trabajo diario; lo
   que no se puede deshacer lo hace el administrador. Un deploy a producción es
   exactamente eso.

> **Esto es GitHub, no el panel.** El rol *Operador* del panel (ver
> [`00-CORE-ARCHITECTURE.md`](./00-CORE-ARCHITECTURE.md)) no da ni quita permisos en
> este repo: para que el reparto se cumpla de verdad hay que dejarlo escrito en
> **Settings → Branches → branch protection rule** de `main` (requerir PR, y restringir
> quién puede mergear). Mientras eso no esté puesto, esta regla es un acuerdo, no un
> candado.

---

## 🤖 Nota sobre Claude Code

Cada sesión de Claude Code en la web crea su propia rama de trabajo y hace PR a `main`.
Cuando se trabaje una tarea específica, la rama debe seguir esta nomenclatura
(`feat/*`, `fix/*`, …) y **el Pull Request lo revisa/abre el equipo**, no la sesión.
