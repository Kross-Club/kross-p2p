// ─── La boleta electrónica, como la pide Nubefact — PURO ─────────────────────
//
// Arma el JSON de `generar_comprobante` (boleta de venta, tipo 2) y lee lo que
// Nubefact contesta. Sin Deno ni red a propósito: la aritmética del IGV y el
// formato del cliente son lo que se prueba desde vitest (`src/lib/nubefact.test.ts`).
// Quien llama (`_shared/boleta.ts`) pone la ruta, el token y la base.
//
// Manual: NUBEFACT_DOC_API_JSON_V1 (3.0, 07/09/2026). Lo que importa de él:
//   · POST a la RUTA de la cuenta, header `Authorization: <token>`.
//   · `serie` empieza con B para boletas; `numero` correlativo, sin ceros.
//   · `valor_unitario` SIN IGV y `precio_unitario` CON IGV; la suma de las
//     líneas tiene que cuadrar con los totales, o rechaza (código 20/21).
//   · Los precios de Kross ya INCLUYEN el IGV (es lo que el comprador ve y
//     paga), así que el IGV se extrae hacia atrás: total / 1.18.
//   · `codigo_unico` deja que Nubefact controle duplicados: va el ORD del
//     pedido, y un reintento del mismo pedido devuelve el código 23 en vez de
//     emitir dos boletas.
//   · Nada de comillas dobles en los textos: rompen su JSON.

export const PORCENTAJE_IGV = 18
export const TIPO_BOLETA = 2

export interface ClienteDeBoleta {
  /** '1' = DNI · '-' = varios (ventas menores a S/700 sin documento). */
  tipoDocumento: '1' | '-'
  numeroDocumento: string
  denominacion: string
  direccion: string | null
  email: string | null
}

export interface ItemDeBoleta {
  descripcion: string
  cantidad: number
  /** Lo que el comprador pagó por unidad, CON IGV: el precio del pack. */
  precioConIgv: number
  codigo?: string | null
}

export const redondear2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

/** Sin comillas dobles ni saltos: rompen el JSON de Nubefact. Recortado al
 *  largo que el campo admite. */
export function limpiarTexto(s: unknown, max: number): string {
  return String(s ?? '').replace(/["\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * Quién compra, como lo pide la boleta. Con DNI de verdad (8 dígitos y no
 * todo ceros) va con tipo 1; sin él, «varios» (tipo `-`), que SUNAT admite en
 * boletas por debajo de S/700. El nombre siempre va: es lo que sale impreso.
 */
export function clienteDeBoleta(p: { dni?: string | null; nombre?: string | null; direccion?: string | null; email?: string | null }): ClienteDeBoleta {
  const dni = String(p.dni ?? '').replace(/\D/g, '')
  const conDni = /^\d{8}$/.test(dni) && !/^0{8}$/.test(dni)
  const nombre = limpiarTexto(p.nombre, 100) || 'CLIENTE'
  return {
    tipoDocumento: conDni ? '1' : '-',
    numeroDocumento: conDni ? dni : '-',
    denominacion: conDni ? nombre : (nombre === 'CLIENTE' ? 'CLIENTES VARIOS' : nombre),
    direccion: limpiarTexto(p.direccion, 100) || null,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.email ?? '').trim()) ? String(p.email).trim() : null,
  }
}

/** DD-MM-AAAA en hora de Lima (UTC-5, sin horario de verano): Nubefact exige
 *  la fecha DE HOY y el servidor corre en UTC, donde ya puede ser mañana. */
