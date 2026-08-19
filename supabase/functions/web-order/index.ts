// ─── WEB PÚBLICA · Pedido del carrito de krossclub.app ───────────────────────
// Registra la compra que se cierra en /pago y devuelve el código correlativo
// (KR-AAAA-NNNNNN) que el cliente cita después.
//
// Aquí NO se cobra. Cuando se habilite la pasarela, el importe a cobrar tiene
// que calcularse EN EL SERVIDOR a partir de `items`: `total_mostrado` es lo que
// dijo el navegador y un navegador puede decir lo que quiera. Se guarda solo
// para detectar si lo que vio el cliente y lo que cobramos no coinciden.
//
// Deploy: supabase functions deploy web-order --project-ref ofdjghntvmrdfjhazfvz

import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Texto recortado a `max`, o null si viene vacío. */
const clamp = (v: unknown, max: number): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}

interface ItemEntrada { slug?: unknown; nombre?: unknown; qty?: unknown; precio_unitario?: unknown; periodo?: unknown }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const tipoCliente = body.tipo_cliente === 'natural' ? 'natural' : body.tipo_cliente === 'empresa' ? 'empresa' : null
  const nombre = clamp(body.nombre, 200)
  const documento = String(body.documento ?? '').replace(/\D/g, '')
  const email = clamp(body.email, 160)?.toLowerCase() ?? ''
  const telefono = String(body.telefono ?? '').replace(/\D/g, '')

  if (!tipoCliente) return json({ error: 'tipo_cliente inválido' }, 400)
  if (!nombre) return json({ error: 'nombre requerido' }, 400)
  // El documento define el comprobante: un RUC de 8 dígitos no existe.
  if (tipoCliente === 'empresa' ? documento.length !== 11 : documento.length !== 8) {
    return json({ error: 'documento inválido' }, 400)
  }
  if (!EMAIL_RE.test(email)) return json({ error: 'email inválido' }, 400)
  if (telefono.length < 9 || telefono.length > 12) return json({ error: 'teléfono inválido' }, 400)

  // El carrito puede traer lo que quiera: se acepta solo lo que tiene forma de
  // línea de pedido, con un tope para que nadie mande un JSON de 5 MB.
  const entrada = Array.isArray(body.items) ? (body.items as ItemEntrada[]).slice(0, 30) : []
  const items = entrada.flatMap((i) => {
    const slug = clamp(i.slug, 64)
    const qty = Math.max(1, Math.min(20, Math.trunc(Number(i.qty) || 0)))
    if (!slug || !Number.isFinite(qty)) return []
    return [{
      slug,
      nombre: clamp(i.nombre, 160) ?? slug,
      qty,
      precio_unitario: Number(i.precio_unitario) || 0,
      periodo: i.periodo === 'mes' ? 'mes' : 'unico',
    }]
  })
  if (items.length === 0) return json({ error: 'El pedido no tiene items' }, 400)

  const { data, error } = await supabase
    .from('web_orders')
    .insert({
      tipo_cliente: tipoCliente,
      nombre,
      documento,
      email,
      telefono,
      nota: clamp(body.nota, 500),
      items,
      total_mostrado: Number(body.total_mostrado) || 0,
    })
    .select('codigo')
    .single()

  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, codigo: data.codigo })
})
