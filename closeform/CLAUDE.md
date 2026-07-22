# CloseForm — Contexto del proyecto

> Léeme primero. Este archivo le da a Claude Code el contexto para trabajar en este repo
> sin re-explicar nada.

## Qué es

**CloseForm** es una **landing de alta conversión** basada en un **quiz guiado** (texto /
IA / audio) que califica y **cierra** al lead: al final captura sus datos y le entrega una
recomendación personalizada, con seguimiento por WhatsApp / push.

Producto independiente. Nació como *starter limpio* extraído del stack probado de otro
proyecto (Kross), pero **NO** contiene lógica de negocio heredada. Empieza de cero.

## Stack

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS 4. Deploy en **Vercel**
  (cada push a `main` redepliega).
- **Backend:** **Supabase** — Postgres + RLS, Edge Functions (Deno), Storage (bucket
  privado `call-recordings`).
- **Integraciones:** LiveKit (voz WebRTC + grabación por Egress), WhatsApp Cloud API
  (envío de plantillas / fallback), Web Push (VAPID + service worker), IA (Anthropic por
  defecto, provider-agnostic).

## Estructura

```
src/
  lib/quiz-config.ts     # el embudo (pasos del quiz) — data-driven, edita aquí
  lib/supabase.ts        # cliente + FUNCTIONS_BASE
  pages/QuizPage.tsx      # motor del quiz: choice / text / ai / lead
supabase/
  functions/
    ai-quiz/              # turno de IA → recomendación personalizada
    quiz-submit/          # cierra el quiz: guarda lead + fallback WhatsApp
    wa-send/              # envío de plantilla WhatsApp (fallback)
    livekit-token/        # token de sala WebRTC
    livekit-webhook/      # grabación (Egress) con control de costo · deploy --no-verify-jwt
    save-push-subscription/
    _shared/cors.ts
  setup.sql              # esquema: leads, push_subscriptions, call_recordings
public/sw.js             # service worker (push + PWA)
SETUP.md                 # guía de puesta en marcha desde cero
```

## Modelo de datos (Supabase)

- `leads` — lead capturado: `nombre`, `phone`, `answers` (jsonb), `ai_reply`.
- `push_subscriptions` — suscripciones Web Push.
- `call_recordings` — grabaciones de llamadas (LiveKit Egress).

Las tablas tienen **RLS activado** y el frontend NO las lee directo: las Edge Functions
usan el service role. El frontend solo invoca funciones vía `FUNCTIONS_BASE`.

## Secrets (Supabase → configurados por CLI, NO en el frontend)

`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_S3_BUCKET`,
`WHATSAPP_TOKEN`, `WA_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_LANG`, `AI_API_KEY`, `AI_MODEL`,
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `WA_WELCOME_TEMPLATE` (opcional).

El frontend solo usa: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`.

## Comandos

```
npm install
npm run dev
npm run build
supabase functions deploy <nombre> --project-ref <PROJECT_REF>
supabase functions deploy livekit-webhook --no-verify-jwt --project-ref <PROJECT_REF>
supabase secrets set NOMBRE=valor --project-ref <PROJECT_REF>
```

## Convenciones

- Nunca poner secrets/tokens en el código, commits ni en el chat.
- Nuevas Edge Functions: incluir CORS (usa `_shared/cors.ts`) y validar entradas.
- El quiz se cambia editando `src/lib/quiz-config.ts` (no la UI).
- Números de WhatsApp: normalizar a Perú (`51` + 9 dígitos) — ajustar si cambia el mercado.

## Estado / pendientes

- [ ] Personalizar `quiz-config.ts` al nicho real (oferta, objeciones).
- [ ] Ajustar el prompt de `ai-quiz` al producto.
- [ ] Generar claves VAPID y conectar el flujo de Web Push.
- [ ] Configurar el webhook de LiveKit en LiveKit Cloud (URL de `livekit-webhook`).
- [ ] Conectar el repo en Vercel + variables de entorno.
- [ ] (Opcional) Paso de audio: grabar respuesta → transcribir → IA.
