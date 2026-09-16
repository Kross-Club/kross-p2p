import { describe, expect, it } from 'vitest'
import {
  DISTRITOS_EVA, ESTADOS_EVA, armarPedidoEva, baseEva, cabeceraEva, cobroEva, cuerpoDeRotulos,
  distritoEva, esCierreSinEntregaEva, esDemoraEva, esPdf, faseDeEva, firmaEvaValida, firmarComoEva,
  fotosDeEva, leerRespuestaDeOrden, leerWebhookEva, mensajeDeErrorEva, mensajesDeEva,
  nombreDeEstadoEva, normalizarParaEva, partirDireccionLima, productoEva, rutaDePedido,
  problemaDeApiKey, rutaDePedidos, rutaDeRotulos, telefonoEva,
} from '../../supabase/functions/_shared/eva.ts'
import { GEO_PERU } from '../data/peru-geo'

// ─── Dónde vive ──────────────────────────────────────────────────────────────

describe('la base y las rutas, tal cual el manual', () => {
  it('producción por defecto; el sandbox se pisa con EVA_API_BASE', () => {
    expect(baseEva()).toBe('https://api.evacourier.pe')
    expect(baseEva({ EVA_API_BASE: 'https://api-test.evacourier.pe/' })).toBe('https://api-test.evacourier.pe')
    expect(baseEva({ EVA_API_BASE: 'basura' })).toBe('https://api.evacourier.pe')
  })
  it('las tres rutas del contrato, con la barra final que Eva exige', () => {
    const b = baseEva()
    expect(rutaDePedidos(b)).toBe('https://api.evacourier.pe/api/v1/orders/')
    expect(rutaDePedido(b, 'K8X9P2QR4M')).toBe('https://api.evacourier.pe/api/v1/orders/K8X9P2QR4M/')
    expect(rutaDeRotulos(b)).toBe('https://api.evacourier.pe/api/v1/integration/shipping-labels/')
  })
  it('la auth es «Api-Key», no «Bearer»', () => {
    expect(cabeceraEva('abc').Authorization).toBe('Api-Key abc')
  })
})

// ─── Los distritos ───────────────────────────────────────────────────────────

describe('el distrito, del INEI al nombre EXACTO de Eva', () => {
  it('son los 65 del anexo A', () => {
    expect(DISTRITOS_EVA).toHaveLength(65)
    expect(new Set(DISTRITOS_EVA).size).toBe(65)
  })

  it('«Lima» del INEI es el Cercado para Eva', () => {
    expect(distritoEva('Lima')).toBe('CERCADO DE LIMA')
    expect(distritoEva('Cercado de Lima')).toBe('CERCADO DE LIMA')
  })

  it('devuelve las tildes y la Ñ COMO EVA LAS ESCRIBE, que es lo que su API compara', () => {
    // «los nombres son sensibles a mayúsculas, tildes y espacios» (anexo A).
    expect(distritoEva('Pachacamac')).toBe('PACHACÁMAC')
    expect(distritoEva('Pachacámac')).toBe('PACHACÁMAC')
    expect(distritoEva('Mi Perú')).toBe('MI PERÚ')
    expect(distritoEva('Breña')).toBe('BREÑA')
    expect(distritoEva('Jesús María')).toBe('JESUS MARIA')
    expect(distritoEva('Rímac')).toBe('RIMAC')
    expect(distritoEva('San Martín de Porres')).toBe('SAN MARTIN DE PORRES')
  })

  it('Chosica y Lurigancho son el mismo distrito, y se manda el del padrón', () => {
    expect(distritoEva('Lurigancho')).toBe('LURIGANCHO')
    expect(distritoEva('Lurigancho-Chosica')).toBe('LURIGANCHO')
  })

  it('lo que Eva no cubre devuelve null, y eso frena la emisión', () => {
    for (const d of ['Pucusana', 'San Bartolo', 'Punta Hermosa', 'Arequipa', '', null, undefined]) {
      expect(distritoEva(d)).toBeNull()
    }
  })

  it('TODO el Callao del INEI traduce', () => {
    for (const d of GEO_PERU.Callao['Prov. Const. del Callao']) {
      expect(distritoEva(d), d).not.toBeNull()
    }
  })

  it('de Lima provincia solo se quedan fuera los tres balnearios del sur', () => {
    const sinCobertura = GEO_PERU.Lima.Lima.filter(d => distritoEva(d) === null)
    expect(sinCobertura.sort()).toEqual(['Pucusana', 'Punta Hermosa', 'San Bartolo'])
  })

  it('normalizar quita tildes de vocales y respeta la Ñ', () => {
    expect(normalizarParaEva('  Breña  Ácida ')).toBe('BREÑA ACIDA')
  })
})

