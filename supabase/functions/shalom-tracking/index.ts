import { rastrearUno } from '../_shared/shalom-rastreo.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Proxy de tracking de Shalom, con sus DOS proveedores (02 §Los dos proveedores
// de Shalom). El router (`_shared/shalom-rastreo.ts`) intenta el titular
// —Shalom PE, `api.shalom-api-peru.com`— y, si no responde, la contingencia
// —Shalom LAT, `api.shalom-api.lat`—. Ninguno es la API oficial de Shalom: no
// existe. Por eso son dos.
//
// De Shalom PE se usa solo el "modo estado" (X-API-Key + numero/ose_id): la
// línea de tiempo del envío es todo lo que la fase canónica necesita. El "modo
// detallado" exige credenciales Shalom Pro y su primera llamada hace un login
// real contra Shalom (~90 s); el modo estado no paga esa latencia.
//
// Las keys jamás tocan el frontend ni el repo: salen de los secrets
// SHALOM_API_KEY / SHALOM_LAT_API_KEY y, si no están, del Vault del proyecto
// (RPCs `shalom_api_key` y `shalom_lat_api_key`, service role).

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = await req.json().catch(() => ({})) as
    { numero?: unknown; codigo?: unknown; ose_id?: unknown }

  // Identificadores del envío (comprobante físico / la emisión de la guía):
  //   numero = la guía (8–10 dígitos) · codigo = 4 alfanuméricos ·
  //   ose_id = id interno de Shalom (solo lo conoce Shalom PE).
  // ⚠️ Verificado contra la API real: el rastreo por guía exige numero Y codigo
  // juntos, o solo ose_id — la doc de Shalom PE dice que basta el numero, pero
  // su 400 vivo pide ambos. Shalom LAT pide los dos siempre.
  const numero = String(body.numero ?? '').replace(/\D/g, '')
  const oseId = String(body.ose_id ?? '').replace(/\D/g, '')
  const codigo = String(body.codigo ?? '').trim().toUpperCase()
  const numeroOk = /^\d{8,10}$/.test(numero)
  const codigoOk = /^[A-Z0-9]{4}$/.test(codigo)
  const oseOk = oseId.length > 0
  if ((!(numeroOk && codigoOk) && !oseOk) || (codigo !== '' && !codigoOk)) {
    return json({ ok: false, stage: 'validation' }, 400)
  }

  const lectura = await rastrearUno({
    numero: numeroOk ? numero : '',
    codigo: codigoOk ? codigo : '',
    oseId: oseOk ? oseId : '',
  })

  if (!lectura.ok) {
    const status = lectura.stage === 'not_found' ? 404
      : lectura.stage === 'rate_limit' ? 429
      : lectura.stage === 'config' ? 500 : 502
    return json({ ok: false, stage: lectura.stage }, status)
  }

  return json({
    ok: true,
    // Qué proveedor contestó. Informativo (el chat no lo muestra): sirve para
    // leer los logs cuando el titular esté caído y todo siga funcionando.
    proveedor: lectura.proveedor,
    // La fase ya resuelta en el servidor. El front la prefiere si viene, y si
    // no la deriva de `status` como siempre: la contingencia no siempre da
    // hitos, y ahí la única lectura buena es esta.
    phase: lectura.phase,
    detailed: lectura.order !== null,
    status: lectura.status,
    // Solo llega con credenciales Shalom Pro (modo detallado); hoy es null.
    order: lectura.order,
  })
})
