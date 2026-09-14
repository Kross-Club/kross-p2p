// ─── CATÁLOGO PÚBLICO (krossclub.app) ────────────────────────────────────────
//
// Lo que Kross vende, con foto, descripción clara y precio visible. Nació como
// el checklist de Culqi —que exigía «mínimo 5 productos»— y ese requisito murió
// con Culqi en ago-2026: ni Flow ni 360pay piden nada sobre esta web. Así que el
// catálogo tiene los ítems que existen de verdad y ni uno más; rellenarlo para
// llegar a una cifra sería publicar una oferta que no se vende.
//
// ── Un solo plan (set-2026) ──
// Había tres —Inicia S/199, Vende S/449, Escala S/899— y ahora hay uno, de
// $67/mes, que es el que cobra Stripe. La razón es §54: el alta es automática,
// y elegir entre tres planes antes de pagar es exactamente donde se cae la
// gente que iba a pagar. Los módulos y la implementación siguen: no compiten
// con el plan, se suman.
//
// El texto de cada ítem tiene que decir lo mismo que la portada
// (`src/config/propuesta.ts`): lo que se contrata es una tienda que **cobra el
// adelanto antes de despachar**, no un software de contraentrega. Por eso el
// cobro con Yape validado solo vive en el plan de entrada y no como un extra:
// es el producto, no un módulo.
//
// ⚠️ PRECIOS: son los de la lista comercial. Si cambian, se cambian aquí y se
// actualizan la home, el detalle, el carrito y el checkout a la vez. Reviselos
// antes de publicar: lo que se muestra aquí es oferta al público.
//
// Las imágenes viven en `public/catalogo/`. Son portadas vectoriales para que
// carguen siempre y no dependan de ningún host externo; se pueden reemplazar
// por fotos reales (.jpg/.webp) cambiando solo la ruta de `imagen`.
//
// Las genera `npm run build:portadas` (scripts/build-portadas.mjs) aplicando el
// manual v2.0: ink, módulos en hueso y una sola aparición de lima por portada.
// No se editan a mano — se edita el generador y se vuelven a emitir las seis.

export interface ItemCatalogo {
  /** Slug: es la URL del detalle (/catalogo/:slug) y la llave en el carrito. */
  slug: string
  nombre: string
  /** Una línea. Es lo que se lee en la tarjeta. */
  resumen: string
  /** Descripción clara del servicio: qué hace y para quién. */
  descripcion: string
  /** Qué incluye, en viñetas. */
  incluye: string[]
  /** El importe. La moneda la dice `moneda` — no todos los ítems cobran igual. */
  precio: number
  /**
   * En qué se cobra ESTE ítem.
   *
   * No es una preferencia de presentación: el plan lo cobra Stripe en dólares y
   * los servicios se facturan en soles. Escribir los dos en la misma moneda
   * significaría que el número de la web y el del cargo no coinciden — y el
   * primero que lo nota es quien acaba de pagar.
   */
  moneda: 'USD' | 'PEN'
  /** 'mes' → suscripción mensual · 'unico' → pago único. */
  periodo: 'mes' | 'unico'
  imagen: string
  categoria: 'Plan' | 'Módulo' | 'Servicio'
  /** Marca la tarjeta como recomendada en la home. */
  destacado?: boolean
  /**
   * Este ítem se contrata SOLO, pagando en la web (§54). El resto pasa por el
   * carrito, que no cobra: registra el pedido y alguien llama.
   *
   * Es la diferencia entre «comprar» y «pedir», y por eso el botón dice cosas
   * distintas. Ofrecer «Agregar al carrito» para algo que en realidad se paga
   * con tarjeta al instante sería esconder el único camino que funciona.
   */
  altaDirecta?: boolean
}

export const MONEDA = 'PEN'

