// ─── LIBRO DE RECLAMACIONES VIRTUAL ──────────────────────────────────────────
// Registra una Hoja de Reclamación conforme al Código de Protección y Defensa
// del Consumidor (Ley 29571) y su reglamento (D.S. 011-2011-PCM y
// modificatorias), y devuelve el número correlativo (LR-AAAA-NNNNNN).
//
// Reglas que impone la norma y que se respetan aquí:
//   · La hoja lleva número correlativo y fecha. Los pone la base (trigger).
//   · Se registran los datos del consumidor, del bien contratado y el detalle.
//   · Si el consumidor es menor de edad, van los datos de su apoderado.
//   · El consumidor recibe copia de su hoja (la web se la muestra e imprime; si
//     hay proveedor de correo configurado, además se la enviamos).
//   · El plazo de respuesta del proveedor es de 15 días hábiles.
//
// El envío de correo es OPCIONAL y no puede tumbar el registro: si el proveedor
// falla, el reclamo YA está guardado y la copia impresa sigue disponible.
// Perder el reclamo por no poder enviar un correo sería exactamente al revés.
//
// Deploy: supabase functions deploy libro-reclamaciones --project-ref ofdjghntvmrdfjhazfvz

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
const DOC_TIPOS = ['DNI', 'CE', 'PASAPORTE', 'RUC']

const clamp = (v: unknown, max: number): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const tipo = body.tipo === 'QUEJA' ? 'QUEJA' : body.tipo === 'RECLAMO' ? 'RECLAMO' : null
  const bienTipo = body.bien_tipo === 'SERVICIO' ? 'SERVICIO' : body.bien_tipo === 'PRODUCTO' ? 'PRODUCTO' : null
  const docTipo = DOC_TIPOS.includes(String(body.consumidor_doc_tipo)) ? String(body.consumidor_doc_tipo) : null

  const nombre = clamp(body.consumidor_nombre, 200)
  const docNum = String(body.consumidor_doc_num ?? '').replace(/[^0-9A-Za-z-]/g, '').slice(0, 20)
  const domicilio = clamp(body.consumidor_domicilio, 300)
  const telefono = String(body.consumidor_telefono ?? '').replace(/\D/g, '')
  const email = clamp(body.consumidor_email, 160)?.toLowerCase() ?? ''
  const detalle = clamp(body.detalle, 4000)
  const pedidoConsumidor = clamp(body.pedido_consumidor, 2000)
  const bienDesc = clamp(body.bien_desc, 500)
  const esMenor = body.es_menor === true

  // Todos estos campos son obligatorios en la Hoja de Reclamación. Aceptar una
  // hoja incompleta es exactamente el incumplimiento que la norma sanciona.
  if (!tipo) return json({ error: 'Indica si es un reclamo o una queja' }, 400)
  if (!nombre) return json({ error: 'El nombre del consumidor es obligatorio' }, 400)
  if (!docTipo || docNum.length < 6) return json({ error: 'Documento de identidad inválido' }, 400)
  if (!domicilio) return json({ error: 'El domicilio es obligatorio' }, 400)
  if (telefono.length < 6) return json({ error: 'Teléfono inválido' }, 400)
  if (!EMAIL_RE.test(email)) return json({ error: 'Correo electrónico inválido' }, 400)
  if (!bienTipo) return json({ error: 'Indica si reclamas un producto o un servicio' }, 400)
  if (!bienDesc) return json({ error: 'Describe el producto o servicio contratado' }, 400)
  if (!detalle) return json({ error: 'El detalle es obligatorio' }, 400)
  if (!pedidoConsumidor) return json({ error: 'Indica qué solicitas' }, 400)

  const apoderadoNombre = clamp(body.apoderado_nombre, 200)
  if (esMenor && !apoderadoNombre) {
    return json({ error: 'Si el consumidor es menor de edad, los datos del apoderado son obligatorios' }, 400)
  }

  const monto = Number(body.monto_reclamado)

  const { data, error } = await supabase
    .from('complaints')
    .insert({
      store_id: clamp(body.store_id, 64),
      store_nombre: clamp(body.store_nombre, 120),
      tipo,
      consumidor_nombre: nombre,
      consumidor_doc_tipo: docTipo,
      consumidor_doc_num: docNum,
      consumidor_domicilio: domicilio,
      consumidor_telefono: telefono,
      consumidor_email: email,
      es_menor: esMenor,
      apoderado_nombre: apoderadoNombre,
      apoderado_doc_num: clamp(body.apoderado_doc_num, 20),
      apoderado_contacto: clamp(body.apoderado_contacto, 200),
      bien_tipo: bienTipo,
      bien_desc: bienDesc,
      monto_reclamado: Number.isFinite(monto) && monto > 0 ? monto : null,
      pedido_ref: clamp(body.pedido_ref, 64),
      detalle,
      pedido_consumidor: pedidoConsumidor,
    })
    .select('codigo, created_at')
    .single()

  if (error) return json({ error: error.message }, 500)

  const enviada = await enviarCopia({
    codigo: data.codigo,
    fecha: data.created_at,
    tipo,
    email,
    nombre,
    bienDesc,
    detalle,
    pedidoConsumidor,
  })
  if (enviada) {
    await supabase.from('complaints').update({ copia_email_enviada: true }).eq('codigo', data.codigo)
  }

  return json({ ok: true, codigo: data.codigo, fecha: data.created_at, copia_enviada: enviada })
})

/**
 * Copia de la hoja al correo del consumidor. Devuelve si se pudo enviar.
 * Sin `RESEND_API_KEY` / `RECLAMOS_FROM` configurados es un no-op silencioso:
 * el mismo patrón del fallback de WhatsApp, que tampoco envía hasta que la
 * marca configura su número.
 */
async function enviarCopia(h: {
  codigo: string; fecha: string; tipo: string; email: string
  nombre: string; bienDesc: string; detalle: string; pedidoConsumidor: string
}): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('RECLAMOS_FROM')
  if (!key || !from) return false

  const copiaInterna = Deno.env.get('RECLAMOS_TO')
  const fecha = new Date(h.fecha).toLocaleString('es-PE', { timeZone: 'America/Lima' })
  const html = `
    <h2>Hoja de Reclamación ${escape(h.codigo)}</h2>
    <p>Hola ${escape(h.nombre)}, registramos tu ${h.tipo === 'QUEJA' ? 'queja' : 'reclamo'} el ${escape(fecha)}.</p>
    <p><b>Producto o servicio:</b> ${escape(h.bienDesc)}</p>
    <p><b>Detalle:</b><br>${escape(h.detalle).replace(/\n/g, '<br>')}</p>
    <p><b>Lo que solicitas:</b><br>${escape(h.pedidoConsumidor).replace(/\n/g, '<br>')}</p>
    <p>Responderemos en un plazo máximo de 15 días hábiles, conforme a la Ley 29571.</p>
    <p style="color:#666;font-size:12px">Conserva el código ${escape(h.codigo)} para cualquier consulta sobre este caso.</p>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: copiaInterna ? [h.email, copiaInterna] : [h.email],
        subject: `Hoja de Reclamación ${h.codigo}`,
        html,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
