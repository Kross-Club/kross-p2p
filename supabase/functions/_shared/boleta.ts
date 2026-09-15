// ─── La boleta electrónica de un pedido, emitida por Nubefact ────────────────
//
// Quien paga el pedido COMPLETO recibe su boleta de venta electrónica, emitida
// por LA MARCA (su RUC, su cuenta de Nubefact) y aceptada por SUNAT. La pide
// `flow-confirm` apenas el pedido queda pagado —adelanto total, o el saldo que
// lo completa— y el botón «Emitir boleta» del panel cuando algo falló. Siempre
// best-effort: un pedido cobrado con una boleta que no salió es un pedido
// cobrado, y el vendedor se entera por una nota en el chat.
//
// Reglas que este archivo sostiene (§58):
//   · UNA boleta por pedido. La reserva del número (`boleta_estado =
//     PENDIENTE`) es lo que gana la carrera entre dos llamadas; y Nubefact
//     recibe el ORD como `codigo_unico`, así que un duplicado que se le
//     escapara a la base vuelve con código 23 y se consulta, no se reemite.
//   · El número lo da la base, atómico (`siguiente_numero_de_boleta`), y si la
//     emisión falla se QUEDA en el pedido: el reintento va con el mismo, para
//     no dejar huecos en el correlativo que SUNAT exige.
//   · El total facturado es el del pedido (`product_price`), que es lo que el
//     comprador pagó: si las líneas no lo suman (un descuento, un upsell viejo),
//     se factura una sola línea con el pedido entero antes que una boleta que
//     no cuadra con la plata que entró.
//   · La aritmética y el JSON viven en `nubefact.ts` (puro, con tests).

import { supabase, chatMessage, saldoOf } from './tracking.ts'
import { anotar, anotarSinRespuesta } from './api-eventos.ts'
import {
  armarBoleta, clienteDeBoleta, consultaDeBoleta, esRuc, esSerieDeBoleta, leerRespuesta,
  puedeFacturar, redondear2,
  type ItemDeBoleta, type RespuestaNubefact,
} from './nubefact.ts'

const TIMEOUT_MS = 30_000

export type ResultadoDeBoleta =
  | { ok: true; serie: string; numero: number; url: string | null; aceptada: boolean; yaEstaba: boolean }
  | { ok: false; motivo: 'sin_configurar' | 'sin_pagar' | 'en_curso' | 'no_encontrado' | 'sin_sql' | 'nubefact'; detalle: string }

interface SesionParaBoleta {
  id: string
  order_id: string | null
  store_id: string | null
  origin_store_id: string | null
  buyer_id: string | null
  buyer_name: string | null
  address: string | null
  product_price: number | null
  product_name: string | null
  pack_name: string | null
  items: { nombre?: string; precio?: number | string; qty?: number; pack_name?: string | null; product_id?: string | null }[] | null
  advance_amount: number | string | null
  payment_verification: string | null
  saldo_verification: string | null
  boleta_serie: string | null
  boleta_numero: number | null
  boleta_estado: string | null
  boleta_url: string | null
}

const COLS = 'id, order_id, store_id, origin_store_id, buyer_id, buyer_name, address, product_price, product_name, pack_name, items, '
  + 'advance_amount, payment_verification, saldo_verification, boleta_serie, boleta_numero, boleta_estado, boleta_url'

/** Las líneas a facturar. El total tiene que ser el del pedido: es la plata
 *  que entró. Si los ítems no lo suman, una sola línea con el pedido entero. */
