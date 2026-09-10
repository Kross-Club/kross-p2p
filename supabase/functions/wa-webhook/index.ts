// ─── Quien escribe al WhatsApp de la marca recibe SU enlace ─────────────────
//
// El número de una marca solo manda avisos: la conversación vive en el chat del
// pedido. Pero decir «no respondemos» no evita que la gente escriba — escribe
// igual, porque WhatsApp es donde vive—. Lo que evita el enojo, y las denuncias
// que le bajan la calificación al número, es que reciba algo útil en vez de
// silencio: su propio enlace, una vez.
//
// Es la otra mitad de `_shared/wa-pedido.ts`. Sin esto, la plantilla del pedido
// construye un buzón donde la gente habla sola.
//
// ── Cómo se despliega ───────────────────────────────────────────────────────
//   supabase functions deploy wa-webhook --project-ref <ref> --no-verify-jwt
//   Secretos: WHATSAPP_TOKEN (ya existe), WHATSAPP_VERIFY_TOKEN (lo elige uno
//   y se teclea igual en Meta), WHATSAPP_APP_SECRET (App Dashboard → Basic).
//   En Meta: WhatsApp → Configuration → Webhook, con el campo `messages`.
//
// ── Por qué NO responde a todo ──────────────────────────────────────────────
// El mensaje del comprador abre una ventana de 24 h en la que contestarle sale
// gratis. Contestar CADA línea que escriba dentro de esa ventana no cuesta
// dinero pero se lee como un bot roto, así que se responde una vez por ventana
// (`wa_respuestas`). Quien insiste ya recibió su enlace: lo que necesita es que
// alguien lo lea en el chat, y ahí es donde está el equipo.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { baseDeLaTienda, type TiendaConDominio } from '../_shared/tienda-url.ts'
import { anotar, anotarRespuesta } from '../_shared/api-eventos.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/** Cada cuánto se le vuelve a contestar al mismo número. */
const ESPERA_H = 12

const texto = (b: string, s = 200) => new Response(b, { status: s, headers: { 'Content-Type': 'text/plain' } })

/** Comparación en tiempo constante: salir en el primer byte distinto filtra,
 *  por lo que tarda, cuántos iban bien. Misma regla que el código de acceso. */
function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let dif = 0
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return dif === 0
}

/** La firma de Meta: `sha256=<hex>` de HMAC-SHA256 sobre el cuerpo CRUDO. */
async function firmaValida(crudo: string, cabecera: string | null): Promise<boolean> {
  const secreto = Deno.env.get('WHATSAPP_APP_SECRET')?.trim()
  // Sin secreto configurado NO se acepta nada. Un webhook abierto deja que
  // cualquiera nos haga mandar mensajes con el número de la marca.
  if (!secreto) return false
  const esperado = String(cabecera ?? '').trim().replace(/^sha256=/i, '')
  if (!esperado) return false
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(crudo))
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')
  return igual(hex, esperado.toLowerCase())
}

/**
 * El pedido VIVO más reciente de ese teléfono en esa tienda.
 *
 * Se busca por los ÚLTIMOS 9 dígitos y no por el número entero: Meta manda
 * `51987654321` y el comprador escribió `987 654 321`, y los dos son el mismo
 * teléfono. Nueve es el largo de un móvil peruano, así que la cola identifica
 * sin el prefijo. Se pregunta contra `order_sessions` directo —no contra
 * `buyers`— porque hay pedidos (los de la web) que existen antes que su fila de
 * comprador, y ese es justo quien escribe sin saber dónde está su enlace.
 */
async function pedidoDe(storeId: string, phone: string) {
  const cola = phone.replace(/\D/g, '').slice(-9)
  if (cola.length !== 9) return null
  const { data } = await supabase.from('order_sessions')
    .select('token')
    .eq('store_id', storeId).eq('status', 'active').like('buyer_phone', `%${cola}`)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data ?? null
}

/** ¿Ya se le contestó hace poco? Marca y devuelve si toca contestar. */
async function tocaContestar(storeId: string, phone: string): Promise<boolean> {
  const { data } = await supabase.from('wa_respuestas')
    .select('last_at').eq('store_id', storeId).eq('phone', phone).maybeSingle()
  if (data?.last_at && Date.now() - new Date(data.last_at as string).getTime() < ESPERA_H * 3600_000) return false
  await supabase.from('wa_respuestas')
    .upsert({ store_id: storeId, phone, last_at: new Date().toISOString() }, { onConflict: 'store_id,phone' })
  return true
}

