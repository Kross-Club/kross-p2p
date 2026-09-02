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
    return { result: 'failed', error: `[${template}/${lang}→${num}] ${errTxt}`.slice(0, 280) }
  } catch (e) { return { result: 'failed', error: String(e).slice(0, 200) } }
}

export interface NotifyInput {
  buyerId?: string | null; sessionId: string; storeId?: string | null
  title: string; body: string; url: string; tag: string
  type: 'message' | 'call' | 'status'; icon?: string | null; badge?: string | null
  waProduct?: string
  waName?: string; waLink?: string   // WhatsApp template vars: {{1}} name, {{2}} link
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

  try {
    await supabase.from('notifications_log').insert({
      store_id: n.storeId ?? null, buyer_id: n.buyerId ?? null, session_id: n.sessionId,
      kind: n.type, push_count: pushOk, whatsapp, detail: waError ?? n.body.slice(0, 120),
    })
  } catch { /* ignore */ }
}
