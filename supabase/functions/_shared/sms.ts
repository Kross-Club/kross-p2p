// ─── SMS · el envío por Twilio — COMPARTIDO ─────────────────────────────────
//
// La mitad con red del riel SMS (la pura está en `sms-texto.ts`). Un solo
// remitente de Kross para todas las marcas: el texto nombra a la tienda, y eso
// es lo que separa el aviso del fraude, no el número.
//
// Config (secretos del proyecto; ninguno va al repo ni al frontend):
//   TWILIO_ACCOUNT_SID            obligatorio (AC…): va en la URL de la API
//   TWILIO_AUTH_TOKEN             la credencial de la cuenta… o, mejor,
//   TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET   una API key (SK…), que se
//                                 puede rotar sin tocar la cuenta
//   TWILIO_MESSAGING_SERVICE_SID  el remitente preferido (MG…): el Messaging
//                                 Service elige el sender por país (para Perú,
//                                 el alfanumérico "KROSS")… o, si no,
//   TWILIO_SMS_FROM               un remitente fijo (+1… o alfanumérico)
//   SMS_ENABLED=off               el interruptor de emergencia
//
// Sin `TWILIO_ACCOUNT_SID` el riel no existe: `enviarSms` devuelve
// `not_configured` y nadie se entera de nada —igual que WhatsApp sin token—.

import { supabase } from './tracking.ts'
import { anotar, anotarSinRespuesta } from './api-eventos.ts'
import { celularPeru, segmentosSms, textoSms } from './sms-texto.ts'

export type ResultadoSms = 'sent' | 'failed' | 'skipped' | 'not_configured' | 'no_phone'

interface Config {
  accountSid: string
  user: string
  pass: string
  messagingServiceSid: string | null
  from: string | null
}

function config(): Config | null {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim() ?? ''
  if (!accountSid) return null
  if ((Deno.env.get('SMS_ENABLED') ?? 'on').toLowerCase() === 'off') return null
  const keySid = Deno.env.get('TWILIO_API_KEY_SID')?.trim()
  const keySecret = Deno.env.get('TWILIO_API_KEY_SECRET')?.trim()
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim()
  const user = keySid && keySecret ? keySid : accountSid
  const pass = keySid && keySecret ? keySecret : (token ?? '')
  if (!pass) return null
  return {
    accountSid, user, pass,
    messagingServiceSid: Deno.env.get('TWILIO_MESSAGING_SERVICE_SID')?.trim() || null,
    from: Deno.env.get('TWILIO_SMS_FROM')?.trim() || null,
  }
}

/** ¿Hay riel? Para el tablero de Conexiones. */
export const smsConfigurado = (): boolean => !!config()

/**
 * El chequeo del tablero: **listar un mensaje**, que es una lectura sobre el
 * mismo recurso en el que escribimos. Gratis, y responde la pregunta que
 * importa —¿estas credenciales pueden usar la API de mensajes?— en vez de una
 * de administración de la cuenta.
 *
 * Antes preguntaba por `GET Accounts/{sid}.json` y con una API key eso podía
 * rebotar aunque el envío funcionara perfecto: el panel pintaba **Caída** un
 * riel que estaba mandando SMS (06-set-2026). Un chequeo que no ejercita la
 * capacidad de la que dependemos no sirve para nada.
 *
 * `null` = no hay llave (SIN_CONFIGURAR, que no es lo mismo que caída). Si
 * falla, queda anotado con su `KX-…`: un punto rojo sin explicación obliga a
 * adivinar, que es justo lo que §42 existe para evitar.
 */
export async function chequearTwilio(): Promise<boolean | null> {
  const c = config()
  if (!c) return null
  const url = `https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}/Messages.json?PageSize=1`
  const headers = { Authorization: `Basic ${btoa(`${c.user}:${c.pass}`)}` }
  const ctrl = new AbortController()
  const alarma = setTimeout(() => ctrl.abort(), 5000)
  const t0 = Date.now()
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal })
    if (res.ok) return true
    const txt = await res.text().catch(() => '')
    const j = safeJson(txt) as { code?: number } | null
    await anotar({
      proveedor: 'TWILIO', op: 'cuenta.chequeo',
      outcome: res.status >= 500 ? 'FALLO' : 'RECHAZO',
      httpStatus: res.status, errorCode: j?.code != null ? String(j.code) : null,
      detail: txt, providerRef: res.headers.get('twilio-request-id'), duracionMs: Date.now() - t0,
    })
    return false
  } catch (e) {
    await anotarSinRespuesta({ proveedor: 'TWILIO', op: 'cuenta.chequeo' }, e, Date.now() - t0)
    return false
  } finally {
    clearTimeout(alarma)
  }
}

