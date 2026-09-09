// ─── Pedir el código para entrar a «Mis pedidos» ────────────────────────────
//
// Recibe un DNI y, si esa persona existe en ESTA tienda, le manda un código de
// 6 dígitos a su WhatsApp — al número YA GUARDADO en su ficha, nunca a uno que
// el visitante escriba. Ese detalle es la mitad de la seguridad: dejar elegir
// el destino convierte «demuestra que eres tú» en «dime a dónde te lo mando».
//
// ⚠️ La respuesta es SIEMPRE la misma, exista o no el DNI. Si dijera «no
// encontramos ese DNI», la pantalla se volvería un buscador de quién le compra
// a la marca: cualquiera con una lista de DNIs sabría dónde compra cada quien.
// Por eso tampoco se enseña el teléfono enmascarado acá; eso va en el perfil,
// ya adentro (`enmascararTelefono`).
//
// Lo que sí se dice es si la TIENDA puede mandar códigos, que no es un dato de
// nadie: sin plantilla aprobada el comprador esperaría un mensaje que no va a
// llegar, y prefiere saberlo antes de mirar el teléfono.

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  PEDIDOS_MAX, desdeLaVentana, esDniValido, generarCodigo, puedeMandarCodigo,
  telefonoWhatsApp, venceEn,
} from '../_shared/acceso-comprador.ts'
import { anotarRespuesta, anotarSinRespuesta } from '../_shared/api-eventos.ts'
import { hashDeCodigo } from '../_shared/sesion-comprador.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '7200',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { document_number, store_id } = await req.json().catch(() => ({})) as {
    document_number?: string; store_id?: string
  }
  if (!esDniValido(document_number) || !store_id) return json({ error: 'datos_incompletos' }, 400)

  const { data: store } = await supabase
    .from('stores').select('wa_enabled, wa_phone_number_id, wa_codigo_template')
    .eq('id', store_id).maybeSingle()
  const waToken = Deno.env.get('WHATSAPP_TOKEN') ?? ''

  // La tienda todavía no puede mandar códigos: se le dice al front, que cae al
  // acceso de siempre. Es información de la TIENDA, no de ninguna persona.
  if (!puedeMandarCodigo(store, !!waToken)) return json({ ok: true, modo: 'directo' })

  const dni = String(document_number).trim()
  const { data: buyer } = await supabase
    .from('buyers').select('id, phone').eq('store_id', store_id).eq('document_number', dni).maybeSingle()

  // A partir de acá todo camino responde IGUAL. Lo que cambia es si de verdad
  // sale un mensaje, y eso solo lo nota quien es dueño del teléfono.
  const respuesta = json({ ok: true, modo: 'codigo' })
  if (!buyer) return respuesta

  const numero = telefonoWhatsApp(buyer.phone)
  if (!numero) return respuesta

  // Tope de códigos por ventana. Cada uno cuesta un mensaje de plantilla, o
  // sea plata: es el único gasto que un desconocido puede provocarnos desde
  // afuera, y sin tope también sería una forma de acosar a alguien a mensajes.
  const { count } = await supabase
    .from('buyer_login_codes')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_id', buyer.id)
    .gte('created_at', desdeLaVentana(new Date()).toISOString())
  if ((count ?? 0) >= PEDIDOS_MAX) return respuesta

  // El código nuevo invalida los anteriores: dos códigos vivos a la vez
  // duplican las oportunidades de acertar de quien está probando.
  await supabase.from('buyer_login_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('buyer_id', buyer.id).is('used_at', null)

  // El id se genera acá para poder calcular el hash ANTES de escribir: con un
  // insert y un update, un fallo en el segundo dejaba una fila que no valida
  // ningún código y el comprador esperando un mensaje que ya no sirve.
  const id = crypto.randomUUID()
  const codigo = generarCodigo(() => crypto.getRandomValues(new Uint8Array(1))[0])
  const { error: errCodigo } = await supabase.from('buyer_login_codes').insert({
    id, buyer_id: buyer.id, store_id,
    code_hash: await hashDeCodigo(codigo, id),
    expires_at: venceEn(new Date()).toISOString(),
  })
  if (errCodigo) {
    console.error('[buyer-code-request] no se pudo guardar el código', errCodigo.message)
    return respuesta
  }

  // ── El WhatsApp ──
  // Plantilla de categoría *authentication*: Meta exige que el código viaje en
  // el cuerpo Y en el botón de copiar. Ver `00-CORE-ARCHITECTURE.md`.
  const lang = Deno.env.get('WHATSAPP_TEMPLATE_LANG') || 'es'
  const anot = { proveedor: 'WHATSAPP' as const, op: 'codigo.enviar', storeId: store_id }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${store!.wa_phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: numero, type: 'template',
        template: {
          name: String(store!.wa_codigo_template).trim(),
          language: { code: lang },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: codigo }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: codigo }] },
          ],
        },
      }),
    })
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => '')
      // ⚠️ El cuerpo del error de Meta NO lleva el código: `anotarRespuesta`
      // guarda lo que respondió el proveedor, no lo que le mandamos.
      await anotarRespuesta(anot, res, undefined, cuerpo)
    }
  } catch (e) {
    await anotarSinRespuesta(anot, e)
  }

  return respuesta
})
