// ─── Registrar la guía en el pedido — COMPARTIDO entre sus dos orígenes ──────
// La guía puede entrar al pedido por dos caminos:
//   · A MANO — Logística la copia del comprobante físico en `TrackingBar`
//     (`order-manage` · set_tracking). Fue el único durante todo el tracking.
//   · SOLA — `shalom-order` la pide al proveedor cuando el adelanto cuadra.
//
// Lo que pasa DESPUÉS tiene que ser idéntico venga por donde venga: mismas
// validaciones, mismo mensaje al comprador, misma suscripción al webhook. Por
// eso vive acá y no duplicado — misma razón por la que el reflejo de fases vive
// en `tracking.ts` (si un pedido hablara dos idiomas según por dónde llegó la
// noticia, la mitad de los envíos quedaría fuera de la cascada).

import { broadcast, chatMessage, saldoOf, supabase } from './tracking.ts'
import { shalomApiKey, shalomLatApiKey } from './shalom.ts'
import { SHALOM_LAT_BASE, trackBody } from './shalom-lat.ts'
import { olvaLatApiKey, subscribeAtLat } from './olva-lat-api.ts'
import { anotar, anotarRespuesta, anotarSinRespuesta } from './api-eventos.ts'
import { normalizeYear } from './olva.ts'
import { idsDeGuia, mensajeDeClave, mensajeDeGuia } from './mensaje-de-guia.ts'
import { esPdf, parseOrderResponse } from './shalom-orders.ts'
import { SUFIJO_GUIA, SUFIJO_ROTULO, pdfMejorable } from './guia-pdf.ts'
import type { TrackedRow } from './tracking.ts'
import { enviarSms, tiendaParaSms } from './sms.ts'
import { enlaceDelPedido, smsGuia } from './sms-texto.ts'
import type { Courier } from './mensaje-de-guia.ts'
export type { Courier } from './mensaje-de-guia.ts'

/** Lo que el pedido necesita aportar para registrar una guía. */
export interface GuiaSession {
  id: string
  product_price: number | null
  advance_amount: number | null
  payment_verification: string | null
  /** Si el saldo YA cruzó cuando la guía se registra —pasa cuando el proveedor
   *  rechazó la emisión y el pago llegó antes que la guía manual—, la clave de
   *  recojo sale junto con ella: la promesa era contra el pago, y ya pagó. */
  saldo_verification?: string | null
  /** La clave de retiro, si este pedido la tiene: la guía automática de Shalom
   *  la elige, y la manual la copia del comprobante físico (`set_tracking`
   *  con `clave`). Sin ella no hay entrega automática — la manda una persona. */
  shalom_pickup_code?: string | null
  agency_name: string | null
}

export interface GuiaInput {
  courier?: string | null
  numero?: string | null
  codigo?: string | null
  ose_id?: string | null
  /** Solo Olva: año de emisión (YY). Sin él su API no rastrea. */
  year?: string | null
}

export interface TrackingPatch {
  tracking_courier: Courier
  tracking_numero: string | null
  tracking_codigo: string | null
  tracking_ose_id: string | null
  tracking_year: string | null
  tracking_phase: null
  tracking_phase_at: null
  tracking_demora_at: null
  tracking_checked_at: null
}

export type GuiaNormalizada =
  | { ok: true; courier: Courier; tracking: TrackingPatch; ids: string }
  | { ok: false; error: 'unsupported_courier' | 'invalid_tracking' }

/**
 * Valida como la API real de cada courier: Shalom exige numero (8–10 dígitos)
 * Y codigo (4 alfanuméricos) juntos, o solo ose_id; Olva rastrea por numero +
 * año de emisión, sin código.
 */