/** Nombre y slug de la marca, cacheados por invocación: cada SMS los necesita
 *  y una función que manda diez avisos no debe preguntar diez veces. */
const tiendas = new Map<string, { nombre: string; slug: string | null }>()
export async function tiendaParaSms(storeId: string | null | undefined): Promise<{ nombre: string; slug: string | null }> {
  const id = String(storeId ?? '')
  if (!id) return { nombre: 'Kross', slug: null }
  const hit = tiendas.get(id)
  if (hit) return hit
  const { data } = await supabase.from('stores').select('nombre, slug').eq('id', id).maybeSingle()
  const t = { nombre: (data?.nombre as string | undefined)?.trim() || 'Kross', slug: (data?.slug as string | null | undefined) ?? null }
  tiendas.set(id, t)
  return t
}

/**
 * Manda UN SMS. Best-effort: nunca lanza, y lo que falla queda en `api_events`
 * con la referencia `KX-…` y el `Twilio-Request-Id` para reclamarle a Twilio.
 * Los envíos exitosos NO se anotan uno por uno (regla del doc 13): cuentan en
 * `notifications_log`, que es donde se cobra.
 */
export async function enviarSms(
  ctx: { storeId?: string | null; sessionId?: string | null },
  to: string | null | undefined,
  cuerpo: string,
): Promise<{ result: ResultadoSms; sid?: string; error?: string; segmentos?: number }> {
  const c = config()
  if (!c) return { result: 'not_configured' }
  const num = celularPeru(to)
  if (!num) return { result: 'no_phone' }
  const body = textoSms(cuerpo)
  if (!body) return { result: 'skipped' }

  const form = new URLSearchParams({ To: num, Body: body })
  if (c.messagingServiceSid) form.set('MessagingServiceSid', c.messagingServiceSid)
  else if (c.from) form.set('From', c.from)
  else return { result: 'not_configured', error: 'sin remitente: TWILIO_MESSAGING_SERVICE_SID o TWILIO_SMS_FROM' }

  const t0 = Date.now()
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${c.user}:${c.pass}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    const txt = await res.text().catch(() => '')
    if (res.ok) {
      const j = safeJson(txt) as { sid?: string } | null
      return { result: 'sent', sid: j?.sid, segmentos: segmentosSms(body) }
    }
    // 4xx es RECHAZO (config nuestra: cuenta de prueba con número sin
    // verificar (21608), remitente inválido (21606), país sin permiso
    // (21408)); 5xx es de ellos. El código de Twilio va aparte porque es lo
    // que su soporte pide primero.
    const j = safeJson(txt) as { code?: number; message?: string } | null
    await anotar({
      proveedor: 'TWILIO', op: 'sms.enviar', storeId: ctx.storeId ?? null, sessionId: ctx.sessionId ?? null,
      outcome: res.status >= 500 ? 'FALLO' : 'RECHAZO',
      httpStatus: res.status, errorCode: j?.code != null ? String(j.code) : null,
      detail: txt, providerRef: res.headers.get('twilio-request-id'), duracionMs: Date.now() - t0,
    })
    return { result: 'failed', error: `[${j?.code ?? res.status}→${num}] ${j?.message ?? txt}`.slice(0, 280) }
  } catch (e) {
    await anotarSinRespuesta({ proveedor: 'TWILIO', op: 'sms.enviar', storeId: ctx.storeId ?? null, sessionId: ctx.sessionId ?? null }, e, Date.now() - t0)
    return { result: 'failed', error: String(e).slice(0, 200) }
  }
}

function safeJson(raw: string): unknown {
  try { return JSON.parse(raw) } catch { return null }
}
