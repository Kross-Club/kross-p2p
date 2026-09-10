// ─── El WhatsApp del pedido recién hecho · plantilla utility ────────────────
//
// Al terminar el formulario de 3 pasos, al comprador no le llegaba NADA. El
// único sitio donde vivía su enlace era esa pestaña: si la cerraba, si compró
// desde el celular de otro, o si el navegador limpió su almacenamiento, el
// enlace se perdía. Y el enlace del chat es lo que sostiene la tasa de entrega.
//
// Esta plantilla le pone una copia permanente donde ya vive. NO es un canal:
// el número solo manda avisos y quien escribe recibe su enlace de vuelta
// (`wa-webhook`), no una conversación.
//
// ⚠️ Dice «recibimos tu pedido» y NUNCA «gracias por tu pago». El pedido se
// crea antes de que el Yape esté validado, así que agradecer un pago que
// todavía puede no cruzar es prometer algo falso — y además ya existe el acuse
// (`acuse-de-pago.ts`), que lo dice cuando de verdad pasó. Los dos mensajes no
// se pisan a propósito.
//
// Como el resto del riel: **el interruptor es la plantilla**. Sin
// `stores.wa_pedido_template` aprobado, esto es un no-op y no se rompe nada.

import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/**
 * Las variables de la plantilla, en orden. Es el contrato con lo que la marca
 * aprobó en Meta:
 *
 *   «Hola {{1}}, recibimos tu pedido en {{2}}. Tu número es {{3}}.»
 *
 * Y el enlace va en el BOTÓN de URL, no en el cuerpo: un botón se toca mucho
 * más que un enlace suelto, y es lo único que este mensaje tiene que lograr.
 */
export const MAPPING_PEDIDO = ['name', 'store', 'order_id'] as const

/**
 * Manda la plantilla del pedido nuevo, si la marca la tiene.
 *
 * Best-effort y sin esperar: quien llama está contestándole al navegador del
 * comprador, y un WhatsApp lento no puede retrasar la confirmación de su
 * pedido. Lo que falle queda anotado en `api_events` por `send-wa-template`.
 */
export async function mandarPlantillaDePedido(sessionId: string, storeId: string | null | undefined): Promise<boolean> {
  const id = String(storeId ?? '')
  if (!id || !sessionId) return false
  const { data, error } = await supabase.from('stores')
    .select('wa_enabled, wa_pedido_template').eq('id', id).maybeSingle()
  // Sin el §51 corrido la columna no existe y PostgREST devuelve un error, no
  // una fila a medias. El aviso no sale —no hay plantilla que mandar— pero se
  // DICE: un riel apagado por una migración pendiente se ve igual que un riel
  // que nadie configuró, y son dos problemas distintos.
  if (error) {
    console.error('[wa-pedido] no se pudo leer la config de la tienda:', error.message)
    return false
  }
  const fila = (data ?? {}) as Record<string, unknown>
  const template = fila.wa_enabled && typeof fila.wa_pedido_template === 'string'
    ? fila.wa_pedido_template.trim()
    : ''
  if (!template) return false
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-wa-template`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        session_id: sessionId,
        template,
        mapping: MAPPING_PEDIDO,
        // El botón de URL lleva el token: la plantilla se aprueba con la URL
        // base y Meta le pega este sufijo.
        boton_url: 'token',
      }),
    })
    return true
  } catch (e) {
    console.error('wa-pedido: no se pudo mandar la plantilla', sessionId, e)
    return false
  }
}