export const CATALOGO: ItemCatalogo[] = [
  {
    slug: 'plan-kross',
    nombre: 'Plan Kross',
    resumen: 'Tu tienda con app propia, cobrando el adelanto por Yape.',
    descripcion:
      'Para la marca que hoy vende por WhatsApp y anota los pedidos a mano. Incluye tu ' +
      'aplicación instalable en tu propio subdominio (tumarca.krossclub.app), el checkout de ' +
      'tres pasos que le cobra a tu cliente la mitad del pedido —o el total— con Yape antes de ' +
      'que despaches, y el chat donde sigue su pedido hasta la entrega.',
    incluye: [
      'App web instalable con tu logo, colores y nombre',
      'Checkout de 3 pasos que cobra el adelanto con Yape',
      'Validación automática del pago: sin capturas ni códigos que dictar',
      'Chat del pedido con notificaciones al comprador',
      'Panel de pedidos para tu equipo',
      'Hasta 500 pedidos al mes',
    ],
    precio: 67,
    moneda: 'USD',
    periodo: 'mes',
    imagen: '/catalogo/plan-kross.svg',
    categoria: 'Plan',
    destacado: true,
    // Es el único que se paga en la web: el visitante pone dos datos, pasa por
    // Stripe y su tienda existe al volver (§54 de `setup-kross.sql`).
    altaDirecta: true,
  },
  {
    slug: 'modulo-logistica',
    nombre: 'Módulo Smart Logistics',
    resumen: 'Cobertura por distrito, motorizados y envíos a provincia.',
    descripcion:
      'Complemento de despacho para cualquier plan. Valida la dirección del comprador contra tu ' +
      'cobertura real por distrito, calcula el envío a provincia por agencia y le da al motorizado ' +
      'la ruta y el estado de cada entrega.',
    incluye: [
      'Cobertura configurable por distrito de Lima y Callao',
      'Tarifas y sedes de agencias para envíos a provincia',
      'Geolocalización de la dirección de entrega',
      'Panel de motorizados con estados de entrega',
    ],
    precio: 149,
    moneda: 'PEN',
    periodo: 'mes',
    imagen: '/catalogo/modulo-logistica.svg',
    categoria: 'Módulo',
  },
  {
    slug: 'modulo-loyalty',
    nombre: 'Módulo Loyalty',
    resumen: 'Puntos, recompra y campañas para que el cliente vuelva.',
    descripcion:
      'Complemento de retención. Convierte cada entrega en la siguiente venta: acumula puntos, ' +
      'detecta cuándo toca reponer el producto y lanza la campaña de recompra por WhatsApp sin ' +
      'que nadie tenga que acordarse.',
    incluye: [
      'Puntos canjeables por descuento en el siguiente pedido',
      'Recordatorios automáticos de reposición',
      'Campañas de recuperación de clientes inactivos',
      'Medición de valor de vida del cliente (LTV)',
    ],
    precio: 129,
    moneda: 'PEN',
    periodo: 'mes',
    imagen: '/catalogo/modulo-loyalty.svg',
    categoria: 'Módulo',
  },
  {
    slug: 'implementacion',
    nombre: 'Implementación y puesta en marcha',
    resumen: 'Dejamos tu tienda cobrando: pago único.',
    descripcion:
      'Servicio de configuración inicial, en un solo pago. Montamos tu subdominio, cargamos tu ' +
      'catálogo con fotos y precios, conectamos tu cobro con Yape, configuramos tu cobertura y ' +
      'capacitamos a tu equipo hasta que cobren y despachen su primer pedido con el sistema.',
    incluye: [
      'Configuración del subdominio y la identidad de tu marca',
      'Carga del catálogo, packs y precios',
      'Conexión del cobro con Yape y de tu cobertura de entrega',
      'Capacitación del equipo (2 sesiones)',
      'Acompañamiento los primeros 30 días',
    ],
    precio: 690,
    moneda: 'PEN',
    periodo: 'unico',
    imagen: '/catalogo/implementacion.svg',
    categoria: 'Servicio',
  },
]

export const porSlug = (slug: string): ItemCatalogo | undefined =>
  CATALOGO.find((i) => i.slug === slug)

/** Orden de la vitrina: primero los planes, luego módulos y servicios. */
export const CATALOGO_VITRINA: ItemCatalogo[] = [...CATALOGO].sort((a, b) => {
  const orden = { Plan: 0, 'Módulo': 1, Servicio: 2 } as const
  return orden[a.categoria] - orden[b.categoria]
})

/**
 * El precio como se publica: `$ 67` o `S/ 149`.
 *
 * La moneda entra por parámetro y no se asume: el plan lo cobra Stripe en
 * dólares y los servicios se facturan en soles. Un `S/` delante de un cargo en
 * dólares es una cifra que no coincide con la del estado de cuenta, y eso lo
 * descubre quien ya pagó.
 *
 * Nunca deja ver un NaN al comprador.
 */
export function precioTexto(precio: number, moneda: ItemCatalogo['moneda'] = 'PEN'): string {
  if (!Number.isFinite(precio)) return 'Consultar'
  const n = precio.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return moneda === 'USD' ? `$ ${n}` : `S/ ${n}`
}

/**
 * La letra chica del precio, según la moneda.
 *
 * El plan lo cobra Stripe en dólares: decir «IGV incluido» ahí sería inventarle
 * un impuesto peruano a un cargo que no lo lleva. Y decir el equivalente en
 * soles sería publicar un número que cambia solo con el tipo de cambio y que
 * nunca va a coincidir con el estado de cuenta.
 */
export const AVISO_DE_PRECIO: Record<ItemCatalogo['moneda'], string> = {
  USD: 'Precio en dólares. Se cobra con tarjeta.',
  PEN: 'Precio en soles, IGV incluido.',
}

export const periodoTexto = (p: ItemCatalogo['periodo']): string =>
  p === 'mes' ? '/ mes' : 'pago único'
