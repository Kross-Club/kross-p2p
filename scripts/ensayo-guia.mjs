// ─── Ensayo de guía Shalom para un pedido ────────────────────────────────────
// Invoca la Edge Function `shalom-order` contra un pedido real y muestra el
// resultado en limpio. Existe porque la alternativa era un `curl` con headers
// —que en PowerShell no es curl sino Invoke-WebRequest, con otra sintaxis— y
// porque esto se va a repetir cada vez que se configure un producto nuevo.
//
// Con el interruptor de la marca APAGADO (`stores.shalom_auto_guide_enabled`)
// esto NO emite nada: arma el envío y devuelve el payload. Con el interruptor
// prendido, emite una guía REAL Y COBRABLE — el script lo avisa antes.
//
// Uso:
//   npm run guia:ensayo -- <session_id>
//
// La llave (service_role, de Project Settings → API) va por variable de
// entorno, nunca por parámetro: los argumentos quedan en el historial del
// shell y en la lista de procesos.
//   PowerShell:  $env:SUPABASE_SERVICE_ROLE_KEY="..."
//   bash/zsh:    export SUPABASE_SERVICE_ROLE_KEY="..."

const REF = process.env.SUPABASE_PROJECT_REF || 'ofdjghntvmrdfjhazfvz'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SR
const sessionId = process.argv[2]

const T = {
  ok: s => `\x1b[32m${s}\x1b[0m`,
  no: s => `\x1b[31m${s}\x1b[0m`,
  aviso: s => `\x1b[33m${s}\x1b[0m`,
  gris: s => `\x1b[90m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
}

const morir = (msg, ayuda = []) => {
  console.error(`\n${T.no('✗')} ${msg}`)
  for (const l of ayuda) console.error(T.gris(`  ${l}`))
  console.error()
  process.exit(1)
}

if (!sessionId) {
  morir('Falta el id del pedido.', [
    'npm run guia:ensayo -- 00000000-0000-0000-0000-000000000000',
    '',
    'Para encontrarlo, en el SQL Editor:',
    "  select id, buyer_name, payment_verification, shalom_order_status",
    "  from order_sessions where agency_name = 'SHALOM' order by created_at desc limit 10;",
  ])
}

if (!KEY) {
  morir('Falta la llave del servicio en el entorno (SUPABASE_SERVICE_ROLE_KEY).', [
    'Está en el dashboard: Project Settings → API → service_role.',
    '',
    'PowerShell:  $env:SUPABASE_SERVICE_ROLE_KEY="..."',
    'bash/zsh:    export SUPABASE_SERVICE_ROLE_KEY="..."',
    '',
    'No la pases como argumento: quedaría en el historial del shell.',
  ])
}

const url = `https://${REF}.supabase.co/functions/v1/shalom-order`
console.log(`\n${T.bold('Ensayo de guía')} · pedido ${sessionId}`)
console.log(T.gris(`${url}\n`))

let res, cuerpo
try {
  res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  })
  cuerpo = await res.json().catch(() => null)
} catch (e) {
  morir(`No se pudo llamar a la función: ${e.message}`, [
    'Revisa la conexión y que la función esté desplegada:',
    `  supabase functions deploy shalom-order --project-ref ${REF}`,
  ])
}

if (res.status === 401) {
  morir('La función rechazó la llave (401).', [
    'Tiene que ser la service_role, no la anon: la función solo acepta llamadas internas.',
  ])
}

if (!cuerpo) morir(`Respuesta inesperada del servidor (HTTP ${res.status}).`)

// ─── Qué pasó ────────────────────────────────────────────────────────────────

if (cuerpo.simulado) {
  const b = cuerpo.body
  const r = b.receiver ?? {}
  console.log(T.ok('✓ ENSAYO — no se emitió ninguna guía (el interruptor de la marca está apagado).'))
  console.log('\nEsto es lo que se le mandaría a Shalom:\n')
  console.log(`  Agencia de origen   ${b.origin_terminal_id}`)
  console.log(`  Agencia de destino  ${b.destiny_terminal_id}`)
  console.log(`  Producto (tamaño)   ${b.product_id}   ${T.gris('id del catálogo de ESA cuenta')}`)
  console.log(`  Declaración jurada  ${b.declaracion_jurada}`)
  console.log(`  Paga                ${b.payer}   ${T.gris('sender = la marca, al despachar')}`)
  console.log(`  Destinatario        ${r.name ? `${r.name} ${r.last_name ?? ''} ${r.sur_name ?? ''}`.trim() : `person_id ${r.id}`}`)
  console.log(`                      ${r.document_type} ${r.document} · ${r.phone}`)
  console.log(`  Clave de retiro     ${T.gris('generada; se guarda en el pedido, no se muestra acá')}`)
  console.log(`  Suscrito al webhook ${b.track === true ? 'sí' : 'no'}`)
  console.log(T.gris('\nPayload completo:'))
  console.log(T.gris(JSON.stringify(b, null, 2)))
  console.log(`\n${T.gris('Para repetir el ensayo sobre este mismo pedido hay que soltar el candado:')}`)
  console.log(T.gris(`  update order_sessions set shalom_order_status = null, shalom_order_reason = null,`))
  console.log(T.gris(`         shalom_order_at = null where id = '${sessionId}';`))
} else if (cuerpo.skipped) {
  console.log(`${T.aviso('○ NO APLICÓ')} — ${cuerpo.skipped}`)
  if (Array.isArray(cuerpo.faltan)) {
    console.log('\nFalta completar:')
    for (const f of cuerpo.faltan) console.log(`  · ${f}`)
    console.log(T.gris('\nLos del producto se completan en Panel → Productos → el producto → Envío.'))
  }
} else if (cuerpo.created) {
  console.log(T.aviso('⚠ SE EMITIÓ UNA GUÍA REAL (el interruptor está prendido).'))
  console.log(JSON.stringify(cuerpo.tracking ?? cuerpo, null, 2))
  console.log(T.gris('\nSi fue por error, se borra desde pro.shalom.pe mientras no la reciban en agencia.'))
} else {
  console.log(`${T.no('✗ La función devolvió un error')} (HTTP ${res.status}):`)
  console.log(JSON.stringify(cuerpo, null, 2))
}
console.log()
