# Quiz Funnel — Puesta en marcha desde cero

Este es un **starter limpio** (sin código de Kross) con el mismo stack e integraciones
que ya usas: **Supabase Edge Functions + LiveKit + WhatsApp (WABA) + Web Push + IA**.
Sigue estos pasos para tener tu proyecto nuevo corriendo.

> Reutilizas las MISMAS cuentas de LiveKit y WhatsApp — solo registras sus credenciales
> como *secrets* en el Supabase nuevo. No necesitas cuentas nuevas de esos servicios.

---

## 1. Crear el repo en GitHub

Este starter vive dentro de una carpeta. Para convertirlo en tu repo nuevo:

Crea el repo vacío en GitHub (UI): **New repository → nombre `quiz-funnel` → sin README**.

Luego, desde la carpeta `quiz-funnel/`:

```
git init
```
```
git add -A
```
```
git commit -m "init quiz funnel starter"
```
```
git branch -M main
```
```
git remote add origin https://github.com/uxbriel/quiz-funnel.git
```
```
git push -u origin main
```

---

## 2. Crear el proyecto Supabase nuevo

1. En https://supabase.com → **New project**. Copia la **URL** y la **anon key**
   (Settings → API).
2. Instala/loguea el CLI y enlaza el proyecto:

```
supabase login
```
```
supabase link --project-ref TU_PROJECT_REF
```

3. Corre el esquema: abre `supabase/setup.sql` en el **SQL Editor** y ejecútalo.

---

## 3. Registrar los secrets (credenciales reutilizadas)

Uno por línea:

```
supabase secrets set LIVEKIT_URL=wss://TU.livekit.cloud --project-ref TU_PROJECT_REF
```
```
supabase secrets set LIVEKIT_API_KEY=API... --project-ref TU_PROJECT_REF
```
```
supabase secrets set LIVEKIT_API_SECRET=... --project-ref TU_PROJECT_REF
```
```
supabase secrets set LIVEKIT_S3_BUCKET=call-recordings --project-ref TU_PROJECT_REF
```
```
supabase secrets set WHATSAPP_TOKEN=EAAG... --project-ref TU_PROJECT_REF
```
```
supabase secrets set WA_PHONE_NUMBER_ID=... --project-ref TU_PROJECT_REF
```
```
supabase secrets set WHATSAPP_TEMPLATE_LANG=es --project-ref TU_PROJECT_REF
```
```
supabase secrets set AI_API_KEY=... --project-ref TU_PROJECT_REF
```
```
supabase secrets set AI_MODEL=claude-sonnet-5 --project-ref TU_PROJECT_REF
```

> Opcional: `WA_WELCOME_TEMPLATE=nombre_plantilla` para que `quiz-submit` mande el plan
> por WhatsApp al cerrar el quiz.
>
> ⚠️ El token de WhatsApp que compartiste antes en chat debe considerarse **comprometido**:
> rótalo en Meta y usa el nuevo aquí. Nunca lo pegues en chat ni en el código.

---

## 4. Desplegar las Edge Functions

Uno por línea:

```
supabase functions deploy ai-quiz --project-ref TU_PROJECT_REF
```
```
supabase functions deploy quiz-submit --project-ref TU_PROJECT_REF
```
```
supabase functions deploy wa-send --project-ref TU_PROJECT_REF
```
```
supabase functions deploy save-push-subscription --project-ref TU_PROJECT_REF
```
```
supabase functions deploy livekit-token --project-ref TU_PROJECT_REF
```
```
supabase functions deploy livekit-webhook --no-verify-jwt --project-ref TU_PROJECT_REF
```

> `livekit-webhook` **debe** ir con `--no-verify-jwt` (si no, el gateway de Supabase
> rechaza el JWT que firma LiveKit con 401).

En **LiveKit Cloud → Settings → Webhooks** apunta la URL:
`https://TU_PROYECTO.supabase.co/functions/v1/livekit-webhook`

---

## 5. Frontend en Vercel

1. Importa el repo `quiz-funnel` en Vercel.
2. Variables de entorno (Settings → Environment Variables):

```
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
```
```
VITE_SUPABASE_ANON_KEY=ey...
```
```
VITE_VAPID_PUBLIC_KEY=...
```

3. Deploy. Cada push a `main` redepliega solo.

---

## 6. Correr en local

```
npm install
```
```
cp .env.example .env
```
(edita `.env` con tu URL y anon key)
```
npm run dev
```

---

## Qué trae el starter

| Pieza | Archivo | Para qué |
|---|---|---|
| Quiz data-driven | `src/lib/quiz-config.ts` | Edita pasos sin tocar UI |
| Motor del quiz | `src/pages/QuizPage.tsx` | Choice / texto / IA / captura de lead |
| IA del quiz | `supabase/functions/ai-quiz` | Recomendación personalizada |
| Cierre + lead | `supabase/functions/quiz-submit` | Guarda lead + fallback WhatsApp |
| WhatsApp | `supabase/functions/wa-send` | Envío de plantilla (fallback) |
| LiveKit voz | `supabase/functions/livekit-token` | Token de sala WebRTC |
| LiveKit grabación | `supabase/functions/livekit-webhook` | Egress con control de costo |
| Web Push | `supabase/functions/save-push-subscription` + `public/sw.js` | Notificaciones PWA |

## Próximos pasos sugeridos
- Personaliza `quiz-config.ts` con TU embudo (objetivo → objeción → oferta).
- Agrega el paso de **audio** (grabar respuesta del usuario → transcribir → IA).
- A/B testea la variante de copy que más convierte.
