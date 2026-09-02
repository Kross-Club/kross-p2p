// ─── SALES ENGINE · La vuelta desde Flow ─────────────────────────────────────
//
// Flow devuelve al comprador con un **POST del navegador** a `urlReturn`, con
// el token en el body (doc "Finalización de orden"). Y la PWA no puede recibir
// un POST: `vercel.json` reescribe todo a `index.html`, que es estático. Así que
// la vuelta aterriza acá y se convierte en un **302 a su pedido**.
//
// Se despliega con --no-verify-jwt: lo llama el navegador del comprador, sin
// sesión. Y no se le dice NADA al comprador desde acá — ni "pagado" ni
// "rechazado": eso lo pinta la página del pedido leyendo el estado real, que
// dejó `flow-confirm`. Un mensaje armado acá con el token y sin verificar sería
// exactamente lo que la doc de Flow pide no hacer.
//
// ⚠️ El token de Flow NO es el `order_token` de la PWA. El de la PWA es la
// credencial del pedido y jamás viaja por la URL de retorno que Flow conoce;
// se resuelve acá, del lado del servidor, por la fila de `cobros`.
//
// De paso, la segunda oportunidad: si la confirmación (`flow-confirm`) no
// llegó —nuestra función caída en ese instante—, esta vuelta la dispara en
// segundo plano con el mismo token. Es idempotente por dedupe, así que si ya
// llegó, no pasa nada.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { runInBackground } from '../_shared/capi.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const HOME = 'https://krossclub.app'

const redirect = (to: string) =>
  new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store' } })

Deno.serve(async (req) => {
  // Flow hace POST; un GET vale igual (alguien que recarga la página de vuelta).
  let token = ''
  if (req.method === 'POST') {
    const raw = await req.text()
    token = new URLSearchParams(raw).get('token')?.trim() ?? ''
  }
  if (!token) token = new URL(req.url).searchParams.get('token')?.trim() ?? ''
  if (!token) return redirect(HOME)

  const { data: cobro } = await supabase.from('cobros')
    .select('session_id').eq('flow_token', token).maybeSingle()
  if (!cobro) return redirect(HOME)

  const { data: session } = await supabase.from('order_sessions')
    .select('token, origin_store_id, store_id').eq('id', cobro.session_id).maybeSingle()
  if (!session?.token) return redirect(HOME)

  // La segunda oportunidad de la confirmación. Sin esperarla: la vuelta del
  // comprador no puede colgarse de una consulta a Flow.
  runInBackground(fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/flow-confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }).toString(),
  }))

  const originStoreId = String(session.origin_store_id ?? session.store_id ?? '')
  const { data: store } = originStoreId
    ? await supabase.from('stores').select('slug').eq('id', originStoreId).maybeSingle()
    : { data: null }
  const base = store?.slug ? `https://${store.slug}.krossclub.app` : HOME
  return redirect(`${base}/p/${encodeURIComponent(session.token)}`)
})
