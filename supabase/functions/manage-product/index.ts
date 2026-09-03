import { createClient } from 'npm:@supabase/supabase-js@2'
import { isDeclaredContent, isShalomSize } from '../_shared/shalom-orders.ts'
import { administraLaPlataforma } from '../_shared/alcance.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json() as {
    action: 'save' | 'delete'
    admin_auth_id: string
    id?: string
    nombre?: string
    precio?: number
    images?: string[]
    // `image` es la foto propia del pack (opcional). El checkout cae a
    // `images[0]` cuando no está. `packs` es jsonb: no hace falta migración.
    packs?: { nombre: string; descripcion?: string; precio: number; image?: string }[]
    active?: boolean
    // Envío (sección 27.a): de qué sede Shalom sale el paquete, de qué tamaño
    // es y qué contenido se declara. Los usa el generador de guías; sin los
    // tres, el pedido no emite solo.
    shalom_origin_branch_id?: string | null
    package_size?: string | null
    declared_content?: string | null
    // Envío por Olva (sección 37.c). `declared_content` se comparte con Shalom
    // —es el mismo dato— pero el origen y el peso no: Olva identifica sus
    // agencias con un código propio y su tarifa la decide el peso, no un tamaño
    // de catálogo.
    olva_origin_agency_code?: string | null
    package_weight_kg?: number | string | null
    store_id?: string   // super admin: target store when managing a brand they entered
  }

  const { data: admin } = await supabase
    .from('sellers').select('is_admin, is_super_admin, is_operator, store_id').eq('auth_user_id', body.admin_auth_id).maybeSingle()
  if (!admin?.is_admin) return new Response('Forbidden', { status: 403, headers: corsHeaders })

  // Un admin de tienda maneja la suya; quien administra la plataforma puede
  // apuntar a cualquiera (ver `alcance.ts`).
  const targetStore = (administraLaPlataforma(admin) && body.store_id) ? body.store_id : admin.store_id

  if (body.action === 'delete') {
    if (!body.id) return new Response('Missing id', { status: 400, headers: corsHeaders })
    // Borrar lo puede quien administra, operador incluido (29-ago-2026): cargar
    // mal un producto y tener que pedirle a otro que lo borre no es una
    // salvaguarda, es una interrupción. Sigue siendo un DELETE sin papelera —
    // para sacar algo de la venta y poder volver está `active: false`.
    await supabase.from('products').delete().eq('id', body.id)
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // save (create or update)
  //
  // Los campos de envío se validan acá y no solo en el panel: son la entrada de
  // una API que emite guías cobrables. Un id de sede con letras, un tamaño que
  // no existe en el catálogo de Shalom o una declaración jurada inventada se
  // guardan como NULL —el pedido no genera guía y Logística lo hace a mano— en
  // vez de viajar al proveedor y volver 400 con el paquete ya empacado.
  const origen = String(body.shalom_origin_branch_id ?? '').trim()
  // El código de agencia de Olva LAT tiene forma de `LIM-MIR-01`: letras,
  // dígitos y guiones. No se valida contra su catálogo acá —sería una llamada
  // que consume cuota en cada guardado— sino al emitir, que es donde el
  // rechazo se puede explicar con el pedido delante.
  const origenOlva = String(body.olva_origin_agency_code ?? '').trim().toUpperCase()
  const peso = Number(body.package_weight_kg)
  const row = {
    store_id: targetStore,
    nombre: body.nombre ?? 'Producto',
    precio: body.precio ?? 0,
    images: body.images ?? [],
    packs: body.packs ?? [],
    active: body.active ?? true,
    shalom_origin_branch_id: /^\d+$/.test(origen) ? origen : null,
    package_size: isShalomSize(body.package_size) ? body.package_size : null,
    declared_content: isDeclaredContent(body.declared_content) ? body.declared_content : null,
    olva_origin_agency_code: /^[A-Z0-9][A-Z0-9-]{2,29}$/.test(origenOlva) ? origenOlva : null,
    package_weight_kg: Number.isFinite(peso) && peso > 0 && peso <= 100 ? Math.round(peso * 100) / 100 : null,
  }

  let result
  if (body.id) {
    const { data, error } = await supabase.from('products').update(row).eq('id', body.id).select('id').single()
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    result = data
  } else {
    const { data, error } = await supabase.from('products').insert(row).select('id').single()
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    result = data
  }

  return new Response(JSON.stringify({ ok: true, id: result?.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