export function normalizarGuia(t: GuiaInput, agencyName: string | null, now = Date.now()): GuiaNormalizada {
  const courier = String(t.courier ?? agencyName ?? '').toUpperCase()
  if (courier !== 'SHALOM' && courier !== 'OLVA') return { ok: false, error: 'unsupported_courier' }

  const numero = String(t.numero ?? '').replace(/\D/g, '')
  const codigo = String(t.codigo ?? '').trim().toUpperCase()
  const oseId = String(t.ose_id ?? '').replace(/\D/g, '')
  const numeroOk = courier === 'SHALOM' ? /^\d{8,10}$/.test(numero) : /^\d{6,15}$/.test(numero)
  const codigoOk = /^[A-Z0-9]{4}$/.test(codigo)
  // Si no llega, es el año actual de Lima — la guía se registra al despachar.
  const year = courier === 'OLVA' ? normalizeYear(t.year, now) : null
  const valid = courier === 'SHALOM'
    ? (numeroOk && codigoOk) || !!oseId
    : numeroOk && !!year
  if (!valid) return { ok: false, error: 'invalid_tracking' }

  return {
    ok: true,
    courier,
    tracking: {
      tracking_courier: courier,
      tracking_numero: numeroOk ? numero : null,
      tracking_codigo: courier === 'SHALOM' && codigoOk ? codigo : null,
      tracking_ose_id: courier === 'SHALOM' && oseId ? oseId : null,
      tracking_year: year,
      // Guía nueva = tracking desde cero: el sync recalcula la fase.
      tracking_phase: null, tracking_phase_at: null,
      tracking_demora_at: null, tracking_checked_at: null,
    },
    // Los nombres, con el vocabulario del courier (`idsDeGuia`): en Shalom el
    // número es el "Nro. de orden" de su propio voucher.
    ids: idsDeGuia(courier, {
      numero: numeroOk ? numero : null,
      codigo: courier === 'SHALOM' && codigoOk ? codigo : null,
      oseId,
    }),
  }
}

/**
 * Escribe la guía en el pedido, se la manda al comprador y suscribe el envío al
 * webhook del proveedor. Devuelve el error de base si no se pudo escribir —el
 * resto (mensaje, broadcast, suscripción) es best-effort y nunca tumba el
 * registro: una guía escrita sin aviso se arregla; un aviso sin guía, no.
 */