describe('partir la dirección del pedido en calle + distrito', () => {
  it('la forma del checkout: la calle y el distrito al final', () => {
    expect(partirDireccionLima('Av. Larco 1234, Miraflores'))
      .toEqual({ calle: 'Av. Larco 1234', distrito: 'MIRAFLORES' })
  })

  it('una calle con comas adentro no se pierde', () => {
    expect(partirDireccionLima('Av. Larco 1234, Dpto 502, Miraflores'))
      .toEqual({ calle: 'Av. Larco 1234, Dpto 502', distrito: 'MIRAFLORES' })
  })

  it('la forma de Nominatim tras verificar por GPS: gana el PRIMER distrito, no «Lima»', () => {
    // Desde el final, «Lima» (la provincia) traduciría a CERCADO DE LIMA y se
    // llevaría por delante a Miraflores.
    expect(partirDireccionLima('Av. Larco 1234, Miraflores, Lima, Lima Metropolitana, 15074, Perú'))
      .toEqual({ calle: 'Av. Larco 1234', distrito: 'MIRAFLORES' })
  })

  it('el Cercado, en las dos formas', () => {
    expect(partirDireccionLima('Jr. Camaná 615, Lima')).toEqual({ calle: 'Jr. Camaná 615', distrito: 'CERCADO DE LIMA' })
    expect(partirDireccionLima('Jr. Camaná 615, Cercado de Lima, Lima, Perú'))
      .toEqual({ calle: 'Jr. Camaná 615', distrito: 'CERCADO DE LIMA' })
  })

  it('el Callao: Bellavista antes que «Callao», y «Callao» solo cuando va solo', () => {
    expect(partirDireccionLima('Av. Colonial 100, Bellavista, Callao, Perú'))
      .toEqual({ calle: 'Av. Colonial 100', distrito: 'BELLAVISTA' })
    expect(partirDireccionLima('Av. Sáenz Peña 200, Callao'))
      .toEqual({ calle: 'Av. Sáenz Peña 200', distrito: 'CALLAO' })
  })

  it('sin distrito reconocible es null: no se adivina a dónde mandar un motorizado', () => {
    expect(partirDireccionLima('Av. Larco 1234')).toBeNull()
    expect(partirDireccionLima('Trujillo, La Libertad')).toBeNull()
    expect(partirDireccionLima('')).toBeNull()
    expect(partirDireccionLima(null)).toBeNull()
  })

  it('si el distrito va primero, la calle es lo que sigue sin el ruido del geocoder', () => {
    expect(partirDireccionLima('San Borja, Av. Aviación 2000, Lima, 15036, Perú'))
      .toEqual({ calle: 'Av. Aviación 2000', distrito: 'SAN BORJA' })
  })
})

// ─── Teléfono, cobro, producto ───────────────────────────────────────────────

describe('el teléfono, el cobro y el producto', () => {
  it('el teléfono pierde el +51 de WhatsApp y todo lo que no es dígito', () => {
    expect(telefonoEva('+51 987 654 321')).toBe('987654321')
    expect(telefonoEva('51987654321')).toBe('987654321')
    expect(telefonoEva('987654321')).toBe('987654321')
    expect(telefonoEva('')).toBeNull()
    expect(telefonoEva('12')).toBeNull()
  })

  it('sin saldo es SOLO ENTREGAR con 0; con saldo, EFECTIVO por el saldo', () => {
    expect(cobroEva(0)).toEqual({ payment_method: 'SOLO ENTREGAR', amount: 0 })
    expect(cobroEva(-3)).toEqual({ payment_method: 'SOLO ENTREGAR', amount: 0 })
    expect(cobroEva(70)).toEqual({ payment_method: 'EFECTIVO', amount: 70 })
    expect(cobroEva(33.333)).toEqual({ payment_method: 'EFECTIVO', amount: 33.33 })
  })

  it('el producto sale de los ítems, con cantidad y pack, y cabe en 300', () => {
    expect(productoEva([{ nombre: 'Sérum', qty: 2, pack_name: '30 ml' }, { nombre: 'Café', qty: 1 }], null, null))
      .toBe('2× Sérum · 30 ml; Café')
    expect(productoEva([], 'Creatina', 'Pack x2')).toBe('Creatina · Pack x2')
    expect(productoEva(null, null, null)).toBe('Pedido')
    expect(productoEva([{ nombre: 'x'.repeat(500), qty: 1 }], null, null)).toHaveLength(300)
  })
})

