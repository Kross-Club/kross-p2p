// ─── CATÁLOGO PÚBLICO (krossclub.app) ────────────────────────────────────────
//
// Culqi exige que la web muestre **mínimo 5 productos o servicios**, cada uno
// con foto, descripción clara y precio visible. Kross vende software por
// suscripción, así que el catálogo son sus planes y módulos.
//
// ⚠️ PRECIOS: son los de la lista comercial. Si cambian, se cambian aquí y se
// actualizan la home, el detalle, el carrito y el checkout a la vez. Reviselos
// antes de publicar: lo que se muestra aquí es oferta al público.
//
// Las imágenes viven en `public/catalogo/`. Son portadas vectoriales para que
// carguen siempre y no dependan de ningún host externo; se pueden reemplazar
// por fotos reales (.jpg/.webp) cambiando solo la ruta de `imagen`.

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
  /** Precio en soles, IGV incluido. */
  precio: number
  /** 'mes' → suscripción mensual · 'unico' → pago único. */
  periodo: 'mes' | 'unico'
  imagen: string
  categoria: 'Plan' | 'Módulo' | 'Servicio'
  /** Marca la tarjeta como recomendada en la home. */
  destacado?: boolean
}

export const MONEDA = 'PEN'

export const CATALOGO: ItemCatalogo[] = [
  {
    slug: 'plan-inicia',
    nombre: 'Plan Inicia',
    resumen: 'Tu tienda contraentrega en línea, con app instalable propia.',
    descripcion:
      'Para la marca que hoy vende por WhatsApp y necesita ordenar sus pedidos. Incluye tu ' +
      'aplicación web instalable en tu propio subdominio (tumarca.krossclub.app), el checkout ' +
      'guiado contraentrega y el chat donde el comprador sigue su pedido hasta la entrega.',
    incluye: [
      'App web instalable con tu logo, colores y nombre',
      'Checkout contraentrega guiado (Lima y provincia)',
      'Chat de pedido con notificaciones al comprador',
      'Panel de pedidos para tu equipo',
      'Hasta 500 pedidos al mes',
    ],
    precio: 199,
    periodo: 'mes',
    imagen: '/catalogo/plan-inicia.svg',
    categoria: 'Plan',
  },
  {
    slug: 'plan-vende',
    nombre: 'Plan Vende',
    resumen: 'Todo el Plan Inicia más el cierre de ventas asistido con IA.',
    descripcion:
      'Para la marca que ya tiene tráfico y pierde pedidos por no contestar a tiempo. Suma el ' +
      'asistente de cierre con IA, las llamadas grabadas desde la propia app y la verificación ' +
      'automática del adelanto, para que el pedido llegue confirmado al motorizado.',
    incluye: [
      'Todo lo del Plan Inicia',
      'Asistente de cierre con IA sobre el chat del pedido',
      'Llamadas de voz grabadas dentro de la app',
      'Verificación automática del adelanto y del comprobante',
      'Validación de identidad por DNI',
      'Hasta 2 000 pedidos al mes',
    ],
    precio: 449,
    periodo: 'mes',
    imagen: '/catalogo/plan-vende.svg',
    categoria: 'Plan',
    destacado: true,
  },
  {
    slug: 'plan-escala',
    nombre: 'Plan Escala',
    resumen: 'Operación completa: varios agentes, CRM y campañas.',
    descripcion:
      'Para la operación con equipo de ventas. Reparte los pedidos entre varios agentes, mide a ' +
      'cada uno y activa campañas de recompra por WhatsApp sobre el historial real de tus ' +
      'compradores.',
    incluye: [
      'Todo lo del Plan Vende',
      'Equipo multi-agente con reparto automático de pedidos',
      'CRM de compradores con historial y puntaje',
      'Campañas de recompra y recuperación por WhatsApp',
      'Reportes de venta, entrega y retención',
      'Pedidos ilimitados',
    ],
    precio: 899,
    periodo: 'mes',
    imagen: '/catalogo/plan-escala.svg',
    categoria: 'Plan',
  },
  {
    slug: 'modulo-logistica',
    nombre: 'Módulo Smart Logistics',
    resumen: 'Cobertura por distrito, motorizados y envíos a provincia.',
    descripcion:
      'Complemento de logística para cualquier plan. Valida la dirección del comprador contra tu ' +
      'cobertura real por distrito, calcula el envío a provincia por agencia y le da al motorizado ' +
      'la ruta y el estado de cada entrega.',
    incluye: [
      'Cobertura configurable por distrito de Lima y Callao',
      'Tarifas y sedes de agencias para envíos a provincia',
      'Geolocalización de la dirección de entrega',
      'Panel de motorizados con estados de entrega',
    ],
    precio: 149,
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
    periodo: 'mes',
    imagen: '/catalogo/modulo-loyalty.svg',
    categoria: 'Módulo',
  },
  {
    slug: 'implementacion',
    nombre: 'Implementación y puesta en marcha',
    resumen: 'Dejamos tu marca operando: pago único.',
    descripcion:
      'Servicio de configuración inicial, en un solo pago. Montamos tu subdominio, cargamos tu ' +
      'catálogo con fotos y precios, configuramos cobertura y medios de pago, y capacitamos a tu ' +
      'equipo hasta que despachen su primer pedido con el sistema.',
    incluye: [
      'Configuración del subdominio y la identidad de tu marca',
      'Carga del catálogo, packs y precios',
      'Configuración de cobertura, agencias y medios de pago',
      'Capacitación del equipo (2 sesiones)',
      'Acompañamiento los primeros 30 días',
    ],
    precio: 690,
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

/** Precio con formato peruano: S/ 199. Nunca deja ver un NaN al comprador. */
export function precioTexto(precio: number): string {
  if (!Number.isFinite(precio)) return 'Consultar'
  return `S/ ${precio.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export const periodoTexto = (p: ItemCatalogo['periodo']): string =>
  p === 'mes' ? '/ mes' : 'pago único'