export function lineasDelPedido(s: Pick<SesionParaBoleta, 'items' | 'product_price' | 'product_name' | 'pack_name' | 'order_id'>): ItemDeBoleta[] {
  const total = redondear2(Number(s.product_price ?? 0))
  const items = (s.items ?? [])
    .map(it => ({
      descripcion: [it.nombre, it.pack_name].filter(Boolean).join(' · ') || 'Producto',
      cantidad: Number(it.qty) > 0 ? Number(it.qty) : 1,
      precioConIgv: Number(it.precio) || 0,
      codigo: it.product_id ?? null,
    }))
    .filter(it => it.precioConIgv > 0)
  const suma = redondear2(items.reduce((a, it) => a + it.precioConIgv * it.cantidad, 0))
  if (items.length > 0 && suma === total) return items
  const nombre = [s.product_name, s.pack_name].filter(Boolean).join(' · ') || `Pedido ${s.order_id ?? ''}`.trim()
  return [{ descripcion: nombre, cantidad: 1, precioConIgv: total, codigo: null }]
}

/** Qué le falta a la marca para poder facturar. Para decirlo con nombre y
 *  apellido en vez de «no está configurada». */
function faltantes(
  t: { ruc?: string | null; razon_social?: string | null; boleta_serie?: string | null },
  sec: { nubefact_ruta?: string | null; nubefact_token?: string | null } | null | undefined,
): string[] {
  const falta: string[] = []
  if (!esRuc(t.ruc)) falta.push('RUC')
  if (!String(t.razon_social ?? '').trim()) falta.push('razón social')
  if (!esSerieDeBoleta(t.boleta_serie)) falta.push('serie de boletas')
  if (!/^https?:\/\//.test(String(sec?.nubefact_ruta ?? '').trim())) falta.push('ruta de Nubefact')
  if (!String(sec?.nubefact_token ?? '').trim()) falta.push('token de Nubefact')
  return falta
}

async function llamarANubefact(ruta: string, token: string, body: unknown): Promise<{ status: number; json: unknown } | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(ruta, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const json = await r.json().catch(() => null)
    return { status: r.status, json }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export async function emitirBoleta(sessionId: string, opts: { manual?: boolean } = {}): Promise<ResultadoDeBoleta> {
  // A mano (el botón del panel) se deja pasar un PENDIENTE colgado: una
  // emisión que murió a medias no puede bloquear el reintento para siempre.
  const manual = opts.manual === true
  // TODO camino que no emite deja rastro en el log de la función (15-set-2026):
  // la emisión automática corre en segundo plano, así que un `return` mudo era
  // un «no me salió la boleta» sin una sola pista dónde mirar. Costó una tarde.
  const salir = (r: ResultadoDeBoleta): ResultadoDeBoleta => {
    if (!r.ok) console.log('[boleta] no se emitió', JSON.stringify({ sessionId, motivo: r.motivo, detalle: r.detalle, manual }))
    return r
  }

  const { data: s, error: errSesion } = await supabase.from('order_sessions').select(COLS).eq('id', sessionId).maybeSingle()
  const session = s as SesionParaBoleta | null
  if (!session) {
    // Sin las columnas del §58 el select ENTERO falla, y eso no es «no existe
    // el pedido»: es que el SQL no se corrió. Se dicen distinto o se busca el
    // problema donde no está.
    return salir(errSesion
      ? { ok: false, motivo: 'sin_sql', detalle: `faltan las columnas de la boleta (§58 de setup-kross.sql): ${errSesion.message}` }
      : { ok: false, motivo: 'no_encontrado', detalle: 'pedido no encontrado' })
  }

  // Ya la tiene: la misma respuesta, sin tocar nada.
  if (session.boleta_url && session.boleta_serie && session.boleta_numero) {
    return { ok: true, serie: session.boleta_serie, numero: session.boleta_numero, url: session.boleta_url, aceptada: session.boleta_estado === 'ACEPTADA', yaEstaba: true }
  }

  const storeId = String(session.origin_store_id ?? session.store_id ?? '')
  const { data: tienda, error: errTienda } = await supabase.from('stores')
    .select('nubefact_enabled, ruc, razon_social, direccion_fiscal, boleta_serie, nombre').eq('id', storeId).maybeSingle()
  const { data: secretos } = await supabase.from('store_secrets')
    .select('nubefact_ruta, nubefact_token').eq('store_id', storeId).maybeSingle()
  if (errTienda) {
    return salir({ ok: false, motivo: 'sin_sql', detalle: `faltan las columnas de facturación en \`stores\` (§58): ${errTienda.message}` })
  }
  if (!tienda || !puedeFacturar(tienda, secretos)) {
    // La marca que ENCENDIÓ la facturación y le falta una pieza sí es un
    // problema suyo, y va a `api_events` para que lo vea en *Conexiones*. La
    // que nunca la encendió no factura y punto: no se le llena la pantalla de
    // eventos por una función que no usa.
    const detalle = tienda?.nubefact_enabled === true
      ? `la marca encendió la facturación pero le falta una pieza (RUC, razón social, serie, ruta o token): ${faltantes(tienda, secretos).join(', ')}`
      : 'la marca no tiene la facturación configurada (Marca → Boleta electrónica con Nubefact)'
    if (tienda?.nubefact_enabled === true) {
      await anotar({
        proveedor: 'NUBEFACT', op: 'boleta.emitir', outcome: 'RECHAZO',
        storeId, sessionId: session.id, detail: detalle,
      })
    }
    return salir({ ok: false, motivo: 'sin_configurar', detalle })
  }

  // Solo el pedido pagado del TODO: la boleta es de la venta cerrada.
  if (session.payment_verification !== 'MATCHED' || saldoOf(session) > 0) {
    return salir({
      ok: false, motivo: 'sin_pagar',
      detalle: `el pedido todavía no está pagado completo (adelanto ${session.payment_verification ?? 'sin cruzar'}, falta S/${saldoOf(session)})`,
    })
  }

  // ── El número: reservar o reusar ──
  let serie = session.boleta_serie
  let numero = session.boleta_numero
  if (!numero) {
    // Gana quien marca PENDIENTE primero. `.is('boleta_numero', null)` es la
    // condición de carrera resuelta en la base, no en memoria.
    const { data: reservado } = await supabase.from('order_sessions')
      .update({ boleta_estado: 'PENDIENTE' })
      .eq('id', session.id).is('boleta_numero', null)
      .or(manual ? 'boleta_estado.is.null,boleta_estado.eq.ERROR,boleta_estado.eq.PENDIENTE' : 'boleta_estado.is.null,boleta_estado.eq.ERROR')
      .select('id')
    if (!reservado || reservado.length === 0) {
      return salir({ ok: false, motivo: 'en_curso', detalle: 'la boleta de este pedido ya se está emitiendo' })
    }
    const { data: n, error: errN } = await supabase.rpc('siguiente_numero_de_boleta', { p_store_id: storeId })
    if (errN || !Number.isFinite(Number(n))) {
      await supabase.from('order_sessions').update({ boleta_estado: null }).eq('id', session.id)
      return salir({ ok: false, motivo: 'nubefact', detalle: `no se pudo reservar el número: ${errN?.message ?? 'sin respuesta'}` })
    }
    serie = String(tienda.boleta_serie ?? 'B001').toUpperCase()
    numero = Number(n)
    await supabase.from('order_sessions').update({ boleta_serie: serie, boleta_numero: numero }).eq('id', session.id)
  } else {
    await supabase.from('order_sessions').update({ boleta_estado: 'PENDIENTE' }).eq('id', session.id)
  }
  serie = String(serie ?? tienda.boleta_serie ?? 'B001').toUpperCase()

  // ── El cliente y las líneas ──
  const { data: buyer } = session.buyer_id
    ? await supabase.from('buyers').select('document_number').eq('id', session.buyer_id).maybeSingle()
    : { data: null }
  const cliente = clienteDeBoleta({ dni: buyer?.document_number ?? null, nombre: session.buyer_name, direccion: session.address })
  const body = armarBoleta({
    serie, numero, cliente, fecha: new Date(),
    items: lineasDelPedido(session),
    codigoUnico: session.order_id ?? session.id,
    medioDePago: 'YAPE',
    observaciones: session.order_id ? `Pedido ${session.order_id}` : null,
  })

  // ── Nubefact ──
  const ctx = { proveedor: 'NUBEFACT' as const, storeId, sessionId: session.id }
  const inicio = Date.now()
  const ruta = String(secretos!.nubefact_ruta).trim()
  const token = String(secretos!.nubefact_token).trim()
  const r = await llamarANubefact(ruta, token, body)
  if (!r) {
    await anotarSinRespuesta({ ...ctx, op: 'boleta.emitir' }, 'sin respuesta en 30 s', Date.now() - inicio)
    return await fallo(session, `${serie}-${numero}`, 'Nubefact no respondió. Reintenta desde el pedido.')
  }
  let leida: RespuestaNubefact = leerRespuesta(r.json, r.status)

  // Código 23: ya la tiene (un reintento después de un timeout, por ejemplo).
  // Se consulta y se guarda lo que diga; no se emite otra.
  let reconciliada = false
  if (!leida.ok && leida.yaExiste) {
    const c = await llamarANubefact(ruta, token, consultaDeBoleta(serie, numero))
    if (c) { leida = leerRespuesta(c.json, c.status); reconciliada = leida.ok }
  }

  if (!leida.ok) {
    await anotar({
      ...ctx, op: 'boleta.emitir', outcome: r.status >= 500 ? 'FALLO' : 'RECHAZO', httpStatus: r.status,
      errorCode: leida.codigo != null ? String(leida.codigo) : null, detail: leida.mensaje,
      providerRef: `${serie}-${numero}`, duracionMs: Date.now() - inicio,
    })
    return await fallo(session, `${serie}-${numero}`, leida.mensaje)
  }

  await anotar({
    ...ctx, op: reconciliada ? 'boleta.consultar' : 'boleta.emitir', outcome: 'OK', httpStatus: r.status,
    detail: leida.aceptada ? 'aceptada por SUNAT' : (leida.sunat ?? 'emitida, SUNAT pendiente'),
    providerRef: `${leida.serie}-${leida.numero}`, duracionMs: Date.now() - inicio,
  })
  const estado = leida.aceptada ? 'ACEPTADA' : 'EMITIDA'
  await supabase.from('order_sessions').update({
    boleta_estado: estado, boleta_url: leida.pdf, boleta_enlace: leida.enlace,
    boleta_emitida_at: new Date().toISOString(), boleta_error: null,
  }).eq('id', session.id)

  // Al comprador, como tarjeta con su botón; al equipo, la nota.
  await chatMessage(session.id,
    `🧾 Tu boleta electrónica ${serie}-${numero} ya está lista.`,
    'all', { type: 'boleta', media_url: leida.pdf })
  if (!leida.aceptada) {
    await chatMessage(session.id,
      `🧾 Boleta ${serie}-${numero} emitida en Nubefact; SUNAT todavía no la acepta${leida.sunat ? `: ${leida.sunat}` : ''}.`,
      'sellers')
  }
  console.log('[boleta] emitida', JSON.stringify({ sessionId, ref: `${serie}-${numero}`, aceptada: leida.aceptada }))
  return { ok: true, serie, numero, url: leida.pdf, aceptada: leida.aceptada, yaEstaba: false }
}

/** La emisión no salió: el número se queda reservado para reintentar con él,
 *  el pedido lo dice, y el equipo se entera por el chat. */
async function fallo(session: SesionParaBoleta, ref: string, detalle: string): Promise<ResultadoDeBoleta> {
  await supabase.from('order_sessions').update({ boleta_estado: 'ERROR', boleta_error: detalle.slice(0, 400) }).eq('id', session.id)
  await chatMessage(session.id,
    `⚠️ No se pudo emitir la boleta ${ref}: ${detalle} Reintenta desde el pedido (botón «Emitir boleta»).`,
    'sellers')
  return { ok: false, motivo: 'nubefact', detalle }
}