export async function registrarGuia(
  session: GuiaSession,
  g: Extract<GuiaNormalizada, { ok: true }>,
  /** `yaSuscrito`: la guía nació suscrita al webhook (el generador de Shalom
   *  manda `track: true` en la misma llamada que la emite). Suscribirla otra
   *  vez gastaría una request del cupo para no cambiar nada. En Olva no
   *  aplica: allá la suscripción es una llamada aparte —y gratis—. */
  opts: { yaSuscrito?: boolean; pdfUrl?: string | null } = {},
): Promise<{ ok: true; avisado: boolean } | { ok: false; error: string }> {
  const { error } = await supabase.from('order_sessions').update(g.tracking).eq('id', session.id)
  if (error) return { ok: false, error: error.message }

  // El saldo DERIVADO, no asumido (misma regla que el acuse de pay360-webhook):
  // a quien pagó el total no se le habla de un saldo que no existe — su clave
  // de recojo va sin condición. Y un saldo YA cruzado cuenta como pagado: si el
  // pago llegó antes que la guía, la deuda no existe.
  // `saldo_verification` es opcional en `GuiaSession` (la guía manual no lo
  // trae) y `saldoOf` lo pide siempre: se normaliza acá, sin duplicar la regla.
  const saldo = saldoOf({ ...session, saldo_verification: session.saldo_verification ?? null })

  const aviso = await chatMessage(
    session.id,
    mensajeDeGuia(g.courier, g.ids),
    'all',
    // `guia` con su PDF: es lo que el chat pinta como tarjeta con el botón
    // "Ver mi guía de Shalom". Sin PDF —la guía registrada a mano no lo trae—
    // el mensaje sale igual, sin botón.
    { type: 'guia', media_url: opts.pdfUrl ?? null },
  )
  // Si el aviso al comprador NO entró, la guía existe pero él no se enteró: sin
  // tarjeta en su chat, sin número y sin PDF. Eso no puede quedar en silencio —
  // se le dice a Logística, que es quien puede reenviarlo. Pasó invisible hasta
  // el 07-set-2026 porque `chatMessage` no miraba el error del insert.
  if (!aviso.ok) {
    console.error('registrarGuia: el comprador NO recibió el aviso de su guía', session.id, aviso.error)
    await chatMessage(session.id,
      `⚠️ La guía quedó registrada (${g.ids}) pero el aviso al comprador NO se pudo escribir en su chat: `
      + `${aviso.error ?? 'error desconocido'}. Él no ve su guía — escríbele tú y avisa al equipo.`,
      'sellers')
  }
  // La CLAVE, solo si ya no queda nada por pagar: el mensaje de arriba acaba de
  // prometer "junto con la guía te entregaremos tu clave de recojo", y esta es
  // la entrega. Con saldo pendiente NO sale — la suelta el webhook cuando el
  // saldo cruce. Y solo si el pedido la tiene: la eligió la emisión automática,
  // o la copió Logística del comprobante físico al registrar a mano.
  if (saldo === 0 && session.shalom_pickup_code) {
    await chatMessage(session.id, mensajeDeClave(session.shalom_pickup_code), 'all')
  }
  await broadcast(session.id, 'tracking_update', g.tracking)
  if (!opts.yaSuscrito) await suscribirWebhook(session.id, g)
  // El SMS de la guía: el número es lo que la agencia pregunta, y quien no
  // instaló nada lo necesita en su bandeja. Lo que hace falta (teléfono, token,
  // tienda) se lee aquí y no se le pide a los tres que llaman. Best-effort.
  try {
    const { data: s } = await supabase.from('order_sessions')
      .select('store_id, token, buyer_phone').eq('id', session.id).maybeSingle()
    if (s) {
      const tienda = await tiendaParaSms(s.store_id)
      const r = await enviarSms({ storeId: s.store_id, sessionId: session.id }, s.buyer_phone, smsGuia({
        tienda: tienda.nombre, courier: g.courier, ids: g.ids, link: enlaceDelPedido(tienda, s.token),
      }))
      await supabase.from('notifications_log').insert({
        store_id: s.store_id, session_id: session.id, kind: 'status', push_count: 0,
        whatsapp: 'not_needed', sms: r.result, detail: r.error ?? `guia ${g.courier} ${g.ids}`.slice(0, 120),
      })
    }
  } catch (e) {
    console.error('registrarGuia: fallo el SMS de la guía', session.id, e)
  }
  // `avisado` viaja para que quien llama no escriba "el comprador ya la tiene
  // en su chat" cuando no la tiene.
  return { ok: true, avisado: aviso.ok }
}

// ─── El PDF de la guía formal de Shalom ──────────────────────────────────────
// `GET /v1/orders/{ose_id}/voucher` devuelve la guía como PDF binario: se baja
// una vez, se sube al bucket `shalom-guias` y su URL pública viaja en el
// mensaje `guia` del chat. Es lo que abre "Ver mi guía de Shalom", en el chat
// y en la pantalla de pedido confirmado; sin ella los dos caen a la hoja de
// guía de la app (`/guia/<token>`).
//
// Vive acá y no dentro de `shalom-order` porque tiene que poder correr DESPUÉS
// de la emisión (`reponerPdfDeGuia`), y pasó (07-set-2026) que un pedido real
// se quedó con la hoja de la app: la contingencia por Shalom LAT emite sin
// `ose_id` —sin él no hay voucher que pedir— hasta que el rastreo lo aprende,
// y el voucher del titular puede no bajar el día de la emisión y bajar al
// siguiente. Un PDF que no llegó a tiempo no puede ser un PDF que no llega
// nunca. Cada tropiezo queda en `api_events` (Panel → Conexiones → Shalom PE,
// ops `guia.voucher` / `guia.label` / `guia.storage`) para que "no me abre la
// guía" tenga una causa y no una teoría.

const SHALOM_PE_BASE = 'https://api.shalom-api-peru.com'
const PDF_TIMEOUT_MS = 30_000

/** Las cabeceras de la familia de crear pedido de Shalom PE: la llave del
 *  proveedor más la cuenta Shalom Pro de la marca. El voucher se pide con la
 *  misma cuenta que emitió. */