export function fechaDeEmision(d: Date): string {
  const lima = new Date(d.getTime() - 5 * 3600 * 1000)
  const dd = String(lima.getUTCDate()).padStart(2, '0')
  const mm = String(lima.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${lima.getUTCFullYear()}`
}

/** Una línea de la boleta, con el IGV extraído del precio que ya lo incluye. */
export function lineaDeBoleta(it: ItemDeBoleta) {
  const cantidad = Number(it.cantidad) > 0 ? Number(it.cantidad) : 1
  const precio = redondear2(Number(it.precioConIgv) || 0)
  const total = redondear2(precio * cantidad)
  const subtotal = redondear2(total / (1 + PORCENTAJE_IGV / 100))
  const igv = redondear2(total - subtotal)
  // Hasta 10 decimales, como admite el campo: así valor × cantidad cuadra con
  // el subtotal aunque el precio no divida exacto.
  const valorUnitario = Number((subtotal / cantidad).toFixed(10))
  return {
    unidad_de_medida: 'NIU',
    codigo: limpiarTexto(it.codigo, 250) || '',
    descripcion: limpiarTexto(it.descripcion, 250) || 'PRODUCTO',
    cantidad,
    valor_unitario: valorUnitario,
    precio_unitario: precio,
    descuento: '',
    subtotal,
    tipo_de_igv: 1,
    igv,
    total,
    anticipo_regularizacion: false,
    anticipo_documento_serie: '',
    anticipo_documento_numero: '',
  }
}

export interface BoletaParaArmar {
  serie: string
  numero: number
  cliente: ClienteDeBoleta
  items: ItemDeBoleta[]
  fecha: Date
  /** El ORD del pedido: Nubefact no emite dos boletas con el mismo código. */
  codigoUnico: string
  medioDePago?: string | null
  observaciones?: string | null
}

/** El JSON de `generar_comprobante` para una boleta pagada, en soles. */
export function armarBoleta(b: BoletaParaArmar) {
  const items = b.items.map(lineaDeBoleta)
  const totalGravada = redondear2(items.reduce((s, i) => s + i.subtotal, 0))
  const totalIgv = redondear2(items.reduce((s, i) => s + i.igv, 0))
  const total = redondear2(items.reduce((s, i) => s + i.total, 0))
  return {
    operacion: 'generar_comprobante',
    tipo_de_comprobante: TIPO_BOLETA,
    serie: b.serie,
    numero: b.numero,
    sunat_transaction: 1,
    cliente_tipo_de_documento: b.cliente.tipoDocumento,
    cliente_numero_de_documento: b.cliente.numeroDocumento,
    cliente_denominacion: b.cliente.denominacion,
    cliente_direccion: b.cliente.direccion ?? '',
    cliente_email: b.cliente.email ?? '',
    cliente_email_1: '',
    cliente_email_2: '',
    fecha_de_emision: fechaDeEmision(b.fecha),
    fecha_de_vencimiento: '',
    moneda: 1,
    tipo_de_cambio: '',
    porcentaje_de_igv: PORCENTAJE_IGV,
    descuento_global: '',
    total_descuento: '',
    total_anticipo: '',
    total_gravada: totalGravada,
    total_inafecta: '',
    total_exonerada: '',
    total_igv: totalIgv,
    total_gratuita: '',
    total_otros_cargos: '',
    total,
    percepcion_tipo: '',
    percepcion_base_imponible: '',
    total_percepcion: '',
    total_incluido_percepcion: '',
    detraccion: false,
    observaciones: limpiarTexto(b.observaciones, 1000),
    documento_que_se_modifica_tipo: '',
    documento_que_se_modifica_serie: '',
    documento_que_se_modifica_numero: '',
    tipo_de_nota_de_credito: '',
    tipo_de_nota_de_debito: '',
    enviar_automaticamente_a_la_sunat: true,
    enviar_automaticamente_al_cliente: !!b.cliente.email,
    codigo_unico: limpiarTexto(b.codigoUnico, 20),
    condiciones_de_pago: '',
    medio_de_pago: limpiarTexto(b.medioDePago ?? 'YAPE', 250),
    cancelado: true,
    placa_vehiculo: '',
    orden_compra_servicio: '',
    formato_de_pdf: '',
    generado_por_contingencia: '',
    bienes_region_selva: '',
    servicios_region_selva: '',
    items,
  }
}

/** Para preguntarle a Nubefact por una boleta ya emitida (código 23). */
export function consultaDeBoleta(serie: string, numero: number) {
  return { operacion: 'consultar_comprobante', tipo_de_comprobante: TIPO_BOLETA, serie, numero }
}

/** Los códigos de error del manual, en palabras para el panel. */
export const ERRORES_NUBEFACT: Record<number, string> = {
  10: 'Nubefact no reconoce el token. Revísalo en Marca → Facturación.',
  11: 'La ruta de Nubefact no es correcta. Cópiala de tu cuenta, en API (Integración).',
  12: 'Nubefact no aceptó la cabecera de la petición.',
  20: 'Nubefact rechazó el formato de la boleta.',
  21: 'Nubefact no pudo completar la operación. La causa más común: esa SERIE no está habilitada en la cuenta — usa la que ya emite (la ves en Nubefact → Ver Facturas, Boletas y Notas).',
  22: 'La boleta se mandó fuera del plazo que SUNAT permite.',
  23: 'Esa boleta ya existe en Nubefact.',
  24: 'Esa boleta no existe en Nubefact.',
  40: 'Error interno de Nubefact.',
  50: 'La cuenta de Nubefact de la marca está suspendida.',
  51: 'La cuenta de Nubefact de la marca está suspendida por falta de pago.',
}

export type RespuestaNubefact =
  | {
      ok: true
      serie: string
      numero: number
      /** La página del comprobante en Nubefact. Con `.pdf` es el PDF. */
      enlace: string | null
      pdf: string | null
      xml: string | null
      aceptada: boolean
      sunat: string | null
      hash: string | null
    }
  | {
      ok: false
      codigo: number | null
      mensaje: string
      /** Código 23: ya existe. No es un fallo: hay que consultarla, no reemitirla. */
      yaExiste: boolean
      /** Vale volver a intentar más tarde con EL MISMO número. */
      reintentable: boolean
    }

/** Lo que Nubefact contestó, para las dos operaciones (generar y consultar). */
export function leerRespuesta(json: unknown, httpStatus: number): RespuestaNubefact {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const errors = o.errors
  if (errors !== undefined && errors !== null && errors !== '') {
    const codigo = Number.isFinite(Number(o.codigo)) ? Number(o.codigo) : null
    const detalle = typeof errors === 'string' ? errors : JSON.stringify(errors)
    return {
      ok: false,
      codigo,
      mensaje: `${codigo != null && ERRORES_NUBEFACT[codigo] ? ERRORES_NUBEFACT[codigo] : 'Nubefact rechazó la boleta.'} ${detalle}`.trim().slice(0, 400),
      yaExiste: codigo === 23,
      reintentable: codigo === 40 || codigo === 12 || httpStatus >= 500,
    }
  }
  if (typeof o.enlace === 'string' || typeof o.numero === 'number' || typeof o.serie === 'string') {
    const enlace = typeof o.enlace === 'string' && o.enlace ? o.enlace : null
    const pdf = typeof o.enlace_del_pdf === 'string' && o.enlace_del_pdf ? o.enlace_del_pdf : (enlace ? `${enlace}.pdf` : null)
    return {
      ok: true,
      serie: String(o.serie ?? ''),
      numero: Number(o.numero ?? 0),
      enlace,
      pdf,
      xml: typeof o.enlace_del_xml === 'string' && o.enlace_del_xml ? o.enlace_del_xml : null,
      aceptada: o.aceptada_por_sunat === true,
      sunat: typeof o.sunat_description === 'string' && o.sunat_description ? o.sunat_description : null,
      hash: typeof o.codigo_hash === 'string' ? o.codigo_hash : null,
    }
  }
  return { ok: false, codigo: null, mensaje: `Respuesta de Nubefact sin forma conocida (HTTP ${httpStatus}).`, yaExiste: false, reintentable: httpStatus >= 500 }
}

/**
 * ¿La marca tiene lo mínimo para facturar? Lo mismo pregunta el panel al
 * encender el interruptor y el servidor antes de emitir.
 *
 * Son TRES cosas, y ninguna más (15-set-2026): la **ruta** y el **token** de la
 * cuenta, y la **serie**. Acá pedíamos además el RUC y la razón social de la
 * marca, y era pedir por pedir: el emisor no viaja en el JSON —lo identifica la
 * ruta, que es única por cuenta— así que esos datos no participaban de la
 * emisión y solo servían para bloquear a quien ya podía facturar. Las columnas
 * se quedan en la base (nada se borra), sin usarse.
 */
export function puedeFacturar(t: {
  nubefact_enabled?: boolean | null
  boleta_serie?: string | null
}, secretos: { nubefact_ruta?: string | null; nubefact_token?: string | null } | null | undefined): boolean {
  return t.nubefact_enabled === true
    && esSerieDeBoleta(t.boleta_serie)
    && /^https?:\/\//.test(String(secretos?.nubefact_ruta ?? '').trim())
    && String(secretos?.nubefact_token ?? '').trim().length > 0
}

/** Un RUC peruano: 11 dígitos, y empieza en 10 (persona) o 20 (empresa). */
export const esRuc = (v: unknown): boolean => /^(10|20)\d{9}$/.test(String(v ?? '').trim())

/**
 * La serie de boletas: **B** + tres letras o números (`B001`, `BBB1`, `BE01`).
 * La `B` la exige SUNAT —las facturas empiezan con `F`— pero el resto NO lo
 * elegimos: cada cuenta de Nubefact tiene sus series habilitadas y el API **no
 * ofrece forma de listarlas** (sus cuatro operaciones son generar, consultar,
 * anular y consultar anulación). Una serie que la cuenta no emite se rechaza
 * con «[21] No puedes emitir comprobantes con esta serie». Por eso el panel no
 * inventa ninguna: se copia de Nubefact y se comprueba con «Probar».
 */
export const esSerieDeBoleta = (v: unknown): boolean => /^B[A-Z0-9]{3}$/.test(String(v ?? '').trim().toUpperCase())

/**
 * ¿La reserva que el pedido tiene guardada todavía sirve? (15-set-2026)
 *
 * Cuando una emisión falla, la serie y el número se QUEDAN en el pedido para
 * reintentar con ellos y no dejar huecos en el correlativo. Pero si la marca
 * corrigió la serie —el caso más común, porque la que tenía no estaba
 * habilitada en su cuenta y Nubefact la rechaza con el `21`—, ese número es de
 * OTRA numeración: reintentar con él repite el mismo error para siempre. Ahí la
 * reserva se descarta y se pide un número de la serie vigente. El hueco que
 * queda es en una serie que nunca emitió nada, así que no hay hueco.
 *
 * Solo se aplica a boletas que NUNCA salieron: la emitida se responde antes,
 * desde el `boleta_url` guardado en el pedido.
 */
export function reservaSigueValiendo(guardada: unknown, laDeLaTienda: unknown): boolean {
  const a = String(guardada ?? '').trim().toUpperCase()
  const b = String(laDeLaTienda ?? '').trim().toUpperCase()
  return a !== '' && a === b
}
