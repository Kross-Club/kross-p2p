// ─── La cascada de recojo · pasos 2, 3 y 4 ──────────────────────────────────
//
// El cron diario que persigue al comprador que no fue por su paquete, para que
// no lo haga una persona. Lo invoca pg_cron una vez al día (§44 de
// `setup-kross.sql`); no recibe parámetros y es idempotente, así que invocarlo
// de más no manda nada dos veces.
//
// Por qué existe: entre el 27 % y el 35 % de los compradores no recoge si nadie
// insiste (`ICP Sales/VALIDACION-AGENCIA.md`), la agencia devuelve el paquete a
// los ~7 días, y ahí se pierden los dos fletes y la venta. El paso 1 —el aviso
// de llegada— ya lo manda el tracking al entrar en `EN_DESTINO`
// (`_shared/tracking.ts`); esta función manda los que vienen después:
//
//   Paso 2 · día 2 · recordatorio          → chat + push + SMS
//   Paso 3 · día 4 · último aviso con fecha → chat + push + SMS
//   Paso 4 · día 5 · aviso al vendedor      → nota interna en el hilo del pedido
//
// La regla de los días es pura y está probada aparte: `_shared/recojo.ts`.
//
// Tres cosas que NO hace, y son decisiones:
//   · No manda WhatsApp. El riel de avisos es el SMS (doc 08 § actualización):
//     llega sin app y sin permiso, y no invita a responder por un canal que
//     nadie lee.
//   · No mueve el pipeline. `entregado` y `no_entregado` los marca una persona
//     (regla del contrato); la cascada solo deja de insistir.
//   · No repite un paso vencido. Si el cron estuvo caído, salta al paso que
//     corresponde hoy: un recordatorio de hace cuatro días enseña que los
//     mensajes de esta marca llegan tarde.

import { broadcast, chatMessage, saldoOf, supabase } from '../_shared/tracking.ts'
import { notifyBuyer } from '../_shared/notificar.ts'
import { mandarPlantillaDeRecojo, type PasoWa } from '../_shared/wa-recojo.ts'
import {
  DIAS_EN_AGENCIA_DEFAULT, diasDesde, fechaDeDevolucion, fechaEnPalabras,
  pasoDebido, type PasoRecojo,
} from '../_shared/recojo.ts'
import { isPickupDispatch } from '../_shared/despacho.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

/** Techo por corrida. Cada paso de comprador cuesta un SMS, y una corrida que
 *  se dispara sola no puede tener un costo sin tope. Con el volumen de hoy no
 *  se acerca; si algún día lo toca, se sube a sabiendas. */
const MAX_PEDIDOS = 300

const COLUMNAS =
  'id, store_id, token, buyer_id, buyer_phone, buyer_name, product_name, product_price, ' +
  'advance_amount, payment_verification, saldo_verification, agency_name, dispatch_type, ' +
  'stage, status, tracking_phase, tracking_phase_at, pickup_reminder_step'

interface Fila {
  id: string
  store_id: string | null
  token: string | null
  buyer_id: string | null
  buyer_phone: string | null
  buyer_name: string | null
  product_name: string | null
  product_price: number | null
  advance_amount: number | null
  payment_verification: string | null
  saldo_verification: string | null
  agency_name: string | null
  dispatch_type: string | null
  stage: string | null
  tracking_phase_at: string | null
  pickup_reminder_step: number | null
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const ahora = new Date()

  // Los que esperan recojo: llegaron a la agencia y nadie los ha marcado como
  // entregados ni como no entregados. `EN_DESTINO` + `stage` abierto ES
  // "esperando recojo" — no hizo falta una etapa nueva.
  const { data: rows, error } = await supabase
    .from('order_sessions')
    .select(COLUMNAS)
    .eq('status', 'active')
    .eq('tracking_phase', 'EN_DESTINO')
    .not('tracking_phase_at', 'is', null)
    .not('stage', 'in', '(entregado,no_entregado)')
    .lt('pickup_reminder_step', 3)
    .order('tracking_phase_at', { ascending: true })
    .limit(MAX_PEDIDOS)
  if (error) {
    console.error('pickup-reminders: query', error.message)
    return json({ ok: false, stage: 'query' }, 500)
  }

  const pedidos = (rows ?? []) as Fila[]
  // La config de cada marca, de una sola consulta: una por pedido serían
  // trescientos viajes para leer dos columnas.
  const tiendas = await configPorTienda(pedidos)

  let recordatorios = 0, ultimos = 0, vendedores = 0, saltados = 0
  for (const p of pedidos) {
    // Solo recojo en agencia. Un pedido a domicilio con fase EN_DESTINO no
    // existe hoy, pero el día que exista no se le habla de ir a un mostrador.
    if (!isPickupDispatch(p.dispatch_type)) { saltados++; continue }
    const cfg = tiendas.get(String(p.store_id ?? '')) ?? { activa: true, dias: DIAS_EN_AGENCIA_DEFAULT }
    if (!cfg.activa) { saltados++; continue }

    const dias = diasDesde(p.tracking_phase_at, ahora)
    if (dias === null) { saltados++; continue }

    const hecho = (p.pickup_reminder_step ?? 0) as PasoRecojo
    const debido = pasoDebido(dias)
    if (debido <= hecho) { saltados++; continue }

    const ok = await mandarPaso(p, debido, cfg.dias)
    if (!ok) continue
    // El avance se escribe SIEMPRE que el paso salió, y en la misma corrida:
    // es lo que vuelve idempotente al cron si se dispara dos veces.
    await supabase.from('order_sessions')
      .update({ pickup_reminder_step: debido, pickup_reminder_last_at: ahora.toISOString() })
      .eq('id', p.id)

    if (debido === 1) recordatorios++
    else if (debido === 2) ultimos++
    else vendedores++
  }