export type AuthShalomPro = Record<'X-API-Key' | 'X-Shalom-Email' | 'X-Shalom-Password', string>

export async function authShalomPro(storeId: string): Promise<AuthShalomPro | null> {
  const key = await shalomApiKey()
  if (!key) return null
  const { data } = await supabase.from('store_secrets')
    .select('shalom_pro_email, shalom_pro_password, shalom_pro_status')
    .eq('store_id', storeId).maybeSingle()
  const email = String(data?.shalom_pro_email ?? '')
  const password = String(data?.shalom_pro_password ?? '')
  if (!email || !password || data?.shalom_pro_status !== 'CONNECTED') return null
  return { 'X-API-Key': key, 'X-Shalom-Email': email, 'X-Shalom-Password': password }
}

/** Cada PDF se guarda diciendo QUÉ es: el voucher (la guía con QR) con un
 *  sufijo y el rótulo (la etiqueta del paquete) con otro. Es lo que deja a
 *  `reponerPdfDeGuia` y a «Reenviar» cambiar un rótulo por la guía cuando por
 *  fin baja. Los PDF de antes del 14-set-2026 no tienen sufijo: no se sabe
 *  cuál de los dos son, así que se tratan como mejorables. */
// Las reglas viven en `guia-pdf.ts` (puro): también las lee la app.
export { esRotuloDeGuia, esGuiaConfirmada, pdfMejorable } from './guia-pdf.ts'

/**
 * Baja el voucher (y si no, el rótulo) y lo sube al bucket. Devuelve la URL
 * pública o `null`. Best-effort y con timeout propio: un PDF que no baja no
 * puede retrasar ni tumbar el registro de la guía. Sin `ose_id` no hay nada
 * que pedir (Shalom LAT no lo maneja).
 *
 * El rótulo es el plan B, no el resultado: Shalom puede no tener el voucher
 * listo el día de la emisión (pasó el 14-set-2026: el comprador abrió su
 * «guía» y era la etiqueta del paquete, sin QR). Por eso se guarda con otro
 * nombre y `reponerPdfDeGuia` lo vuelve a intentar en la siguiente novedad
 * del rastreo.
 */
export async function descargarPdfDeGuia(p: {
  sessionId: string
  storeId: string | null
  oseId: string | null
  numero: string | null
  auth: AuthShalomPro
  /** Solo el voucher, sin caer al rótulo: para REPONER. Quien ya tiene un
   *  rótulo no gana nada con otro, y quien tiene un PDF viejo sin sufijo
   *  podría estar cambiando la guía por la etiqueta. */
  soloVoucher?: boolean
}): Promise<string | null> {
  if (!p.oseId) return null
  const ctx = { proveedor: 'SHALOM_PE' as const, sessionId: p.sessionId, storeId: p.storeId }
  try {
    for (const doc of p.soloVoucher ? ['voucher'] : ['voucher', 'label']) {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), PDF_TIMEOUT_MS)
      const inicio = Date.now()
      const r = await fetch(`${SHALOM_PE_BASE}/v1/orders/${p.oseId}/${doc}`, { headers: p.auth, signal: ctrl.signal })
        .catch(() => null)
      clearTimeout(t)
      const bytes = r?.ok
        ? new Uint8Array(await r.arrayBuffer().catch(() => new ArrayBuffer(0)))
        : new Uint8Array(0)
      const tipo = r?.headers.get('content-type') ?? null
      if (!r?.ok || !esPdf(tipo, bytes)) {
        // Anotado con lo que hace falta para reclamar: status, tipo y tamaño.
        await anotar({
          ...ctx, op: `guia.${doc}`,
          outcome: r ? (r.status >= 500 ? 'FALLO' : 'RECHAZO') : 'SIN_RESPUESTA',
          httpStatus: r?.status ?? null,
          detail: r ? `content-type ${tipo ?? '—'} · ${bytes.length} bytes` : 'sin respuesta',
          duracionMs: Date.now() - inicio,
        })
        continue
      }
      const path = `${p.sessionId}/${p.numero ?? p.oseId}${doc === 'label' ? SUFIJO_ROTULO : SUFIJO_GUIA}`
      const up = await supabase.storage.from('shalom-guias')
        .upload(path, bytes, { contentType: 'application/pdf', upsert: true })
      if (up.error) {
        // No es Shalom, es nuestro Storage (bucket sin crear, permisos), pero
        // se anota en la misma línea de tiempo: es donde se va a mirar.
        await anotar({ ...ctx, op: 'guia.storage', outcome: 'FALLO', detail: `Storage shalom-guias: ${up.error.message}` })
        return null
      }
      return supabase.storage.from('shalom-guias').getPublicUrl(path).data.publicUrl
    }
  } catch (e) {
    console.error('[guia] PDF de la guía no descargado', p.sessionId, String(e).slice(0, 200))
  }
  return null
}

