# Quiz Funnel

Landing de **alta conversión** con quiz guiado (texto / IA / audio) sobre un stack
probado: **React + Vite + Tailwind + Supabase Edge Functions**, con integraciones de
**LiveKit** (voz + grabación), **WhatsApp Cloud API** (fallback), **Web Push** e **IA**.

Starter limpio, sin lógica de negocio heredada. Para montarlo desde cero (repo,
Supabase, Vercel, secrets y deploy) sigue **[SETUP.md](./SETUP.md)**.

## Arranque rápido

```
npm install
cp .env.example .env   # completa URL + anon key
npm run dev
```

El quiz se define en `src/lib/quiz-config.ts` — cambia el embudo editando ese arreglo.