  return json({
    ok: true,
    revisados: pedidos.length,
    recordatorios, ultimos_avisos: ultimos, avisos_al_vendedor: vendedores, saltados,
    corrida: ahora.toISOString(),
  })
})

/** Manda el paso que toca. Devuelve `false` solo si no se pudo hacer nada, para
 *  que el pedido lo reintente mañana en vez de quedar marcado sin aviso. */
async function mandarPaso(p: Fila, paso: PasoRecojo, diasEnAgencia: number): Promise<boolean> {
  const agencia = p.agency_name ?? 'la agencia'
  const saldo = saldoOf(p)

  // ── Paso 4 · el vendedor. Recién acá entra una persona, y solo para las
  // excepciones: los que ya ignoraron dos mensajes. Va al hilo del pedido con
  // `visibility: 'sellers'`, que es la cola de llamadas que el equipo ya mira.
  if (paso === 3) {
    const vence = p.tracking_phase_at
      ? fechaEnPalabras(fechaDeDevolucion(p.tracking_phase_at, diasEnAgencia))
      : 'pronto'
    await chatMessage(
      p.id,
      `📞 ${p.buyer_name ?? 'El comprador'} no recoge su pedido en ${agencia} (lleva 5 días y se devuelve el ${vence}).`
      + ` Ya se le avisó dos veces por mensaje: toca llamarlo.`
      + (saldo > 0 ? ` Debe S/${saldo}.` : ''),
      'sellers',
    )
    return true
  }

  if (paso === 1) {
    const texto = saldo > 0
      ? `📦 Tu pedido sigue esperándote en ${agencia}. Paga tu saldo de S/${saldo} desde acá y recógelo con tu DNI.`
      : `📦 Tu pedido sigue esperándote en ${agencia}. Recógelo con tu DNI y tu clave de recojo.`
    await chatMessage(p.id, texto, 'all')
    await avisar(p, texto, 'recordatorio')
    return true
  }

  // ── Paso 3 · el último aviso, con la fecha real de devolución ──
  const vence = fechaEnPalabras(fechaDeDevolucion(p.tracking_phase_at!, diasEnAgencia))
  const texto = `⚠️ ${agencia} devuelve tu pedido el ${vence} y después ya no podremos entregártelo.`
    + (saldo > 0 ? ` Paga tu saldo de S/${saldo} desde acá y recógelo con tu DNI.` : ' Recógelo con tu DNI y tu clave de recojo.')
  await chatMessage(p.id, texto, 'all')
  await avisar(p, texto, 'ultimo_aviso')
  return true
}

/**
 * Push + plantilla de WhatsApp. El push es gratis y llega al que dio permiso;
 * la plantilla de utilidad es la que alcanza al resto, y es el riel desde que
 * la cotización de Twilio mostró que un SMS cuesta más de lo que el pedido
 * deja (`_shared/wa-recojo.ts`). El SMS del embudo queda en `'nunca'`: hoy está
 * apagado por precio, y prenderlo aquí duplicaría el aviso.
 */
async function avisar(p: Fila, cuerpo: string, paso: PasoWa) {
  try {
    await notifyBuyer({
      buyerId: p.buyer_id, sessionId: p.id, storeId: p.store_id,
      title: p.product_name ? `📦 ${p.product_name}` : '📦 Tu pedido',
      body: cuerpo.replace(/^[^\s]+\s/, '').slice(0, 140),
      url: p.token ? `/p/${p.token}` : '/',
      tag: `recojo-${p.id}`,
      type: 'status',
      sms: 'nunca',
    })
    await mandarPlantillaDeRecojo(p.id, p.store_id, paso)
    await broadcast(p.id, 'tracking_update', {})
  } catch (e) {
    // El chat ya tiene el mensaje: que falle el aviso no borra lo hecho.
    console.error('pickup-reminders: fallo el aviso', p.id, e)
  }
}

/** `pickup_reminders_enabled` y `agency_hold_days` de las marcas involucradas. */
async function configPorTienda(pedidos: Fila[]): Promise<Map<string, { activa: boolean; dias: number }>> {
  const ids = [...new Set(pedidos.map(p => String(p.store_id ?? '')).filter(Boolean))]
  const out = new Map<string, { activa: boolean; dias: number }>()
  if (ids.length === 0) return out
  const { data } = await supabase.from('stores')
    .select('id, pickup_reminders_enabled, agency_hold_days').in('id', ids)
  for (const s of data ?? []) {
    const r = s as { id: string; pickup_reminders_enabled: boolean | null; agency_hold_days: number | null }
    out.set(String(r.id), {
      activa: r.pickup_reminders_enabled !== false,
      dias: Number(r.agency_hold_days) > 0 ? Number(r.agency_hold_days) : DIAS_EN_AGENCIA_DEFAULT,
    })
  }
  return out
}
