// ─── Shalom · armar el pedido que EMITE la guía ──────────────────────────────
// El pendiente #3 (generador de envíos). Este módulo es a propósito PURO —sin
// Deno, sin red, sin base— por dos razones:
//
//  1. Es la única pieza cuya forma la manda un tercero. Cuando el proveedor
//     cambie un nombre de campo, se toca ESTE archivo y nada más: la función
//     que orquesta, el candado de idempotencia y los avisos no se enteran.
//  2. Se puede probar sin llamar a nadie. Emitir una guía cuesta plata y no
//     tiene sandbox; el payload, en cambio, se valida gratis en `npm test`.
//
// ⚠️ CONTRATO PROVISIONAL. `toProviderBody()` es la traducción a los nombres de
// campo de `POST /v1/orders` de Shalom API Perú. Mientras no esté verificada
// contra la doc del proveedor, `shalom-order` corre en modo SIMULADO y no
// llama a nadie (ver `stores.shalom_auto_guide_enabled`, sección 26.d).
// Lo que SÍ está verificado y no se toca al ajustar el contrato:
//   · auth: X-API-Key (plataforma) + credenciales Shalom Pro de la marca
//     (X-Shalom-Email / X-Shalom-Password), como documenta 02-SMART-LOGISTICS.
//   · la guía que devuelve se rastrea con numero (8–10 dígitos) + codigo
//     (4 alfanuméricos) juntos, o con el ose_id.

/** Escala de tamaño del proveedor. Enum CERRADO: un tamaño que la API no
 *  conoce no es un envío más caro, es un 400 con el paquete ya empacado. */
export const PACKAGE_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL'] as const
export type PackageSize = typeof PACKAGE_SIZES[number]

export const isPackageSize = (v: unknown): v is PackageSize =>
  typeof v === 'string' && (PACKAGE_SIZES as readonly string[]).includes(v)

/** Las mismas reglas con las que el tracking valida una guía real. */
export const GUIA_NUMERO = /^\d{8,10}$/
export const GUIA_CODIGO = /^[A-Z0-9]{4}$/
const DNI = /^\d{8}$/
const CELULAR = /^9\d{8}$/

/** Todo lo que hace falta para pedir una guía. Sale del pedido (destino,
 *  comprador), del producto (origen, tamaño) y de la marca (remitente). */
export interface GuideRequest {
  /** Id del pedido en Kross. Viaja como referencia externa para poder cruzar
   *  la guía con el pedido cuando alguien la busque desde el lado de Shalom. */
  orderRef: string
  /** Sede de la que SALE el paquete — configurada en el producto. */
  origenBranchId: string
  /** Sede donde el comprador RECOGE — la que eligió en el checkout. */
  destinoBranchId: string
  remitente: { nombre: string; telefono?: string | null }
  destinatario: { nombre: string; dni: string; telefono: string }
  /** `size` entra CRUDO (viene de una columna de texto) y lo valida el builder
   *  contra la escala del proveedor: quien llama no tiene que saber la lista. */
  paquete: { size: string | null | undefined; contenido: string; valorDeclarado: number }
}

/** Lo mismo, ya validado. Es lo único que ve el traductor de campos. */
interface GuideChecked extends Omit<GuideRequest, 'paquete'> {
  paquete: { size: PackageSize; contenido: string; valorDeclarado: number }
}

export type BuildResult =
  | { ok: true; body: Record<string, unknown> }
  /** `faltan` se le muestra a Logística tal cual: son los campos que hay que
   *  completar para que el pedido pueda generar su guía. */
  | { ok: false; faltan: string[] }

const limpio = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim()
const soloDigitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '')

/**
 * Valida y arma. Devuelve TODO lo que falta de una sola vez —no el primer
 * error— porque quien lo lee está por completar un formulario: decirle un
 * campo por intento convierte una corrección en cuatro.
 */
