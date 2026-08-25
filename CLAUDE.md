# CLAUDE.md — Kross

> Léeme primero. Contexto para trabajar en este repo sin re-explicar nada.
> Al iniciar una sesión: lee este archivo, `docs/ESTADO-OPERATIVO.md` (qué está vivo y qué
> está bloqueado hoy) y el `.md` del módulo que vayas a tocar en `/docs`.

## Qué es Kross

**Sistema Operativo de E-commerce contraentrega (COD) para Perú.** PWA white-label
multi-tenant: cada marca tiene su app instalable en `marca.krossclub.app`. Resuelve 3 fases:
**vender** (Sales) → **entregar** (Logistics) → **retener** (Loyalty).

## Stack

React 19 + Vite + TypeScript + Tailwind 4 · Supabase (Postgres/RLS, Edge Functions Deno,
Storage, Realtime) · Vercel (deploy desde `main`) · LiveKit (voz+grabación) · WhatsApp
Cloud API · Web Push (VAPID) · IA (Decolecta DNI, ElevenLabs closer 🔮).

### Supabase — organización `Kross Club` (plan Pro)

Dos proyectos bajo la misma org. **Este repo es `PWA`** — verifica el ref antes de cualquier
comando, comparten organización pero **no** comparten esquema ni convenciones.

| Proyecto | Ref | Región | Qué vive ahí |
|---|---|---|---|
| **PWA** | `ofdjghntvmrdfjhazfvz` | `sa-east-1` | **Este repo.** La PWA COD white-label: Sales → Logistics → Loyalty. |
| **Neural** | `nqibrziksedspoctjhmc` | `us-west-2` | Backoffice SaaS multi-tenant de operaciones COD: integraciones GoHighLevel / Shopify / Shalom / Aliclik, cobertura COD, tracking de envíos. Sistema aparte, no vive en este repo. |

- Deploy función: `supabase functions deploy <n> --project-ref ofdjghntvmrdfjhazfvz`
  (`livekit-webhook` y `shalom-webhook` van con `--no-verify-jwt`).
- Esquema idempotente: `supabase/setup-kross.sql` (correr en SQL Editor).

## Mapa de documentación (`/docs`)

**Léelos antes de tocar el área correspondiente.**

| Doc | Cubre |
|---|---|
| `docs/00-CORE-ARCHITECTURE.md` | BD, auth, panel admin, estado central `MerchantCustomerSession` |
| `docs/01-SALES-ENGINE.md` | IA Closer, DNI, checkout guiado (state machine), adelanto Yape verificado solo |
| `docs/02-SMART-LOGISTICS.md` | Geolocalización, motorizados, envíos a provincia |
| `docs/03-LOYALTY-ENGINE.md` | Recompra, puntos, campañas WhatsApp, LTV |
| `docs/04-CUMPLIMIENTO-WEB.md` | Web pública, páginas legales, Libro de Reclamaciones, requisitos de pasarela |
| `docs/06-360PAY.md` | 360pay como pasarela por defecto: cupón, deeplink de Yape, webhook. **Primer pago real cobrado** |
| `docs/07-CONTRATO-360PAY.md` | Contrato de recaudación: quién es quién, flujo del dinero, tarifario, plazos y qué nos obliga en el código |
| `docs/08-RECORDATORIOS-RECOJO.md` | 🔮 Cascada automática push+WA para recojo en agencia (diseño; por qué no robocall) |
| `docs/09-PIXELS-CAPI.md` | Pixel de Meta/TikTok + CAPI por marca: embudo en el Events Manager del cliente y Purchase server-side de los que adelantaron |
| `docs/10-MANUAL-DE-MARCA.md` | **Manual de marca v2.0** (ago-2026): símbolo modular, paleta ink/lima, tipografía, sistema de interfaz y voz. Reemplaza al manual de la etapa agencia |
| `docs/ESTADO-OPERATIVO.md` | **Qué marca está viva, qué la bloquea y qué deuda hay abierta.** Léelo al empezar sesión |
| `docs/GIT-FLOW.md` | Nomenclatura de ramas/commits y flujo de PR |
| `docs/ICP Sales/` · `docs/ICP LTV/` | Capa estratégica (por qué / para quién) |

Estado marcado con ✅ construido · 🟡 parcial · 🔮 planeado.

## Regla de ejecución

Al trabajar una funcionalidad, **consulta primero el `.md` del módulo** para respetar sus
estándares sin romper los demás. Todo cambio de datos que cruce módulos se refleja primero
en el contrato `MerchantCustomerSession` de `docs/00-CORE-ARCHITECTURE.md`. Los 3 módulos
comparten el mismo estado del cliente (Sales lo cierra, Logistics lo entrega, Loyalty lo retiene).

## Git Flow (resumen — detalle en `docs/GIT-FLOW.md`)

- **`main`** = producción. **NUNCA** commit/push directo; solo vía Pull Request.
- Trabajo en ramas `feat/*`, `fix/*`, `refactor/*`, `docs/*`, `chore/*` (Conventional Commits).
- Una rama = una tarea. El **PR lo abre/revisa el equipo** (3 devs), no la sesión de Claude.
- Antes de cada commit: `git status` para confirmar que NO estás en `main`.

## Convenciones de código

- Edge Functions: CORS + validación de entrada + service role para escribir.
- RLS activo; el frontend no lee tablas sensibles directo, invoca funciones.
- Nunca secrets/tokens en código, commits ni en el chat.
- Comprador identificado por DNI/teléfono; multi-tenant por subdominio (`src/lib/store-context.tsx`).
- El tipo real de sesión vive en `src/lib/session.ts` (no en el viejo `src/types/index.ts`, que es mock).