// ─── El pedido armado ────────────────────────────────────────────────────────

const PEDIDO = {
  orderId: 'ORD-1789436123736',
  buyerName: 'Pedro Pérez',
  buyerPhone: '+51 987 654 321',
  address: 'Av. Larco 1234, Miraflores',
  referencia: 'Edificio azul, piso 5',
  lat: -12.0464, lng: -77.0428, verificada: true,
  saldo: 0,
  items: [{ nombre: 'Polo manga corta', qty: 1, pack_name: 'Talla M' }],
  tienda: 'Mono Shop',
}

describe('armar el pedido para Eva', () => {
  it('campo por campo del manual §5', () => {
    const r = armarPedidoEva(PEDIDO)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.body).toEqual({
      code: 'ORD-1789436123736',
      name: 'Pedro Pérez',
      phone: '987654321',
      district: 'MIRAFLORES',
      address: 'Av. Larco 1234',
      reference: 'Edificio azul, piso 5',
      gps: '-12.046400,-77.042800',
      payment_method: 'SOLO ENTREGAR',
      amount: 0,
      service_type: 1,
      product: 'Polo manga corta · Talla M',
      packages: 1,
      observations: 'Tienda: Mono Shop',
    })
  })

  it('sin GPS verificado no manda coordenadas: un pin sin verificar manda al motorizado a otra casa', () => {
    const r = armarPedidoEva({ ...PEDIDO, verificada: false })
    expect(r.ok && r.body.gps).toBeUndefined()
  })

  it('con saldo cobra en efectivo', () => {
    const r = armarPedidoEva({ ...PEDIDO, saldo: 70 })
    expect(r.ok && r.body.payment_method).toBe('EFECTIVO')
    expect(r.ok && r.body.amount).toBe(70)
  })

  it('dice QUÉ falta, con nombre: es lo que corrige el vendedor', () => {
    const r = armarPedidoEva({ ...PEDIDO, buyerPhone: '', address: 'Av. X 123, Pucusana', buyerName: ' ' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.faltan).toEqual([
      'el nombre del comprador',
      'un teléfono válido del comprador',
      'un distrito con cobertura de Eva (la dirección dice «Av. X 123, Pucusana»)',
    ])
  })

  it('no lleva llaves ni nada del emisor: la cuenta la identifica la API Key', () => {
    const r = armarPedidoEva(PEDIDO)
    if (!r.ok) throw new Error('no armó')
    expect(Object.keys(r.body).filter(k => /key|token|ruc|secret/i.test(k))).toEqual([])
  })
})

// ─── Lo que contesta ─────────────────────────────────────────────────────────

describe('leer la respuesta de Eva', () => {
  it('201 con tracking_id es la única respuesta buena', () => {
    expect(leerRespuestaDeOrden({ tracking_id: 'K8X9P2QR4M', dispatch_date: '2026-06-04' }, 201))
      .toEqual({ ok: true, trackingId: 'K8X9P2QR4M', dispatchDate: '2026-06-04' })
    expect(leerRespuestaDeOrden({}, 201)).toMatchObject({ ok: false, reintentable: false })
  })

  it('un 400 se lee campo por campo y NO es reintentable: hay un dato que corregir', () => {
    const r = leerRespuestaDeOrden({ district: ['Distrito no encontrado'] }, 400)
    expect(r).toEqual({ ok: false, mensaje: 'district: Distrito no encontrado', reintentable: false })
    expect(leerRespuestaDeOrden({ product: 'Este campo es requerido.' }, 400))
      .toMatchObject({ mensaje: 'product: Este campo es requerido.' })
  })

  it('401/403 nombran la llave; 5xx y 429 son «no se sabe» y ahí NO se reintenta a ciegas', () => {
    expect(leerRespuestaDeOrden(null, 401)).toMatchObject({ mensaje: 'Eva rechazó la API Key (401)', reintentable: false })
    expect(leerRespuestaDeOrden(null, 403)).toMatchObject({ reintentable: false })
    expect(leerRespuestaDeOrden(null, 500)).toMatchObject({ mensaje: 'Eva falló (500)', reintentable: true })
    expect(leerRespuestaDeOrden(null, 429)).toMatchObject({ reintentable: true })
  })

  it('«detail» se lee sin el nombre del campo (es como Eva explica los rótulos)', () => {
    expect(mensajeDeErrorEva({ detail: 'Ningún id_track válido para este cliente.' }, 400))
      .toBe('Ningún id_track válido para este cliente.')
  })
})

// ─── Estados → fase, demora, cierre, mensajes ────────────────────────────────