export function buildOrderPayload(r: GuideRequest): BuildResult {
  const faltan: string[] = []

  const origen = limpio(r.origenBranchId)
  const destino = limpio(r.destinoBranchId)
  const remitente = limpio(r.remitente?.nombre)
  const nombre = limpio(r.destinatario?.nombre)
  const dni = soloDigitos(r.destinatario?.dni)
  const telefono = soloDigitos(r.destinatario?.telefono).slice(-9)
  const contenido = limpio(r.paquete?.contenido)
  const valor = Number(r.paquete?.valorDeclarado)

  if (!origen) faltan.push('agencia de origen del producto')
  if (!destino) faltan.push('sede de recojo del pedido')
  if (!remitente) faltan.push('nombre de la marca (remitente)')
  if (!nombre) faltan.push('nombre del destinatario')
  if (!DNI.test(dni)) faltan.push('DNI del destinatario (8 dígitos)')
  if (!CELULAR.test(telefono)) faltan.push('celular del destinatario (9 dígitos)')
  if (!contenido) faltan.push('contenido del paquete')
  if (!isPackageSize(r.paquete?.size)) faltan.push('tamaño del paquete en el producto (XXS…XL)')
  // El valor declarado es el del seguro: 0 deja el paquete sin cobertura y un
  // valor inventado infla la tarifa. Se exige positivo y se manda el real.
  if (!Number.isFinite(valor) || valor <= 0) faltan.push('precio del producto (valor declarado)')

  if (faltan.length) return { ok: false, faltan }

  return {
    ok: true,
    body: toProviderBody({
      ...r,
      origenBranchId: origen,
      destinoBranchId: destino,
      remitente: { ...r.remitente, nombre: remitente },
      destinatario: { nombre, dni, telefono },
      paquete: { size: r.paquete.size as PackageSize, contenido, valorDeclarado: valor },
    }),
  }
}

/**
 * ⚠️ ÚNICO punto que conoce los nombres de campo del proveedor. Ajustar aquí
 * al confirmar la doc de `POST /v1/orders` — nada más en el repo depende de
 * esta forma.
 */
function toProviderBody(r: GuideChecked): Record<string, unknown> {
  return {
    sede_origen: r.origenBranchId,
    sede_destino: r.destinoBranchId,
    remitente: {
      nombre: r.remitente.nombre,
      telefono: soloDigitos(r.remitente.telefono).slice(-9) || undefined,
    },
    destinatario: {
      nombre: r.destinatario.nombre,
      documento: r.destinatario.dni,
      tipo_documento: 'DNI',
      telefono: r.destinatario.telefono,
    },
    paquete: {
      tamano: r.paquete.size,
      contenido: r.paquete.contenido,
      valor_declarado: r.paquete.valorDeclarado,
    },
    // Contra-entrega NO: el saldo se paga por la app, nunca en el mostrador
    // (02 §El saldo de agencia). Que Shalom cobre en la agencia rompería esa
    // regla y además nos dejaría la plata donde no la vemos.
    pago_contra_entrega: false,
    referencia_externa: r.orderRef,
  }
}

/** La guía tal como quedó, ya validada. */
export interface GuideResult {
  numero: string | null
  codigo: string | null
  oseId: string | null
  /** Id del pedido del lado del proveedor, para poder reclamar por él. */
  orderId: string | null
}

/**
 * Lee la respuesta SIN casarse con su forma: busca las llaves conocidas a
 * cualquier profundidad y valida lo que encuentra con las reglas del tracking.
 *
 * Tolerante a propósito. Si el proveedor anida la guía un nivel más abajo o la
 * llama `guia` en vez de `numero`, la alternativa a esto es una guía emitida
 * —cobrada— que el pedido no registra y nadie puede rastrear. Lo que NO se
 * tolera es escribir basura: un `numero` que no cumple el formato se descarta.
 */
export function parseOrderResponse(json: unknown): GuideResult {
  const found = new Map<string, string>()

  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || !v || typeof v !== 'object') return
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return }
    for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
      const key = k.toLowerCase().replace(/[^a-z]/g, '')
      if (typeof raw === 'string' || typeof raw === 'number') {
        const val = String(raw).trim()
        if (val && !found.has(key)) found.set(key, val)
      } else visit(raw, depth + 1)
    }
  }
  visit(json, 0)

  const first = (keys: string[], test?: RegExp): string | null => {
    for (const k of keys) {
      const v = found.get(k)
      if (v && (!test || test.test(v.toUpperCase()))) return v
    }
    return null
  }

  const numero = first(['numero', 'guia', 'numeroguia', 'trackingnumero', 'nroguia'], GUIA_NUMERO)
  const codigoRaw = first(['codigo', 'clave', 'codigoguia', 'trackingcodigo'], GUIA_CODIGO)
  const oseId = first(['oseid', 'ose'], /^\d+$/)
  const orderId = first(['orderid', 'pedidoid', 'id'])

  return {
    numero,
    codigo: codigoRaw ? codigoRaw.toUpperCase() : null,
    oseId,
    orderId,
  }
}

/** Una guía sirve si se puede RASTREAR: numero+codigo juntos, o el ose_id.
 *  Es la misma regla que exige `set_tracking`, escrita una sola vez. */
export const esRastreable = (g: GuideResult): boolean =>
  !!((g.numero && g.codigo) || g.oseId)
