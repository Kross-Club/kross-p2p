// ─── Avisarle al comprador fuera de la app — COMPARTIDO ─────────────────────
//
// Web Push primero; WhatsApp de respaldo (manual salvo WA_AUTO_FALLBACK=on) y
// todo anotado en `notifications_log`. Vivía inline en `seller-send-message`
// "para poder desplegar desde el editor del Dashboard, que no empaqueta
// _shared" — una razón que murió cuando los deploys pasaron al CLI. Se muda
// acá porque ahora lo usan DOS: los mensajes del equipo y el acuse de pago de
// `pay360-webhook`. (Quedan copias viejas en register-buyer, send-message y
// los tokens de llamada: migrarlas es deuda anotada, no parte de este cambio.)

import webpush from 'npm:web-push'
import { supabase } from './tracking.ts'
import { anotar, anotarRespuesta, anotarSinRespuesta } from './api-eventos.ts'
import { enviarSms, tiendaParaSms, type ResultadoSms } from './sms.ts'
import { enlaceDelPedido, smsGenerico } from './sms-texto.ts'

// WhatsApp es no-op hasta que la tienda tenga wa_enabled + wa_phone_number_id
// y exista el secret global WHATSAPP_TOKEN.
const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_MAILTO') ?? 'mailto:equipo@kross.club'
if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

async function trySendPush(sub: unknown, payload: object): Promise<boolean> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false
  try { await webpush.sendNotification(sub as any, JSON.stringify(payload)); return true } catch { return false }
}

/** El push que falla se anota UNA vez por aviso, no una por suscripción: un
 *  comprador con tres dispositivos daría tres renglones del mismo problema.
 *  Y solo cuando fallaron TODAS — una suscripción muerta (el navegador que
 *  desinstaló la app) es normal y no es una caída de nadie. */
async function anotarPushCaido(n: { sessionId: string; storeId?: string | null }, intentos: number) {
  await anotar({
    proveedor: 'WEB_PUSH', op: 'aviso.enviar', outcome: 'FALLO',
    storeId: n.storeId ?? null, sessionId: n.sessionId,
    detail: `ninguna de las ${intentos} suscripciones aceptó el aviso`,
  })
}

async function sendWhatsApp(storeId: string | null | undefined, to: string | null, template: string, var1: string, var2: string, var3: string): Promise<{ result: string; error?: string }> {
  const token = Deno.env.get('WHATSAPP_TOKEN')
  if (!token || !storeId || !to) return { result: 'skipped' }
  const { data: store } = await supabase.from('stores').select('wa_enabled, wa_phone_number_id, nombre').eq('id', storeId).maybeSingle()
  if (!store?.wa_enabled || !store?.wa_phone_number_id) return { result: 'skipped' }
  let num = (to || '').replace(/\D/g, '')
  if (num.length === 9) num = `51${num}`
  if (!num) return { result: 'skipped' }
  const lang = Deno.env.get('WHATSAPP_TEMPLATE_LANG') ?? 'es'
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${store.wa_phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: num, type: 'template',
        template: { name: template, language: { code: lang }, components: [{ type: 'body', parameters: [
          { type: 'text', text: (var1 || 'Hola').slice(0, 60) },       // {{1}} = nombre del comprador
          { type: 'text', text: (var2 || 'tu pedido').slice(0, 80) },  // {{2}} = producto
          { type: 'text', text: (var3 || '').slice(0, 300) },          // {{3}} = link a su pedido
        ] }] },
      }),
    })
    if (res.ok) return { result: 'sent' }
    const errTxt = await res.text().catch(() => '')
    await anotarRespuesta({ proveedor: 'WHATSAPP', op: 'aviso.enviar', storeId }, res, undefined, errTxt)
    return { result: 'failed', error: `[${template}/${lang}→${num}] ${errTxt}`.slice(0, 280) }
  } catch (e) {
    await anotarSinRespuesta({ proveedor: 'WHATSAPP', op: 'aviso.enviar', storeId }, e)
    return { result: 'failed', error: String(e).slice(0, 200) }
  }
}

export interface NotifyInput {
  buyerId?: string | null; sessionId: string; storeId?: string | null
  title: string; body: string; url: string; tag: string
  type: 'message' | 'call' | 'status'; icon?: string | null; badge?: string | null
  waProduct?: string
  waName?: string; waLink?: string   // WhatsApp template vars: {{1}} name, {{2}} link
  /**
   * El riel SMS (05-set-2026, `sms.ts`). `respaldo` (default): solo si ningún
   * push llegó — el comprador sin permiso de push es justo el que lo necesita.
   * `siempre`: los hitos que valen un segmento aunque haya push (el recibo del
   * pago, la guía, la llegada a la agencia): el push se desliza y se pierde;
   * el SMS queda en la bandeja. `nunca`: avisos que no ameritan gastar.
   */
  sms?: 'siempre' | 'respaldo' | 'nunca'
  /** El texto del SMS, ya armado con `sms-texto.ts`. Sin él se arma uno
   *  genérico con la tienda, el cuerpo del push y el enlace del pedido. */
  smsBody?: string
}