describe('los estados de Eva y qué mueven', () => {
  it('son los trece del manual §9 (más RECOJO EN RUTA del de webhooks)', () => {
    expect(ESTADOS_EVA).toHaveLength(13)
  })

  it('solo dos mueven la fase del comprador: salió, y entregó', () => {
    expect(faseDeEva('EN RUTA')).toBe('EN_TRANSITO')
    expect(faseDeEva('en ruta')).toBe('EN_TRANSITO')
    expect(faseDeEva('ENTREGADO')).toBe('ENTREGADO')
    for (const e of ['REGISTRADO', 'EN ALMACEN', 'ASIGNADO MOTORIZADO', 'PUNTO VISITADO', 'AUSENTE', 'NO ENTREGADO', 'CANCELADO']) {
      expect(faseDeEva(e), e).toBeNull()
    }
  })

  it('la demora es que pasó y no entregó; el cierre es que no va a entregar', () => {
    for (const e of ['PUNTO VISITADO', 'AUSENTE', 'REPROGRAMAR', 'INCIDENCIA']) expect(esDemoraEva(e), e).toBe(true)
    for (const e of ['NO ENTREGADO', 'DEVUELTO', 'CANCELADO']) expect(esCierreSinEntregaEva(e), e).toBe(true)
    expect(esDemoraEva('EN RUTA')).toBe(false)
    expect(esCierreSinEntregaEva('ENTREGADO')).toBe(false)
  })

  it('cada estado se lee en el panel con palabras', () => {
    expect(nombreDeEstadoEva('EN RUTA')).toBe('En ruta')
    expect(nombreDeEstadoEva('PUNTO VISITADO')).toBe('Pasó y no entregó')
    expect(nombreDeEstadoEva('ALGO NUEVO')).toBe('Algo nuevo')
    expect(nombreDeEstadoEva(null)).toBe('—')
  })

  it('al comprador solo le llega lo que le sirve; al equipo, todo lo que Eva dijo', () => {
    const ruta = mensajesDeEva('EN RUTA')
    expect(ruta.comprador).toContain('va en camino')
    expect(ruta.equipo).toContain('salió')

    const ausente = mensajesDeEva('AUSENTE', { motivo: 'Cliente ausente', comentarios: 'Timbré dos veces' })
    expect(ausente.comprador).toContain('no pudo entregar (cliente ausente)')
    expect(ausente.equipo).toContain('Destinatario ausente — Cliente ausente · Timbré dos veces')

    const entregado = mensajesDeEva('ENTREGADO', { fotos: ['https://x/foto.jpg'] })
    expect(entregado.comprador).toContain('entregado')
    expect(entregado.equipo).toContain('Confirmar la entrega en el pipeline')
    expect(entregado.equipo).toContain('https://x/foto.jpg')

    // Un cierre sin entrega NO le habla al comprador solo: lo decide la persona.
    const cierre = mensajesDeEva('NO ENTREGADO', { motivo: 'Rechazó el paquete' })
    expect(cierre.comprador).toBeNull()
    expect(cierre.equipo).toContain('Eva cerró el envío')

    // Una incidencia tampoco: Eva se comunica con el cliente, no con el comprador.
    expect(mensajesDeEva('INCIDENCIA').comprador).toBeNull()

    expect(mensajesDeEva('REGISTRADO')).toEqual({ comprador: null, equipo: null })
  })
})

// ─── El webhook ──────────────────────────────────────────────────────────────

