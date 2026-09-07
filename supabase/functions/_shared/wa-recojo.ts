// ─── Las plantillas de recojo · WhatsApp utility ────────────────────────────
//
// El riel de los recordatorios de recojo (06-set-2026). Antes era SMS; la
// cotización real de Twilio lo mató: **US$0.2476 por segmento a Perú**, unos
// S/0.92, cuando Kross gana **S/1.28 por cobro** (`fee_partner` del contrato
// con 360pay). Un solo segmento se comía el 72 % de lo que el pedido deja, y la
// cascada completa costaba cinco o seis veces eso. Una plantilla de utilidad de
// WhatsApp cuesta un orden de magnitud menos y llega al mismo teléfono.
//
// El SMS no se borró: quedó apagado (`SMS_ENABLED`, ver `sms.ts`) esperando un
// operador local con tarifa peruana. Cuando aparezca, vuelve a ser el respaldo
// para quien no tiene WhatsApp, que es la única cosa que WhatsApp no cubre.
//
// Cada marca aprueba sus propias plantillas en su WABA, así que lo que se
// guarda es el NOMBRE de cada una (`stores.wa_*_template`). Sin nombre, ese
// paso no manda WhatsApp: el chat y el push salen igual.

// Cliente propio y no el de `tracking.ts`: ese importa este módulo para mandar
// el paso 1, y un ciclo entre los dos deja el orden de inicialización a suerte.
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/** Los tres pasos de la cascada que le hablan al comprador. */
export type PasoWa = 'listo' | 'recordatorio' | 'ultimo_aviso'

const COLUMNA: Record<PasoWa, string> = {
  listo: 'wa_recojo_template',
  recordatorio: 'wa_recordatorio_template',
  ultimo_aviso: 'wa_ultimo_aviso_template',
}

/**
 * Qué variables lleva cada plantilla, en orden. Es el contrato con lo que la
 * marca aprobó en Meta: si acá dice `['name','agency','link']`, su plantilla
 * tiene que ser «{{1}}, tu pedido sigue esperándote en {{2}}… {{3}}».
 * Documentado en `08-RECORDATORIOS-RECOJO.md`.
 */
export const MAPPING: Record<PasoWa, string[]> = {
  listo: ['name', 'product', 'agency', 'link'],
  recordatorio: ['name', 'agency', 'link'],
  ultimo_aviso: ['name', 'deadline', 'link'],
}

/** Config de WhatsApp de una marca, cacheada por invocación: una corrida que
 *  avisa a treinta pedidos no debe preguntar treinta veces. */
const cache = new Map<string, Record<string, string | null>>()

async function config(storeId: string | null | undefined): Promise<Record<string, string | null>> {
  const id = String(storeId ?? '')
  if (!id) return {}
  const hit = cache.get(id)
  if (hit) return hit
  const { data } = await supabase.from('stores')
    .select('wa_enabled, wa_recojo_template, wa_recordatorio_template, wa_ultimo_aviso_template')
    .eq('id', id).maybeSingle()
  const fila = (data ?? {}) as Record<string, unknown>
  const out: Record<string, string | null> = {}
  if (fila.wa_enabled) {
    for (const col of Object.values(COLUMNA)) {
      const v = fila[col]
      out[col] = typeof v === 'string' && v.trim() ? v.trim() : null
    }
  }
  cache.set(id, out)
  return out
}

/** El nombre de la plantilla aprobada para este paso, o `null` si la marca no
 *  la configuró (o no tiene WhatsApp encendido). */
export async function plantillaDe(storeId: string | null | undefined, paso: PasoWa): Promise<string | null> {
  return (await config(storeId))[COLUMNA[paso]] ?? null
}

/**
 * Manda la plantilla del paso, si la marca la tiene. Best-effort: reusa
 * `send-wa-template` (mismo proyecto), que resuelve las variables del lado del
 * servidor —el enlace, la agencia, la fecha— y deja el registro en
 * `notifications_log` y en `api_events`. Devuelve si se intentó.
 */
export async function mandarPlantillaDeRecojo(
  sessionId: string, storeId: string | null | undefined, paso: PasoWa,
): Promise<boolean> {
  const template = await plantillaDe(storeId, paso)
  if (!template) return false
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-wa-template`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ session_id: sessionId, template, mapping: MAPPING[paso] }),
    })
    return true
  } catch (e) {
    console.error('wa-recojo: no se pudo mandar la plantilla', paso, sessionId, e)
    return false
  }
}