export async function notifyBuyer(n: NotifyInput): Promise<void> {
  let subs: { subscription: unknown }[] = []
  if (n.buyerId) {
    const { data } = await supabase.from('push_subscriptions').select('subscription').eq('buyer_id', n.buyerId).eq('sub_role', 'buyer')
    subs = data ?? []
  }
  if (subs.length === 0) {
    const { data } = await supabase.from('push_subscriptions').select('subscription').eq('session_id', n.sessionId).eq('sub_role', 'buyer')
    subs = data ?? []
  }

  let pushOk = 0
  if (subs.length > 0) {
    const payload = { title: n.title, body: n.body, url: n.url, tag: n.tag, type: n.type, icon: n.icon ?? undefined, badge: n.badge ?? undefined }
    const results = await Promise.all(subs.map(s => trySendPush(s.subscription, payload)))
    pushOk = results.filter(Boolean).length
    if (pushOk === 0) await anotarPushCaido(n, subs.length)
  }

  // ─── SMS: el aviso de quien no tiene push ni volverá al chat ─────────────
  // Va ANTES que WhatsApp y no lo reemplaza: WhatsApp sigue siendo manual (o
  // automático con WA_AUTO_FALLBACK) y cuesta más; el SMS es el riel de avisos.
  let sms: ResultadoSms | 'not_needed' | 'throttled' = 'not_needed'
  let smsError: string | undefined
  const modoSms = n.sms ?? 'respaldo'
  if (modoSms !== 'nunca' && (modoSms === 'siempre' || pushOk === 0)) {
    let allowed = true
    // Los mensajes del equipo van y vienen: uno cada diez minutos por pedido,
    // como WhatsApp. Los hitos (`siempre`) no se estrangulan: cada uno es único.
    if (modoSms !== 'siempre' && n.type === 'message') {
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const { data: recent } = await supabase.from('notifications_log')
        .select('id').eq('session_id', n.sessionId).eq('sms', 'sent').gte('created_at', since).limit(1)
      if (recent && recent.length > 0) allowed = false
    }
    if (!allowed) {
      sms = 'throttled'
    } else {
      const phone = await telefonoDelComprador(n)
      const tienda = await tiendaParaSms(n.storeId)
      const body = n.smsBody ?? smsGenerico({
        tienda: tienda.nombre, cuerpo: n.body,
        link: n.url.startsWith('/p/') ? enlaceDelPedido(tienda.slug, n.url.slice(3)) : null,
      })
      const r = await enviarSms({ storeId: n.storeId, sessionId: n.sessionId }, phone, body)
      sms = r.result
      smsError = r.error
    }
  }

  let whatsapp = 'not_needed'
  let waError: string | undefined
  // WhatsApp fallback is now MANUAL (the seller sends templates from the order).
  // The automatic path stays here but off unless WA_AUTO_FALLBACK=on.
  if (pushOk === 0 && Deno.env.get('WA_AUTO_FALLBACK') === 'on') {
    let allowed = true
    if (n.type === 'message') {
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const { data: recent } = await supabase.from('notifications_log')
        .select('id').eq('session_id', n.sessionId).eq('whatsapp', 'sent').gte('created_at', since).limit(1)
      if (recent && recent.length > 0) allowed = false
    }
    if (!allowed) {
      whatsapp = 'throttled'
    } else {
      const template = n.type === 'call'
        ? (Deno.env.get('WHATSAPP_TEMPLATE_CALL') ?? Deno.env.get('WHATSAPP_TEMPLATE') ?? 'pedido_novedad')
        : (Deno.env.get('WHATSAPP_TEMPLATE') ?? 'pedido_novedad')
      let phone: string | null = null
      if (n.buyerId) { const { data: b } = await supabase.from('buyers').select('phone').eq('id', n.buyerId).maybeSingle(); phone = b?.phone ?? null }
      if (!phone) { const { data: s } = await supabase.from('order_sessions').select('buyer_phone').eq('id', n.sessionId).maybeSingle(); phone = s?.buyer_phone ?? null }
      const r = await sendWhatsApp(n.storeId, phone, template, n.waName ?? 'Hola', n.waProduct ?? 'tu pedido', n.waLink ?? 'https://krossclub.app')
      whatsapp = r.result
      waError = r.error
    }
  }

  const fila = {
    store_id: n.storeId ?? null, buyer_id: n.buyerId ?? null, session_id: n.sessionId,
    kind: n.type, push_count: pushOk, whatsapp, detail: smsError ?? waError ?? n.body.slice(0, 120),
  }
  try {
    // La columna `sms` es del §43; si el SQL no corrió todavía, la fila entra
    // igual sin ella — el registro de push y WhatsApp no depende del riel nuevo.
    const { error } = await supabase.from('notifications_log').insert({ ...fila, sms })
    if (error) await supabase.from('notifications_log').insert(fila)
  } catch { /* ignore */ }
}

async function telefonoDelComprador(n: { buyerId?: string | null; sessionId: string }): Promise<string | null> {
  if (n.buyerId) {
    const { data: b } = await supabase.from('buyers').select('phone').eq('id', n.buyerId).maybeSingle()
    if (b?.phone) return b.phone
  }
  const { data: s } = await supabase.from('order_sessions').select('buyer_phone').eq('id', n.sessionId).maybeSingle()
  return s?.buyer_phone ?? null
}
