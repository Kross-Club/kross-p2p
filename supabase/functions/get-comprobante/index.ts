import { createClient } from 'npm:@supabase/supabase-js@2'
import { tieneComprobante } from '../_shared/comprobante.ts'
import { rastroDelEvento } from '../_shared/rastro.ts'
import type { DatosDeComprobante } from '../_shared/comprobante.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// ─── La constancia de un cobro ───────────────────────────────────────────────
//
// Se pide por el id del cobro y por nada más. Ese id es un uuid v4 —no se
// adivina— y esa es toda la llave, igual que el token del pedido: el comprador
// abre su comprobante desde el chat sin tener que iniciar sesión, que es lo
// único que hace que se pueda enseñar, guardar y reenviar.
//
// Por eso mismo la respuesta lleva **lo justo**. Nada de teléfono, DNI,
// dirección, id de cupón ni quién lo creó: un comprobante que se comparte por
// WhatsApp no puede llevar más de lo que hace falta para probar que se pagó.
// El nombre sí — es de quien paga, y sin él la constancia no es de nadie.
//
// Y solo si el cobro ENTRÓ. Una constancia de un cobro pendiente sería un papel
// que dice que se pagó algo que no se pagó, y el comprador la enseñaría de
// buena fe.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const cobroId = (url.searchParams.get('cobro_id') ?? '').trim()
  if (!cobroId) return json({ error: 'missing_cobro' }, 400)

  const { data: cobro } = await supabase.from('cobros')
    .select('id, session_id, tipo, monto, estado, concepto, matched_at, payment_event_id, pay360_consumer_code')
    .eq('id', cobroId).maybeSingle()

  // El mismo 404 para "no existe" y para "existe pero no se pagó": quien tantea
  // ids no aprende de la respuesta cuáles son reales.
  if (!cobro || !tieneComprobante(cobro)) return json({ error: 'not_found' }, 404)

  const { data: session } = await supabase.from('order_sessions')
    .select('id, order_id, store_id, buyer_name, product_price')
    .eq('id', cobro.session_id).maybeSingle()
  if (!session) return json({ error: 'not_found' }, 404)

  const { data: store } = session.store_id
    ? await supabase.from('stores').select('nombre, logo_url').eq('id', session.store_id).maybeSingle()
    : { data: null }

  // Lo pagado sale de la LISTA de cobros y no de las columnas: es la misma
  // cuenta que el panel enseña y la que el anillo mide, y un comprobante que
  // diga otra cosa que el panel es peor que no tenerlo.
  const { data: hermanos } = await supabase.from('cobros')
    .select('monto, estado').eq('session_id', cobro.session_id)

  const total = Math.max(0, Number(session.product_price ?? 0))
  const pagado = (hermanos ?? [])
    .filter(c => String(c.estado ?? '').toUpperCase() === 'MATCHED')
    .reduce((n, c) => n + Math.max(0, Number(c.monto ?? 0)), 0)

  // El rastro bancario todavía vive en el evento de pago, no en la fila del
  // cobro. Se lee con la MISMA función que `get-session` (`_shared/rastro.ts`):
  // un comprobante que diga otro número de operación que el panel es peor que
  // no tenerlo, y un comprobante sin número no sirve para reclamar, que es la
  // mitad de para qué existe.
  //
  // El `_id` del cupón va en `null` a propósito: no se le manda al comprador.
  // Es un id de API que su portal ni siquiera enseña.
  const { data: ev } = cobro.payment_event_id
    ? await supabase.from('payment_events')
        .select('raw, operation_number').eq('id', cobro.payment_event_id).maybeSingle()
    : { data: null }
  const rastro = rastroDelEvento(ev, null, cobro.pay360_consumer_code ?? null)

  const datos: DatosDeComprobante = {
    cobro_id: cobro.id,
    pedido: session.order_id ?? null,
    tienda: store?.nombre ?? null,
    logo: store?.logo_url ?? null,
    comprador: session.buyer_name ?? null,
    tipo: String(cobro.tipo),
    concepto: cobro.concepto ?? null,
    monto: Math.max(0, Number(cobro.monto ?? 0)),
    cobrado_en: cobro.matched_at ?? null,
    payment_code: rastro?.payment_code ?? null,
    operation_number: rastro?.operation_number ?? null,
    bank: rastro?.bank ?? null,
    total,
    pagado,
    saldo: Math.max(0, total - pagado),
  }

  return json(datos)
})
