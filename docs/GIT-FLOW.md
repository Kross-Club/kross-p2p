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

---

## 🤖 Nota sobre Claude Code

Cada sesión de Claude Code en la web crea su propia rama de trabajo y hace PR a `main`.
Cuando se trabaje una tarea específica, la rama debe seguir esta nomenclatura
(`feat/*`, `fix/*`, …) y **el Pull Request lo revisa/abre el equipo**, no la sesión.
