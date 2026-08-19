// ─── SALES ENGINE · Cierre del pedido ────────────────────────────────────────
// Traduce el `CheckoutState` al contrato de `register-buyer` y sube el
// comprobante. Es lo único del checkout que habla con Supabase, para que los
// componentes no conozcan la forma del backend.
//
// Idempotencia: `checkout_id` es el uuid que nació al abrir el modal. Si el
// comprador toca dos veces con 4G lenta, el backend devuelve el pedido ya
// creado en vez de crear otro. Ver docs/01-SALES-ENGINE.md §3.1.

import { supabase } from '../../supabase'
import { IMAGE_PRESETS, downscaleImage } from '../../images/downscale'
import { VOUCHER, culqiActiveFor } from '../checkout.config'
import type { CheckoutState, DispatchType } from '../types'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export interface SubmitContext {
  storeId: string
  productId: string | null
  productName: string
  /** Precio del pack elegido, con el descuento de retención ya aplicado. */
  price: number
  packName: string | null
}

export interface SubmitResult {
  id: string
  order_id: string
  token: string
  /** La respuesta fresh lo llama session_id; la idempotente, id. */
  session_id?: string
  /** El backend devolvió un pedido que ya existía: fue un doble envío. */
  idempotent?: boolean
}

/** Dirección legible del pedido, según la rama. Es lo que ve Logística. */
function addressOf(s: CheckoutState): string | null {
  if (s.locationType === 'LIMA') {
    const a = s.limaAddress
    if (!a) return null
    // Agencia: la dirección del pedido es el destino, no la casa — vale para
    // Lima igual que para provincia.
    if (s.deliveryMethod === 'AGENCIA') return [a.district, 'Lima'].filter(Boolean).join(', ') || null
    return [a.addressText, a.district].filter(Boolean).join(', ') || null
  }
  const p = s.provinciaConfig
  if (!p) return null
  if (s.deliveryMethod === 'DOMICILIO') {
    return [p.address?.addressText, p.district, p.province].filter(Boolean).join(', ') || null
  }
  return [p.district, p.province, p.department].filter(Boolean).join(', ') || null
}

/** Referencia de la puerta (domicilio) o sede de recojo (agencia). */
function referenceOf(s: CheckoutState): string | null {
  // En agencia la "referencia" es la sede de recojo, en cualquier región.
  if (s.deliveryMethod === 'AGENCIA') {
    return s.pickup.branchId ?? s.pickup.freeText?.trim() ?? null
  }
  if (s.locationType === 'LIMA') return s.limaAddress?.reference?.trim() || null
  return s.provinciaConfig?.address?.reference?.trim() || null
}

/**
 * Región × método → `dispatch_type`. Son CUATRO casos, no dos.
 *
 * Vale la pena como función aparte porque equivocarse aquí **no falla**: la
 * lista blanca de `register-buyer` aplasta cualquier valor desconocido contra
 * `MOTORIZADO_LIMA`, así que un error manda al motorizado a una casa por un
 * paquete que está en el mostrador, sin que nada avise.
 *
 * "No es agencia" no significa Lima —un domicilio en provincia lo reparte otro
 * courier, en otros plazos y a otro costo— y "agencia" ya no significa
 * provincia, desde que Lima puede recoger.
 */
export function dispatchTypeFor(s: CheckoutState): DispatchType {
  const isProvincia = s.locationType === 'PROVINCIA'
  if (s.deliveryMethod === 'AGENCIA') return isProvincia ? 'AGENCIA_PROVINCIA' : 'AGENCIA_LIMA'
  return isProvincia ? 'MOTORIZADO_PROVINCIA' : 'MOTORIZADO_LIMA'
}