/**
 * Busca en la cuenta Shalom Pro de la marca la orden con ESTE número, para
 * conocer su `ose_id` —lo único con lo que se puede pedir el voucher—. Es para
 * la guía registrada A MANO (14-set-2026): el vendedor copia el número y el
 * código del comprobante físico, y con eso solo no hay PDF que bajar; con el
 * `ose_id` de la cuenta, sí. Mira las últimas órdenes de la cuenta (la manual
 * es de hoy o de ayer): si no está entre ellas, se queda sin PDF y la hoja de
 * guía de la app sigue siendo el respaldo. Nunca emite nada.
 */
export async function buscarOseIdPorNumero(p: {
  auth: AuthShalomPro
  numero: string
  sessionId: string
  storeId: string | null
}): Promise<string | null> {
  const ctx = { proveedor: 'SHALOM_PE' as const, sessionId: p.sessionId, storeId: p.storeId }
  const inicio = Date.now()
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), PDF_TIMEOUT_MS)
    const r = await fetch(`${SHALOM_PE_BASE}/v1/orders?page=1&per_page=50`, { headers: p.auth, signal: ctrl.signal })
      .catch(() => null)
    clearTimeout(t)
    if (!r?.ok) {
      await anotar({ ...ctx, op: 'guia.buscar', outcome: r ? (r.status >= 500 ? 'FALLO' : 'RECHAZO') : 'SIN_RESPUESTA',
        httpStatus: r?.status ?? null, detail: `buscando la orden ${p.numero}`, duracionMs: Date.now() - inicio })
      return null
    }
    const json = await r.json().catch(() => null)
    const lista = (json as { orders?: unknown })?.orders
    if (!Array.isArray(lista)) return null
    const buscado = p.numero.replace(/\D/g, '')
    for (const o of lista) {
      const orden = o as Record<string, unknown>
      const g = parseOrderResponse(orden)
      if (g.numero && g.numero.replace(/\D/g, '') === buscado) {
        const id = orden?.id
        return id == null ? null : String(id)
      }
    }
    return null
  } catch (e) {
    await anotarSinRespuesta({ ...ctx, op: 'guia.buscar' }, e, Date.now() - inicio)
    return null
  }
}

/**
 * Si el mensaje de guía del pedido quedó SIN PDF —o con el RÓTULO en vez de
 * la guía, o con un PDF de antes que no dice cuál es— y ya se conoce el
 * `ose_id`, baja el voucher ahora y se lo pone al mensaje. Lo llaman el
 * webhook y el barrido de
 * Shalom en cada novedad del rastreo —no en cada chequeo—, así que cuesta un
 * puñado de requests por pedido, no una por cada media hora durante 21 días.
 * El chat lo enseña con el botón en su siguiente apertura; la pantalla de
 * pedido confirmado solo ve lo que existía en su primer minuto.
 */
