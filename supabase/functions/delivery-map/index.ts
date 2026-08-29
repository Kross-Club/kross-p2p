// ─── LOYALTY · Dónde se está entregando ──────────────────────────────────────
//
// Alimenta el mapa del Perú de la libreta de clientes: cuántos pedidos
// ENTREGADOS hay por distrito y cuánto facturaron, con el desglose por producto
// para el filtro.
//
// Sobre lo ENTREGADO y no sobre lo pedido, a propósito: un distrito con veinte
// pedidos y cinco entregas no es un buen distrito, es un problema de logística
// disfrazado de demanda. Es la misma definición que usa el LTV de `list-clients`.
//
// Lo que NO hace: resolver la geografía. El catálogo de sedes de Shalom y Olva
// (911 sedes con coordenadas) y el padrón de distritos viven en el front y se
// cargan diferidos; traerlos acá sería una segunda copia que se desincroniza.
// Esta función agrupa por el sitio CRUDO —la sede, o la dirección escrita— y el
// panel lo convierte en distrito con los catálogos que ya tiene.
//
// Agrupar acá y no allá sí importa: una tienda con meses de historia tiene
// miles de pedidos entregados, y son unos cientos de combinaciones
// sitio × producto. Baja la respuesta de megabytes a decenas de kilobytes.
//
// SOLO ADMIN: es la misma puerta que `list-clients`, que es la pantalla donde
// vive el mapa. No devuelve datos personales —ni nombres, ni DNI, ni teléfonos—
// pero sí la facturación de la marca por zona.
//
// Deploy: supabase functions deploy delivery-map --project-ref ofdjghntvmrdfjhazfvz

import { createClient } from 'npm:@supabase/supabase-js@2'
import { administraLaPlataforma } from '../_shared/alcance.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

/**
 * Cuántos pedidos entregados se leen como mucho.
 *
 * Se leen las filas y se agrupan en Deno en vez de hacer un GROUP BY: la
 * librería no lo expone y una función SQL exigiría una migración para una
 * pantalla. El costo es este techo — y por eso la respuesta dice `truncado`
 * cuando lo toca, en vez de presentar un total que no lo es. Cuando una marca
 * lo pase de largo, el arreglo es un RPC con GROUP BY, no subir el número.
 */
const TECHO = 20_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => ({})) as { admin_auth_id?: string; store_id?: string }
  if (!body.admin_auth_id) return json({ error: 'missing_admin' }, 400)

  const { data: me } = await supabase
    .from('sellers').select('is_admin, is_super_admin, store_id')
    .eq('auth_user_id', body.admin_auth_id).maybeSingle()
  if (!me?.is_admin) return new Response('Forbidden', { status: 403, headers: corsHeaders })

  // Un admin de tienda solo ve la suya; quien administra la plataforma puede
  // apuntar a la que entró. Nunca se confía en el `store_id` del body para un
  // admin normal. El alcance lo decide `alcance.ts` — ver por qué allá.
  const storeId = (administraLaPlataforma(me) && body.store_id) ? body.store_id : me.store_id
  if (!storeId) return json({ error: 'no_store' }, 400)

  const { data, error } = await supabase
    .from('order_sessions')
    .select('dispatch_type, agency_name, agency_branch_id, delivery_reference, address, product_id, product_name, product_price, tracking_courier')
    .eq('store_id', storeId)
    .eq('stage', 'entregado')
    .order('created_at', { ascending: false })
    .limit(TECHO)

  if (error) return json({ error: error.message }, 500)

  const filas = data ?? []

  type Grupo = {
    courier: string | null; branch_id: string | null; address: string | null
    product_id: string | null; product_name: string | null
    pedidos: number; valor: number
  }
  const grupos = new Map<string, Grupo>()

  for (const f of filas) {
    // El recojo se ubica por la SEDE, no por el `address`: el address es el
    // distrito del comprador, y un pedido de Chaclacayo que se recoge en
    // Huaycán se contaría en Chaclacayo. Misma trampa que documenta `ubicacion.ts`.
    // La sede sale de `agency_branch_id` o, en los pedidos viejos, del
    // `delivery_reference` cuando es un id numérico. Es la MISMA regla que
    // `pickupBranchIdOf` en session.ts: si acá se preguntara distinto, los
    // pedidos que el panel sabe ubicar caerían en "sin ubicar" en el mapa.
    const ref = String(f.delivery_reference ?? '')
    const branchId = f.agency_branch_id
      ? String(f.agency_branch_id)
      : /^\d+$/.test(ref) ? ref : null
    const courier = branchId
      ? String(f.tracking_courier ?? f.agency_name ?? '').toUpperCase() || null
      : null
    const address = branchId ? null : (f.address ?? null)
    if (!branchId && !address) continue

    const productId = f.product_id ?? null
    const clave = `${courier ?? ''}|${branchId ?? ''}|${address ?? ''}|${productId ?? ''}`
    const valor = Math.max(0, Number(f.product_price ?? 0) || 0)

    const ya = grupos.get(clave)
    if (ya) {
      ya.pedidos += 1
      ya.valor += valor
    } else {
      grupos.set(clave, {
        courier, branch_id: branchId, address,
        product_id: productId, product_name: f.product_name ?? null,
        pedidos: 1, valor,
      })
    }
  }

  return json({
    grupos: [...grupos.values()],
    /** Cuántos pedidos entregados entraron en el conteo. */
    entregados: filas.length,
    /** `true` = hay más historia de la que se leyó, así que el total es un piso.
     *  La pantalla tiene que decirlo en vez de presentarlo como el total. */
    truncado: filas.length >= TECHO,
  })
})
