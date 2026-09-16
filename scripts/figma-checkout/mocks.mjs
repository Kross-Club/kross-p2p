// Backend de mentira para renderizar el checkout real sin Supabase.
export const HERO_URL = 'https://cdn.mock/hero.svg'
export const DETALLE_URL = 'https://cdn.mock/detalle.svg'
export const LOGO_URL = 'https://cdn.mock/logo.svg'

const bottle = (x, y, s = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <rect x="34" y="0" width="22" height="26" rx="6" fill="#7C2D12"/>
    <rect x="41" y="20" width="8" height="30" rx="3" fill="#9A3412"/>
    <rect x="0" y="44" width="90" height="150" rx="26" fill="#F59E0B"/>
    <rect x="0" y="44" width="90" height="150" rx="26" fill="url(#g2)"/>
    <rect x="14" y="96" width="62" height="58" rx="10" fill="#FFF7ED"/>
    <text x="45" y="120" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="13" fill="#7C2D12">VITAMINA</text>
    <text x="45" y="141" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="22" fill="#EA580C">C</text>
  </g>`

export const HERO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 488" width="390" height="488">
  <defs>
    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF7ED"/><stop offset="1" stop-color="#FFEDD5"/></linearGradient>
    <linearGradient id="g2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
  </defs>
  <rect width="390" height="488" fill="url(#g1)"/>
  <circle cx="300" cy="140" r="120" fill="#FDBA74" opacity=".45"/>
  <circle cx="70" cy="420" r="90" fill="#FED7AA" opacity=".6"/>
  ${bottle(150, 120, 1.15)}
  <rect x="24" y="36" width="118" height="26" rx="13" fill="#EA580C"/>
  <text x="83" y="54" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="12" fill="#fff">NUEVA FÓRMULA</text>
  <text x="24" y="400" font-family="Nunito, sans-serif" font-weight="900" font-size="30" fill="#7C2D12">Sérum de Vitamina C</text>
  <text x="24" y="430" font-family="Nunito, sans-serif" font-weight="700" font-size="16" fill="#9A3412">Piel luminosa en 14 días · 30 ml</text>
  <text x="24" y="462" font-family="Nunito, sans-serif" font-weight="900" font-size="14" fill="#EA580C">★★★★★  4.9 · 1 240 opiniones</text>
</svg>`

const fila = (y, emoji, t1, t2) => `
  <rect x="24" y="${y}" width="342" height="84" rx="20" fill="#FFF7ED"/>
  <text x="48" y="${y + 52}" font-size="30">${emoji}</text>
  <text x="100" y="${y + 38}" font-family="Nunito, sans-serif" font-weight="900" font-size="16" fill="#7C2D12">${t1}</text>
  <text x="100" y="${y + 60}" font-family="Nunito, sans-serif" font-weight="600" font-size="13" fill="#9A3412">${t2}</text>`

export const DETALLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 420" width="390" height="420">
  <rect width="390" height="420" fill="#fff"/>
  <text x="24" y="52" font-family="Nunito, sans-serif" font-weight="900" font-size="22" fill="#111827">Lo que hace por tu piel</text>
  ${fila(80, '✨', 'Ilumina y empareja el tono', 'Vitamina C estabilizada al 15 %')}
  ${fila(180, '💧', 'Hidrata sin dejar grasa', 'Ácido hialurónico de bajo peso')}
  ${fila(280, '🛡️', 'Protege del daño diario', 'Antioxidantes + vitamina E')}
  <text x="195" y="400" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="800" font-size="13" fill="#6B7280">Envío a todo el Perú · Pagas con Yape</text>
</svg>`

export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <rect width="96" height="96" rx="24" fill="#2563EB"/>
  <circle cx="48" cy="48" r="26" fill="none" stroke="#fff" stroke-width="7"/>
  <circle cx="48" cy="48" r="8" fill="#fff"/>
</svg>`

export function product(S) {
  return {
    id: 'prod-1', store_id: 'store-demo', nombre: 'Sérum de Vitamina C 30 ml', precio: 110,
    images: [HERO_URL, DETALLE_URL],
    packs: [
      { nombre: '1 unidad', descripcion: 'Para probar', precio: 110 },
      { nombre: '2 unidades', descripcion: 'Pack completo', precio: 189 },
      { nombre: '3 unidades', descripcion: 'Para compartir', precio: 259 },
    ],
    permite_mitad: !!S.mitad,
    descuento_pen: S.desc ?? 0,
  }
}

export function store(S) {
  return {
    id: 'store-demo', slug: 'demo', nombre: 'Marca Demo', logo_url: LOGO_URL, logo_wide_url: null,
    color_primary: '#2563EB', color_dark: '#0F172A', wa_display_phone: '999 888 777',
    gradient_style: null, login_images: null, custom_domain: null, custom_domain_verified: false, active: true,
    flow_enabled: S.flow !== false, home_delivery_enabled: S.home !== false, courier_lima_enabled: !!S.courier,
    checkout_ab_mode: S.ab ?? 'A', meta_pixel_id: null, tiktok_pixel_id: null,
  }
}

const iso = () => new Date().toISOString()

/** La fila del pedido, armada con lo que el checkout mandó a register-buyer. */
export function rowFrom(body, S) {
  const matched = S.verification === 'MATCHED'
  const advance = Number(body.advance_amount ?? 0)
  return {
    id: 'sess-1', order_id: 'ORD-1789012345678', store_id: 'store-demo', product_id: 'prod-1', buyer_id: 'buyer-1',
    buyer_name: body.buyer_name ?? null, buyer_phone: body.buyer_phone ?? null,
    product_name: body.product_name ?? null, product_price: body.product_price ?? null, pack_name: body.pack_name ?? null,
    items: [{ nombre: body.pack_name ?? 'Tu pack', image: HERO_URL, cantidad: 1, precio: body.product_price ?? 0 }],
    status: 'active', stage: 'CONFIRMADO', seller_name: null, seller_role: null, seller_avatar: null,
    address: body.address ?? null, delivery_reference: body.delivery_reference ?? null,
    dispatch_type: body.dispatch_type ?? null, origin_store_id: 'store-demo', reparto_lima: null,
    agency_name: body.agency_name ?? null, agency_branch_id: body.agency_branch_id ?? null,
    payment_verification: S.verification, payment_matched_at: matched ? iso() : null,
    advance_amount: advance, payment_provider: body.payment_provider ?? null,
    saldo_amount: null, saldo_verification: null,
    cobros: advance > 0 ? [{
      id: 'cobro-0001', session_id: 'sess-1', tipo: 'adelanto', monto: advance,
      estado: matched ? 'MATCHED' : 'PENDING', matched_at: matched ? iso() : null,
      flow_token: body.payment_provider ? 'flow-tok-1' : null, created_at: iso(),
    }] : [],
    buyer_document: body.document_number ?? null,
    tracking_courier: null, tracking_numero: null, tracking_codigo: null, tracking_ose_id: null, tracking_phase: null,
    shalom_pickup_code: null, boleta_estado: null, boleta_url: null,
    expires_at: null, created_at: iso(),
  }
}

const wait = ms => new Promise(r => setTimeout(r, ms))

/** Instala las rutas de mentira en el contexto. `S` se lee EN VIVO: mutarlo
 *  en medio del escenario cambia lo que responde el backend. */
export async function instalarMocks(context, S) {
  await context.route(u => u.hostname === 'cdn.mock', r => {
    const p = r.request().url()
    const body = p.endsWith('hero.svg') ? HERO_SVG : p.endsWith('detalle.svg') ? DETALLE_SVG : LOGO_SVG
    return r.fulfill({ status: 200, contentType: 'image/svg+xml', body })
  })
  await context.route('**/api/geo', r => r.fulfill({ status: 404, body: '' }))
  await context.route('**/api/manifest', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await context.route(u => u.hostname === 'mock.supabase.local', async r => {
    const req = r.request()
    const url = new URL(req.url())
    const path = url.pathname
    const json = (obj, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) })
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
    if (path.startsWith('/rest/v1/products')) return json(product(S))
    if (path.startsWith('/rest/v1/stores')) return json(store(S))
    if (path.endsWith('/dni-lookup')) {
      const body = req.postDataJSON?.() ?? {}
      await wait(S.dniDelay ?? 0)
      if (S.dniFound === false || body.document_number === '99999999') return json({})
      return json({ nombre: 'MARIA FERNANDA QUISPE ROJAS' })
    }
    if (path.endsWith('/save-checkout-draft')) return json({ ok: true })
    if (path.endsWith('/register-buyer')) {
      const body = req.postDataJSON?.() ?? {}
      S.registerBody = body
      await wait(S.registerDelay ?? 0)
      if (S.registerFail) return json({ error: 'boom' }, 500)
      S.row = rowFrom(body, S)
      return json({ id: 'sess-1', order_id: 'ORD-1789012345678', token: 'tok-demo-1', session_id: 'sess-1',
        payment_provider: body.payment_provider ?? null })
    }
    if (path.endsWith('/flow-order')) {
      await wait(S.flowDelay ?? 0)
      if (S.flowFail) return json({ ok: false, stage: 'order', code: 'flow_error' })
      const amount = Number(S.registerBody?.advance_amount ?? 0)
      return json({ ok: true, pay_url: 'https://www.flow.cl/app/web/pay.php?token=abc123', amount_pen: amount,
        ...(S.flowDeeplink === false ? {} : { yape_deeplink: 'https://www.yape.com.pe/deeplink/pay?token=abc123' }) })
    }
    if (path.endsWith('/get-session')) {
      if (S.row) S.row = { ...S.row, ...rowFrom(S.registerBody ?? {}, S), ...(S.rowPatch ?? {}) }
      const session = S.row ?? { payment_verification: S.verification }
      return json({ session, messages: S.messages ?? [] })
    }
    if (path.endsWith('/push-subscribe') || path.endsWith('/subscribe-push')) return json({ ok: true })
    console.log('[mock] sin respuesta para', req.method(), path + url.search)
    return json({ error: 'not mocked' }, 404)
  })
}
