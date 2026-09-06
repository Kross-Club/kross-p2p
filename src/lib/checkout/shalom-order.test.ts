// ─── Generador de guías Shalom · el armado del envío ─────────────────────────
// Prueba el ÚNICO módulo puro del generador (`_shared/shalom-orders.ts`), que
// vive del lado de las Edge Functions pero no toca Deno ni red a propósito:
// emitir una guía cuesta plata y no tiene sandbox, así que lo que se puede
// verificar gratis —qué se manda, cómo se lee la respuesta— se verifica acá.
//
// Los campos son los de la doc real de POST /v1/orders, no una suposición.

import { describe, it, expect } from 'vitest'
import {
  buildOrderPayload, buscarOrdenPorDni, esPickupCodeValido, esRastreable,
  isDeclaredContent, isShalomSize, nuevoPickupCode, parseOrderResponse,
  resolveProductId, SHALOM_SIZES,
} from '../../../supabase/functions/_shared/shalom-orders.ts'
import { idsDeGuia, mensajeDeClave, mensajeDeGuia, mensajeDeOrigen } from '../../../supabase/functions/_shared/mensaje-de-guia.ts'
// El fuente del panel como texto (vite `?raw`): la última prueba compara las
// dos listas de tamaños, no el render.
import panelSource from '../../pages/vendedor/ProductosPage.tsx?raw'
import { mensajePanel } from '../panel-errors'
import { pickupBranchIdOf } from '../session'

const completo = () => ({
  originTerminalId: '404',
  destinyTerminalId: '7',
  productId: 3,
  declaredContent: 'art',
  pickupCode: '2415',
  receiver: {
    id: null,
    dni: '45678912',
    name: 'FABRICIO', lastName: 'RAMOS', surName: 'TORRES',
    phone: '987654321',
  },
})