export async function reponerPdfDeGuia(
  row: Pick<TrackedRow, 'id' | 'store_id' | 'tracking_numero' | 'tracking_ose_id'>,
  /** El `ose_id` recién leído, cuando la fila todavía no lo tiene. */
  oseIdLeido: string | null | undefined = null,
): Promise<boolean> {
  const oseId = row.tracking_ose_id ?? oseIdLeido ?? null
  if (!oseId || !row.store_id) return false
  const { data: msg } = await supabase.from('chat_messages').select('id, media_url')
    .eq('session_id', row.id).eq('type', 'guia')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!msg) return false
  // Con la guía de verdad ya puesta no hay nada que reponer.
  if (!pdfMejorable(msg.media_url)) return false
  const auth = await authShalomPro(row.store_id)
  if (!auth) return false
  // Con un PDF ya puesto (rótulo o viejo) solo vale el voucher: cambiarlo por
  // otro rótulo no mejora nada. Sin PDF, lo que baje.
  const url = await descargarPdfDeGuia({
    sessionId: row.id, storeId: row.store_id, oseId, numero: row.tracking_numero, auth, soloVoucher: !!msg.media_url,
  })
  if (!url) return false
  const { error } = await supabase.from('chat_messages').update({ media_url: url }).eq('id', msg.id)
  if (error) { console.error('[guia] no se pudo poner el PDF al mensaje', row.id, error.message); return false }
  return true
}

/**
 * Vuelve a mandarle al comprador el aviso de su guía, con lo que YA está
 * guardado en el pedido. No toca el rastreo: es solo el mensaje.
 *
 * Existe porque hasta el 07-set-2026 la base rechazaba los mensajes `guia`
 * (§45 del esquema) y hay pedidos con su guía emitida y cobrada cuyo comprador
 * nunca la vio. Un mensaje rechazado no vuelve solo, y la única forma de
 * repararlo era volver a escribir la guía a mano en *Corregir* —retipeando el
 * número, con el riesgo de romper el rastreo de un envío que iba bien—. Se
 * queda después del arreglo porque el caso no era exótico: un chat borrado, un
 * comprador que dice "no me llegó nada", un mensaje que no entró.
 *
 * El PDF se reusa del mensaje anterior si lo hubo; si no, se baja ahora (mismo
 * camino que la emisión). Sin PDF el mensaje sale igual y su botón cae a la
 * hoja de guía de la app, como el de una guía registrada a mano.
 */
export async function reenviarGuia(
  sessionId: string,
): Promise<{ ok: true; conPdf: boolean } | { ok: false; error: string }> {
  const { data: row, error } = await supabase.from('order_sessions')
    .select('id, store_id, agency_name, product_price, advance_amount, payment_verification, saldo_verification, '
      + 'tracking_courier, tracking_numero, tracking_codigo, tracking_ose_id, tracking_year')
    .eq('id', sessionId).maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!row) return { ok: false, error: 'pedido no encontrado' }

  const g = normalizarGuia({
    courier: row.tracking_courier, numero: row.tracking_numero,
    codigo: row.tracking_codigo, ose_id: row.tracking_ose_id, year: row.tracking_year,
  }, row.agency_name)
  if (!g.ok) return { ok: false, error: 'el pedido no tiene una guía registrada' }

  // El PDF que ya se le mandó alguna vez manda —bajarlo otra vez gastaría una
  // request del cupo para subir el mismo documento—, SALVO que sea el rótulo
  // o uno viejo sin sufijo: ahí «Reenviar» es la palanca a mano para pedir el
  // voucher otra vez (14-set-2026). Si baja, va el voucher; si no, lo de antes.
  const { data: previo } = await supabase.from('chat_messages')
    .select('media_url').eq('session_id', sessionId).eq('type', 'guia')
    .not('media_url', 'is', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  let pdfUrl: string | null = previo?.media_url ?? null
  if (pdfMejorable(pdfUrl) && g.courier === 'SHALOM' && row.tracking_ose_id && row.store_id) {
    const auth = await authShalomPro(row.store_id)
    if (auth) {
      const mejor = await descargarPdfDeGuia({
        sessionId, storeId: row.store_id, oseId: row.tracking_ose_id, numero: row.tracking_numero, auth,
        soloVoucher: !!pdfUrl,
      })
      if (mejor) pdfUrl = mejor
    }
  }

  // La clave NO se reenvía acá aunque el pedido ya no deba nada: la entrega el
  // pago (`mensajeDeClave` desde el webhook), y repetirla desde un botón la
  // convertiría en algo que se pide, no en algo que se gana pagando.
  const r = await chatMessage(sessionId, mensajeDeGuia(g.courier, g.ids, saldoOf(row)), 'all',
    { type: 'guia', media_url: pdfUrl })
  if (!r.ok) return { ok: false, error: r.error ?? 'no se pudo escribir el mensaje' }
  return { ok: true, conPdf: !!pdfUrl }
}