describe('el webhook: leerlo y verificar la firma', () => {
  const PAYLOAD = {
    event: 'order.status_updated',
    timestamp: '2026-06-03T15:42:18-05:00',
    data: {
      tracking_id: 'K8X9P2QR4M', fechahora: '2026-06-03T15:42:00', estado: 'ENTREGADO', motivo: '',
      comentarios: 'Entregado al destinatario en puerta.',
      fotos: 'https://app.evacourier.pe/media/orders/x/foto1.jpg, https://app.evacourier.pe/media/orders/x/foto2.jpg',
      metodo_pago: 'EFECTIVO', importe: '85.50', coordenada_gps: '-12.0464,-77.0428',
    },
  }

  it('lee el evento con lo que hay; lo que no está es null', () => {
    const e = leerWebhookEva(PAYLOAD)
    expect(e).toMatchObject({
      event: 'order.status_updated', trackingId: 'K8X9P2QR4M', estado: 'ENTREGADO', motivo: null,
      comentarios: 'Entregado al destinatario en puerta.', gps: '-12.0464,-77.0428',
    })
    expect(e?.fotos).toHaveLength(2)
  })

  it('las fotos llegan como CSV o como lista: el manual enseña las dos', () => {
    expect(fotosDeEva('https://a/1.jpg, https://a/2.jpg')).toEqual(['https://a/1.jpg', 'https://a/2.jpg'])
    expect(fotosDeEva(['https://a/1.jpg'])).toEqual(['https://a/1.jpg'])
    expect(fotosDeEva('')).toEqual([])
    expect(fotosDeEva(null)).toEqual([])
  })

  it('un ping se reconoce por su evento', () => {
    expect(leerWebhookEva({ event: 'test.ping' })).toMatchObject({ event: 'test.ping', trackingId: null })
    expect(leerWebhookEva(null)).toBeNull()
    expect(leerWebhookEva({})).toBeNull()
  })

  it('la firma es HMAC-SHA256 hex del body CRUDO, y un espacio de más la rompe', async () => {
    const raw = JSON.stringify(PAYLOAD)
    const firma = await firmarComoEva(raw, 'secreto')
    expect(firma).toMatch(/^[0-9a-f]{64}$/)
    expect(await firmaEvaValida(raw, firma, 'secreto')).toBe(true)
    expect(await firmaEvaValida(raw, firma.toUpperCase(), 'secreto')).toBe(true)
    // Re-serializado con espacios: OTRO hash. Por eso se firma sobre los bytes.
    expect(await firmaEvaValida(JSON.stringify(PAYLOAD, null, 2), firma, 'secreto')).toBe(false)
    expect(await firmaEvaValida(raw, firma, 'otro-secreto')).toBe(false)
    expect(await firmaEvaValida(raw, null, 'secreto')).toBe(false)
    expect(await firmaEvaValida(raw, firma, '')).toBe(false)
    expect(await firmaEvaValida(raw, firma.slice(0, 63), 'secreto')).toBe(false)
  })
})

// ─── El rótulo ───────────────────────────────────────────────────────────────

describe('el rótulo', () => {
  it('el cuerpo va con ids y formato, y como mucho 50 (el límite del manual)', () => {
    expect(cuerpoDeRotulos(['A'])).toEqual({ ids: ['A'], format: 'A4' })
    expect(cuerpoDeRotulos(Array.from({ length: 80 }, (_, i) => String(i))).ids).toHaveLength(50)
  })
  it('un PDF se reconoce por content-type o por su firma; un JSON de error no pasa', () => {
    expect(esPdf('application/pdf', new Uint8Array(0))).toBe(true)
    expect(esPdf(null, new TextEncoder().encode('%PDF-1.4 …'))).toBe(true)
    expect(esPdf('application/json', new TextEncoder().encode('{"detail":"x"}'))).toBe(false)
  })
})

describe('la API Key, revisada antes de ponerla en un header', () => {
  it('una llave limpia pasa', () => {
    expect(problemaDeApiKey('k8X9p2QR4m.aBc123_-')).toBeNull()
  })
  it('el marcador «…» de un comando de ejemplo se nombra: es lo que mató la primera prueba', () => {
    // 16-set-2026: `fetch` moría con «not a valid ByteString» y sin decir cuál.
    expect(problemaDeApiKey('…')).toContain('puntos suspensivos')
    expect(problemaDeApiKey('abc…')).toContain('puntos suspensivos')
  })
  it('comillas tipográficas o rectas, espacios, saltos de línea, vacío', () => {
    expect(problemaDeApiKey('“abc”')).toContain('comillas')
    expect(problemaDeApiKey('"abc"')).toContain('comillas')
    expect(problemaDeApiKey('ab c')).toContain('espacios')
    expect(problemaDeApiKey('abc\n')).toContain('espacios')
    expect(problemaDeApiKey('')).toContain('vacía')
    expect(problemaDeApiKey(null)).toContain('vacía')
  })
  it('cualquier otro carácter fuera de ASCII se nombra por su código', () => {
    expect(problemaDeApiKey('abc\u200b')).toContain('U+200B')
    expect(problemaDeApiKey('abcñ')).toContain('U+00F1')
  })
})

describe('un rechazo largo de Eva llega entero', () => {
  it('600 caracteres: la lista de lo que falta en la cuenta no se corta antes de la cuenta bancaria', () => {
    const largo = 'Estimado cliente, falta ' + 'x'.repeat(400) + ' y una cuenta bancaria principal con CCI de 20 dígitos.'
    expect(mensajeDeErrorEva({ message: largo }, 403)).toContain('cuenta bancaria principal')
    expect(mensajeDeErrorEva({ message: 'y'.repeat(900) }, 403)).toHaveLength(600)
  })
})