describe('armar el envío', () => {
  it('con todo completo, arma el body de POST /v1/orders', () => {
    const r = buildOrderPayload(completo())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Los ids viajan como ENTEROS: la API los pide así y nuestro catálogo los
    // guarda como texto.
    expect(r.body.origin_terminal_id).toBe(404)
    expect(r.body.destiny_terminal_id).toBe(7)
    expect(r.body.product_id).toBe(3)
    expect(r.body.declaracion_jurada).toBe('art')
    expect(r.body.pickup_code).toBe('2415')
    expect(r.body.quantity).toBe(1)
  })

  it('paga el REMITENTE: el saldo no se cobra en el mostrador', () => {
    // `receiver` pondría a Shalom a cobrar contra entrega lo que Kross cobra
    // por la app —y la clave de recojo dejaría de ser la que suelta el pedido—.
    const r = buildOrderPayload(completo())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.body.payer).toBe('sender')
  })

  it('nace suscrita al webhook (`track`), sin gastar otra llamada', () => {
    const r = buildOrderPayload(completo())
    expect(r.ok && r.body.track).toBe(true)
  })

  it('el remitente NO viaja en el body: lo pone la cuenta autenticada', () => {
    const r = buildOrderPayload(completo())
    expect(r.ok && 'sender' in r.body).toBe(false)
  })

  it('dice TODO lo que falta de una vez, no el primer error', () => {
    const r = buildOrderPayload({
      ...completo(),
      originTerminalId: '',
      productId: null,
      declaredContent: null,
      receiver: { id: null, dni: '123', name: null, lastName: null, surName: null, phone: '' },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    // Quien lee esto está por completar un formulario: seis campos en seis
    // intentos convierte una corrección en una tarde.
    expect(r.faltan.length).toBeGreaterThanOrEqual(5)
    expect(r.faltan.join(' ')).toMatch(/origen/i)
    expect(r.faltan.join(' ')).toMatch(/tamaño/i)
    expect(r.faltan.join(' ')).toMatch(/contenido declarado/i)
    expect(r.faltan.join(' ')).toMatch(/DNI/i)
  })

  it('con person_id no hacen falta los nombres; sin él, sí', () => {
    const sinNombres = { ...completo(), receiver: { ...completo().receiver, name: null, lastName: null, surName: null } }
    expect(buildOrderPayload(sinNombres).ok).toBe(false)

    const conId = buildOrderPayload({ ...sinNombres, receiver: { ...sinNombres.receiver, id: 1234567 } })
    expect(conId.ok).toBe(true)
    if (!conId.ok) return
    const receiver = conId.body.receiver as Record<string, unknown>
    expect(receiver.id).toBe(1234567)
    // El documento va SIEMPRE, aunque mandes el id: lo pide la doc.
    expect(receiver.document).toBe('45678912')
    expect(receiver.name).toBeUndefined()
  })

  it('el celular viaja numérico y normalizado a 9 dígitos', () => {
    const r = buildOrderPayload({ ...completo(), receiver: { ...completo().receiver, phone: '+51 987 654 321' } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect((r.body.receiver as { phone: number }).phone).toBe(987654321)
  })

  it('una declaración jurada inventada no pasa', () => {
    // Shalom acepta cuatro y responde 400 con cualquier otra.
    expect(isDeclaredContent('art')).toBe(true)
    expect(isDeclaredContent('comida')).toBe(false)
    expect(buildOrderPayload({ ...completo(), declaredContent: 'comida' }).ok).toBe(false)
  })
})

describe('la clave de retiro', () => {
  it('rechaza las que Shalom rechaza: repetidas y consecutivas', () => {
    expect(esPickupCodeValido('1111')).toBe(false)
    expect(esPickupCodeValido('9999')).toBe(false)
    expect(esPickupCodeValido('1234')).toBe(false)
    expect(esPickupCodeValido('6789')).toBe(false)
    expect(esPickupCodeValido('4321')).toBe(false) // descendente: no está en la doc, no cuesta nada
    expect(esPickupCodeValido('241')).toBe(false)
    expect(esPickupCodeValido('2415')).toBe(true)
  })

  it('la generada siempre es válida, incluso con un azar hostil', () => {
    // Un rnd que empuja justo a los códigos prohibidos.
    const prohibidos = [0.1111, 0.1234, 0.9999, 0.6789, 0.2415]
    let i = 0
    const code = nuevoPickupCode(() => prohibidos[i++ % prohibidos.length])
    expect(esPickupCodeValido(code)).toBe(true)
  })

  it('mil generadas al azar, todas válidas', () => {
    for (let i = 0; i < 1000; i++) expect(esPickupCodeValido(nuevoPickupCode())).toBe(true)
  })
})

describe('resolver el producto contra el catálogo de la cuenta', () => {
  const catalogo = {
    products: [
      { id: 3, title: 'Sobre' },
      { id: 47, title: 'Caja Paquete XXS' },
      { id: 1098, title: 'Otra Medida' },
    ],
  }

  it('encuentra el id por título — los ids son POR CUENTA, no fijos', () => {
    expect(resolveProductId(catalogo, 'SOBRE')).toBe(3)
    expect(resolveProductId(catalogo, 'XXS')).toBe(47)
    expect(resolveProductId(catalogo, 'OTRA_MEDIDA')).toBe(1098)
  })

  it('si la cuenta no ofrece ese tamaño, devuelve null (y el pedido no emite)', () => {
    expect(resolveProductId(catalogo, 'L')).toBeNull()
    expect(resolveProductId(null, 'SOBRE')).toBeNull()
  })

  it('la escala es la del proveedor, no una nuestra', () => {
    expect([...SHALOM_SIZES]).toEqual(['SOBRE', 'XXS', 'XS', 'S', 'M', 'L', 'OTRA_MEDIDA'])
    expect(isShalomSize('XL')).toBe(false) // el catálogo llega hasta L
  })
})

describe('leer la guía que devuelve el proveedor', () => {
  it('lee la respuesta documentada', () => {
    const g = parseOrderResponse({ guia: '80574902', serie: 'v872', codigo: 'CJTW', ose_id: 584210 })
    expect(g.numero).toBe('80574902')
    expect(g.codigo).toBe('CJTW')
    expect(g.oseId).toBe('584210')
    expect(esRastreable(g)).toBe(true)
  })

  it('la encuentra anidada, sin casarse con la forma', () => {
    const g = parseOrderResponse({ data: { envio: { guia: '12345678', codigo: 'ab12' } } })
    expect(g.numero).toBe('12345678')
    expect(g.codigo).toBe('AB12')
  })

  it('descarta lo que NO tiene forma de guía en vez de escribirlo en el pedido', () => {
    const g = parseOrderResponse({ guia: '123', codigo: 'no-es-codigo' })
    expect(g.numero).toBeNull()
    expect(g.codigo).toBeNull()
    expect(esRastreable(g)).toBe(false)
  })

  it('una respuesta vacía o rara no revienta', () => {
    expect(esRastreable(parseOrderResponse(null))).toBe(false)
    expect(esRastreable(parseOrderResponse('no soy json'))).toBe(false)
    expect(esRastreable(parseOrderResponse([{ nada: 1 }]))).toBe(false)
  })

  // El PDF de la guía —el botón "Ver mi guía de Shalom"— también sin casarse
  // con el nombre del campo: primero cualquier URL que apunte a un .pdf, y si
  // no, una cuyo campo diga qué es (rótulo, etiqueta, comprobante).
  it('encuentra el PDF de la guía por la extensión o por el campo', () => {
    expect(parseOrderResponse({
      guia: '80574902', codigo: 'CJTW',
      data: { docs: { rotulo: 'https://cdn.shalom.pe/ordenes/80574902.pdf?t=1' } },
    }).pdfUrl).toBe('https://cdn.shalom.pe/ordenes/80574902.pdf?t=1')

    expect(parseOrderResponse({
      guia: '80574902', codigo: 'CJTW', rotulo_url: 'https://pro.shalom.pe/rotulo/584210',
    }).pdfUrl).toBe('https://pro.shalom.pe/rotulo/584210')
  })

  // Una URL suelta que ni es .pdf ni su campo dice qué es, NO se toma: mandarle
  // al comprador un botón sin saber qué abre es peor que no mandar botón.
  it('una URL cualquiera no se convierte en el botón de la guía', () => {
    expect(parseOrderResponse({
      guia: '80574902', codigo: 'CJTW', avatar: 'https://cdn.shalom.pe/logo.png',
    }).pdfUrl).toBeNull()
    expect(parseOrderResponse({ guia: '80574902', codigo: 'CJTW' }).pdfUrl).toBeNull()
  })
})

// ─── Lo que se le dice al comprador cuando su envío queda registrado ─────────
//
// La copy vive en `_shared/mensaje-de-guia.ts` porque la dicen dos: la tienda
// real (`registrarGuia`) y el demo. Y en Shalom dice tres cosas que costaban un
// reclamo cada una: que es una PRE-GUÍA que se vuelve oficial en la agencia de
// origen, dónde seguir el envío, y qué pasa con el saldo.

// Y los IDS se nombran con el vocabulario del propio courier (`idsDeGuia`): el
// voucher de Shalom dice "NRO. ORDEN" y "CÓDIGO", así que el chat, el panel y
// la hoja de guía dicen lo mismo — el comprador no traduce entre papeles. La
// CLAVE no está aquí: identifica ids ≠ entrega, y la entrega es contra el pago.

describe('idsDeGuia', () => {
  it('shalom habla como su voucher: nro. de orden y código', () => {
    expect(idsDeGuia('SHALOM', { numero: '80574902', codigo: 'CJTW' }))
      .toBe('Nro. de orden 80574902 · Código CJTW')
  })

  it('sin código no inventa uno; sin número queda la orden de servicio', () => {
    expect(idsDeGuia('SHALOM', { numero: '80574902', codigo: null })).toBe('Nro. de orden 80574902')
    expect(idsDeGuia('SHALOM', { numero: null, oseId: '990011' })).toBe('Orden de servicio 990011')
  })

  it('en olva la guía se llama guía', () => {
    expect(idsDeGuia('OLVA', { numero: '123456' })).toBe('Guía 123456')
  })
})

// El aviso de ORIGEN, palabra por palabra: lo escriben el reflejo de tracking y
// el demo. Es el momento que la tarjeta de la guía promete ("por acá te
// avisamos apenas pase") — en Shalom, la pre-guía volviéndose oficial.
describe('mensajeDeOrigen', () => {
  it('shalom: la pre-guía se volvió oficial', () => {
    expect(mensajeDeOrigen('SHALOM')).toBe(
      '🏬 ¡Tu paquete entró a la agencia de origen: tu guía de SHALOM ya es oficial! '
      + 'Por aquí te avisamos cada avance.',
    )
  })

  // Olva no tiene pre-guía que oficializar: solo la noticia.
  it('olva: solo la noticia, sin pre-guía', () => {
    expect(mensajeDeOrigen('OLVA')).toBe(
      '🏬 ¡Tu paquete entró a la agencia de origen de OLVA! Por aquí te avisamos cada avance.',
    )
  })
})

// La CLAVE DE RECOJO, palabra por palabra: la escriben el webhook (saldo
// pagado), `registrarGuia` (pagó todo) y el demo, y si alguno dijera otra frase
// el reconocimiento del hilo y la paridad del demo se romperían en silencio.
describe('mensajeDeClave', () => {
  it('la clave, el DNI y que no se comparte', () => {
    expect(mensajeDeClave('2415')).toBe(
      '🔑 Tu clave de recojo es 2415. La presentas en el mostrador junto con tu DNI '
      + 'para retirar tu paquete. No la compartas con nadie.',
    )
  })
})

describe('mensajeDeGuia', () => {
  it('shalom: pre-guía, dónde seguirla, y el saldo', () => {
    const m = mensajeDeGuia('SHALOM', 'Nro. de orden 80574902 · Código CJTW', 75)
    expect(m).toContain('Nro. de orden 80574902 · Código CJTW')
    expect(m).toContain('pre-guía')
    expect(m).toContain('agencia de origen')
    expect(m).toContain('sincronizado con tu guía')
    expect(m).not.toMatch(/\bapp\b/)
    expect(m).toContain('Tu saldo de S/75')
  })

  // A quien pagó el total no se le habla de un saldo que no existe: su clave de
  // recojo va sin condición. Misma regla que el acuse del webhook.
  it('shalom con todo pagado: la clave va sin condición', () => {
    const m = mensajeDeGuia('SHALOM', 'Nro. de orden 80574902 · Código CJTW', 0)
    expect(m).toContain('Como ya pagaste el total')
    expect(m).not.toContain('Tu saldo')
  })

  // Olva no tiene pre-guía: su copy es la de siempre, entera.
  it('olva conserva su copy de siempre', () => {
    expect(mensajeDeGuia('OLVA', 'Guía 123456', 75)).toBe(
      '📦 ¡Tu envío ya está registrado en OLVA! Guía 123456. Guárdala para el recojo. '
      + 'Tu saldo de S/75 lo pagas con Yape desde este mismo enlace de tu pedido, cuando quieras y nunca en la agencia. '
      + 'Apenas lo pagues te entregamos tu clave de recojo.'
      + ' Por aquí te avisamos cuando tu pedido llegue a tu agencia.',
    )
  })
})

describe('reconciliar tras un timeout', () => {
  // La doc es explícita: un timeout NO significa que la orden no se creó, y no
  // hay clave de idempotencia. Preguntar es lo que evita la segunda guía.
  const listado = {
    orders: [
      { id: 87654321, guia: '80574902', codigo: 'CJTW', ose_id: 584210, receiver: { document: '45678912' } },
      { id: 11111111, guia: '80574903', codigo: 'ZZZZ', receiver: { document: '11111111' } },
    ],
  }

  it('encuentra la guía ya emitida para ese DNI', () => {
    const g = buscarOrdenPorDni(listado, '45678912')
    expect(g?.numero).toBe('80574902')
    expect(g?.orderId).toBe('87654321')
  })

  it('si no está, no inventa nada (y NADIE emite una segunda)', () => {
    expect(buscarOrdenPorDni(listado, '99999999')).toBeNull()
    expect(buscarOrdenPorDni(null, '45678912')).toBeNull()
  })
})

describe('la escala de tamaños no se desincroniza', () => {
  it('el panel ofrece exactamente los tamaños que el backend acepta', () => {
    // La lista vive en dos lados a propósito —el panel no importa código de las
    // Edge Functions— y por eso se vigila: si el panel ofreciera un tamaño que
    // el backend descarta, el vendedor lo elegiría, se guardaría NULL y su
    // producto dejaría de generar guías sin que nada avise.
    const bloque = panelSource.match(/const PACKAGE_SIZES = \[([\s\S]+?)\] as const/)
    expect(bloque, 'ProductosPage debe declarar PACKAGE_SIZES').toBeTruthy()
    const enElPanel = [...bloque![1].matchAll(/\['([A-Z_]+)',/g)].map(m => m[1])
    expect(enElPanel).toEqual([...SHALOM_SIZES])
  })
})

describe('el panel dice la causa real cuando no guarda', () => {
  it('una columna que falta se traduce en "corre el esquema", no en "no se pudo"', () => {
    // Este es el caso que se vive al desplegar la PWA sin correr el SQL: el
    // panel se veía roto y el motivo estaba a un mensaje de distancia.
    const m = mensajePanel('column products.declared_content does not exist', 'No se pudo guardar.')
    expect(m).toMatch(/setup-kross\.sql/)
    expect(m).toMatch(/declared_content/)
  })

  it('un código desconocido se muestra tal cual: es un panel de admin', () => {
    expect(mensajePanel('nada_que_guardar', 'No se pudo guardar.')).toBe('nada_que_guardar')
  })

  it('sin error, cae al mensaje de siempre', () => {
    expect(mensajePanel(null, 'No se pudo guardar.')).toBe('No se pudo guardar.')
    expect(mensajePanel('  ', 'No se pudo guardar.')).toBe('No se pudo guardar.')
  })
})

describe('la sede de recojo del pedido', () => {
  it('la columna nueva manda', () => {
    expect(pickupBranchIdOf({ agency_branch_id: '216', delivery_reference: '4' })).toBe('216')
  })

  it('los pedidos viejos la traen dentro de la referencia', () => {
    // Antes de `agency_branch_id` el id viajaba ahí. Sin este respaldo, un
    // pedido anterior mostraría el distrito del comprador en vez de su agencia
    // —y el generador no sabría a dónde mandar el paquete.
    expect(pickupBranchIdOf({ delivery_reference: '216' })).toBe('216')
  })

  it('una referencia de puerta NO es una sede', () => {
    // `delivery_reference` es texto libre: ahí también caben "casa de rejas
    // verdes" y el nombre escrito a mano de una agencia sin listado (OTRO).
    expect(pickupBranchIdOf({ delivery_reference: 'Casa de rejas verdes' })).toBeNull()
    expect(pickupBranchIdOf({ delivery_reference: 'Shalom Huaycán' })).toBeNull()
    expect(pickupBranchIdOf({})).toBeNull()
  })
})