/**
 * Suscribe el envío al webhook del proveedor para recibir cada transición al
 * instante. Best-effort: si falla —webhook sin configurar, cupo lleno, red— el
 * barrido de pg_cron cubre igual.
 *
 * Cada courier se suscribe donde puede, y **los dos tienen contingencia** —
 * ninguno de los cuatro proveedores es oficial, así que la regla es la misma en
 * ambos: se intenta el titular y solo si NO RESPONDE se pasa al otro.
 *
 *   · **Shalom** — `POST /v1/tracking/subscriptions` con numero+codigo juntos;
 *     con solo ose_id no hay qué suscribir. Titular Shalom PE, contingencia
 *     Shalom LAT: los dos empujan a la MISMA función `shalom-webhook` y los dos
 *     rastrean la misma guía, así que suscribirla en el que esté vivo es lo que
 *     hace que un proveedor caído cueste 30 minutos de espera y no el aviso
 *     entero.
 *   · **Olva** — solo por Olva LAT, y no es una elección: Olva API Perú (el
 *     titular del rastreo) **no tiene webhook**. Durante todo el tracking de
 *     Olva la única entrada fue el barrido de 30 min. La suscripción de Olva LAT
 *     es GRATIS (no consume su cuota mensual), así que suscribir cada guía es
 *     puro upside: el pedido se entera al instante y no se paga por ello.
 */
async function suscribirWebhook(
  sessionId: string,
  g: Extract<GuiaNormalizada, { ok: true }>,
): Promise<void> {
  const { tracking_numero: numero, tracking_codigo: codigo } = g.tracking
  if (!numero) return

  if (g.courier === 'OLVA') {
    const key = await olvaLatApiKey()
    if (!key) return
    const r = await subscribeAtLat(key, numero)
    if (r.ok) {
      // Marca para que el barrido no vuelva a intentarlo guía por guía.
      await supabase.from('order_sessions')
        .update({ olva_lat_subscribed_at: new Date().toISOString() }).eq('id', sessionId)
    } else {
      await anotar({
        proveedor: 'OLVA_LAT', op: 'tracking.suscribir', sessionId,
        outcome: r.status ? (r.status >= 500 ? 'FALLO' : 'RECHAZO') : 'SIN_RESPUESTA',
        httpStatus: r.status ?? null, errorCode: r.stage,
      })
    }
    return
  }

  if (g.courier !== 'SHALOM' || !codigo) return

  const intento = async (
    quien: 'SHALOM_PE' | 'SHALOM_LAT', url: string, headers: Record<string, string>, body: unknown,
  ): Promise<boolean> => {
    const ctx = { proveedor: quien, op: 'tracking.suscribir', sessionId }
    const inicio = Date.now()
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (r.ok) return true
      await anotarRespuesta(ctx, r, Date.now() - inicio)
    } catch (e) {
      await anotarSinRespuesta(ctx, e, Date.now() - inicio)
    }
    return false
  }

  const key = await shalomApiKey()
  if (key && await intento('SHALOM_PE',
    'https://api.shalom-api-peru.com/v1/tracking/subscriptions',
    { 'X-API-Key': key }, { numero, codigo })) return

  const keyLat = await shalomLatApiKey()
  if (!keyLat) return
  await intento('SHALOM_LAT',
    `${SHALOM_LAT_BASE}/tracking/subscriptions`,
    { 'x-api-key': keyLat }, trackBody({ numero, codigo }))
}