/** Un mensaje de texto libre. Va DENTRO de la ventana de 24 h que abrió el
 *  mensaje de la persona, así que no necesita plantilla. */
async function responder(phoneNumberId: string, to: string, cuerpo: string, storeId: string) {
  const token = Deno.env.get('WHATSAPP_TOKEN')
  if (!token) return
  const t0 = Date.now()
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'text',
        text: { body: cuerpo, preview_url: true },
      }),
    })
    if (!res.ok) {
      await anotarRespuesta({ proveedor: 'WHATSAPP', op: 'respuesta.enviar', storeId }, res, Date.now() - t0,
        await res.text().catch(() => ''))
    }
  } catch (e) {
    await anotar({
      proveedor: 'WHATSAPP', op: 'respuesta.enviar', outcome: 'FALLO', storeId,
      detail: String(e).slice(0, 200), duracionMs: Date.now() - t0,
    })
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // ── La verificación de Meta al dar de alta el webhook ──
  if (req.method === 'GET') {
    const esperado = Deno.env.get('WHATSAPP_VERIFY_TOKEN')?.trim()
    const recibido = url.searchParams.get('hub.verify_token')?.trim()
    if (esperado && recibido && igual(recibido, esperado)) {
      return texto(url.searchParams.get('hub.challenge') ?? '')
    }
    return texto('forbidden', 403)
  }

  if (req.method !== 'POST') return texto('method not allowed', 405)

  // El cuerpo CRUDO, porque la firma se calcula sobre esos bytes exactos:
  // volver a serializar el JSON cambia espacios y el HMAC deja de coincidir.
  const crudo = await req.text()
  if (!await firmaValida(crudo, req.headers.get('x-hub-signature-256'))) {
    return texto('bad signature', 401)
  }

  // A partir de acá SIEMPRE 200: Meta reintenta lo que no responde 2xx, y un
  // reintento en bucle por un mensaje raro es peor que perder ese mensaje.
  try {
    const cuerpo = JSON.parse(crudo) as {
      entry?: { changes?: { value?: {
        metadata?: { phone_number_id?: string }
        messages?: { from?: string; type?: string }[]
      } }[] }[]
    }
    for (const entry of cuerpo.entry ?? []) {
      for (const cambio of entry.changes ?? []) {
        const v = cambio.value
        // Solo mensajes ENTRANTES. `statuses` (entregado, leído) llega por el
        // mismo webhook y contestarle sería responderse a uno mismo.
        const mensajes = v?.messages ?? []
        const phoneNumberId = String(v?.metadata?.phone_number_id ?? '')
        if (!mensajes.length || !phoneNumberId) continue

        const { data: tienda } = await supabase.from('stores')
          .select('id, nombre, slug, wa_enabled')
          .eq('wa_phone_number_id', phoneNumberId).eq('active', true).maybeSingle()
        if (!tienda?.id || !tienda.wa_enabled) continue

        // El dominio propio (§50) para el enlace, con respaldo si falta el SQL.
        const { data: conDominio } = await supabase.from('stores')
          .select('slug, custom_domain, custom_domain_verified').eq('id', tienda.id).maybeSingle()
        const base = baseDeLaTienda((conDominio ?? tienda) as TiendaConDominio)

        for (const m of mensajes) {
          const de = String(m.from ?? '').replace(/\D/g, '')
          if (!de) continue
          if (!await tocaContestar(String(tienda.id), de)) continue
          const pedido = await pedidoDe(String(tienda.id), de)
          const cuerpoMsj = pedido?.token
            ? `Hola 👋 Este número solo envía avisos y no se lee.\n\n`
              + `Tu pedido y la conversación con nuestro equipo están acá:\n${base}/p/${pedido.token}\n\n`
              + `Ahí te respondemos.`
            : `Hola 👋 Este número solo envía avisos y no se lee.\n\n`
              + `Para ver tus pedidos y escribirnos, entra acá con tu DNI:\n${base}/acceso`
          await responder(phoneNumberId, de, cuerpoMsj, String(tienda.id))
        }
      }
    }
  } catch (e) {
    console.error('[wa-webhook] no se pudo procesar', String(e))
  }
  return texto('ok')
})
