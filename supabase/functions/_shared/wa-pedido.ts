// ─── El WhatsApp del pedido ya pagado · plantilla utility ───────────────────
//
// Al comprador no le llegaba NADA fuera de la pestaña donde compró. El único
// sitio donde vivía su enlace era esa pestaña: si la cerraba, si compró desde el
// celular de otro, o si el navegador limpió su almacenamiento, el enlace se
// perdía. Y el enlace del chat es lo que sostiene la tasa de entrega.
//
// Esta plantilla le pone una copia permanente donde ya vive.
//
// ── CUÁNDO sale: con el PRIMER PAGO cruzado, no con el pedido creado ────────
// Se dispara desde los dos rieles de cobro (`pay360-webhook` y `flow-confirm`)
// justo después del acuse, y **solo con el cobro `adelanto`** —el primero,
// pague la mitad o el total—. Nunca con el saldo ni con un `extra`: esos ya
// tienen su acuse y repetir el enlace se lee como un cobro nuevo.
//
// Va después del pago y no al crear el pedido a propósito: un pedido sin pago
// todavía puede no cruzar, y mandarle un WhatsApp de bienvenida a quien no pagó
// gasta una plantilla y promete algo que no ocurrió. Al que abandona el pago se
// le hablará con OTRA plantilla, que es otra conversación (🔮 pendiente).
//
// ⚠️ Por eso dice «recibimos tu pago» y puede decirlo: acá el cobro ya cruzó.
// No se pisa con `acuse-de-pago.ts` —ese es el mensaje DENTRO del chat, para
// quien ya está mirando—; este es el que va a buscar al que no está.
//
// ── El enlace va en el CUERPO, no en un botón ──────────────────────────────
// Un botón se toca más, pero Meta congela su URL al aprobar la plantilla: una
// plantilla con botón sirve para UNA marca y hay que volver a aprobarla si esa
// marca conecta su dominio. Como variable del cuerpo, el MISMO texto de
// plantilla sirve para todas las tiendas y el servidor le pone a cada
// comprador el dominio de SU tienda (`baseDeLaTienda`, §50).
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
 *   «Hola {{1}}, recibimos tu pago y tu pedido en {{2}} ya está en preparación.
 *    Tu número es {{3}} y el seguimiento —con la conversación con nuestro
 *    equipo— está acá: {{4}}
 *    Este número solo envía avisos y no se lee: escríbenos por ese enlace.»
 *
 * ⚠️ El `{{4}}` NO puede quedar al final del cuerpo: Meta rechaza las
 * plantillas cuya última cosa es una variable. Por eso la línea del número
 * cierra el texto.
 */
export const MAPPING_PEDIDO = ['name', 'store', 'order_id', 'link'] as const

/**
 * Manda la plantilla del pedido pagado, si la marca la tiene.
 *
 * Best-effort: lo que falle queda anotado en `api_events` por
 * `send-wa-template`, y el 2xx del webhook de cobro nunca depende de un aviso.
 */
export async function avisarPedidoPagado(sessionId: string, storeId: string | null | undefined): Promise<boolean> {
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
      body: JSON.stringify({ session_id: sessionId, template, mapping: MAPPING_PEDIDO }),
    })
    return true
  } catch (e) {
    console.error('wa-pedido: no se pudo mandar la plantilla', sessionId, e)
    return false
  }
}