export async function submitOrder(s: CheckoutState, ctx: SubmitContext): Promise<SubmitResult> {
  const usesAgency = s.deliveryMethod === 'AGENCIA'

  const res = await fetch(`${BASE}/register-buyer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      checkout_id: s.orderId,
      store_id: ctx.storeId,
      product_id: ctx.productId ?? undefined,
      product_name: ctx.productName,
      product_price: ctx.price,
      pack_name: ctx.packName ?? undefined,
      buyer_name: s.customerInfo.receiverName.trim(),
      buyer_phone: s.customerInfo.whatsapp,
      // El DNI ahora se pide siempre, también en Lima: donde hay adelanto hace
      // falta saber a nombre de quién, y es la llave del cliente en recompra.
      document_type: s.customerInfo.dni ? 'DNI' : undefined,
      document_number: s.customerInfo.dni || undefined,
      address: addressOf(s) ?? undefined,
      delivery_reference: referenceOf(s) ?? undefined,
      dispatch_type: dispatchTypeFor(s),
      agency_name: usesAgency ? (s.pickup.agency ?? undefined) : undefined,
      payment_method: s.advanceAmount > 0 ? 'YAPE_PLIN' : 'CONTRAENTREGA',
      // 'CULQI' saca al pedido de la piscina del cruce manual desde el ALTA:
      // su dinero llega por culqi-charge, no por el Yape de la marca. Para una
      // tienda sin Culqi el campo ni viaja — payload idéntico al de siempre.
      payment_provider: culqiActiveFor(s) ? 'CULQI' : undefined,
      closed_by: 'DIRECT_CHECKOUT',
      // Con cuál de las dos versiones se cerró. Sin esto el experimento no se
      // puede leer: se sabría cuánta gente vio cada una pero no cuál vendió.
      checkout_variant: s.variant,
      advance_amount: s.advanceAmount,
      advance_yape_code: s.advanceYapeCode || undefined,
      advance_voucher_url: s.paymentVoucher?.url || undefined,
    }),
  })

  if (!res.ok) {
    const detail = await res.json().catch(() => ({} as { error?: string }))
    throw new Error(detail.error ?? `register-buyer respondió ${res.status}`)
  }
  return await res.json() as SubmitResult
}

/**
 * Sube la captura del comprobante al bucket privado `vouchers` y devuelve su
 * ruta (no una URL pública: el bucket no lo es, y una captura de Yape lleva
 * nombre y teléfono). El equipo la abre con URL firmada desde el backend.
 *
 * Se reduce antes de subirla: el comprador está en 4G y la foto pesa megas.
 */
export async function uploadVoucher(file: File, orderId: string): Promise<string> {
  if (file.size > VOUCHER.maxBytes) throw new Error('La imagen pesa demasiado')

  const small = await downscaleImage(file, IMAGE_PRESETS.voucher)
  const path = `${orderId}/${Date.now()}.jpg`
  // Sin `upsert`: la ruta ya es única (orderId + timestamp), así que nunca hay
  // nada que reemplazar. Pedirlo obliga a Storage a resolver el camino de
  // UPDATE, y el bucket `vouchers` solo tiene política de INSERT — de ahí el
  // "violates row-level security policy" que veía el comprador al adjuntar. Es
  // el MISMO fallo que ya se corrigió en las fotos de producto.
  const { error } = await supabase.storage
    .from(VOUCHER.bucket).upload(path, small, { contentType: small.type })
  if (error) throw new Error(error.message)
  return path
}

/**
 * Estado del cruce del adelanto, para que la pantalla final deje de decir
 * "estamos verificando" cuando el yape ya cuadró.
 *
 * Nunca lanza: esto es un adorno sobre un pedido que YA está registrado, así
 * que un error de red se traga en silencio. Alarmar al comprador por una
 * consulta fallida sería peor que no mostrar nada.
 */
export async function fetchPaymentVerification(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/get-session`, { headers: { 'x-kross-token': token } })
    if (!res.ok) return null
    const body = await res.json() as { session?: { payment_verification?: string | null } }
    return body.session?.payment_verification ?? null
  } catch {
    return null
  }
}
