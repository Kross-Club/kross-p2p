// Tests del cobro en línea con Culqi: bifurcación del paso 3, máquina de fases
// del pago (donde vive el doble tap), persistencia de los campos nuevos,
// mapeo de fallos, y la PARIDAD front↔server de la tabla de adelantos — la
// regla que impide que un cliente pague S/1 por un adelanto de S/25.

import { beforeEach, describe, expect, it } from 'vitest'
import { checkoutReducer, initialCheckoutState } from './machine'
import type { CheckoutAction } from './machine'
import { validateStep } from './validation'
import { loadActiveDraft, loadLastOrder, saveDraft, saveLastOrder, clearAdvancePending } from './persistence'
import {
  advanceFor, culqiActiveFor,
} from './checkout.config'
import { advanceForServer } from '../../../supabase/functions/_shared/advance.ts'
import { errorForLog, extractWebhookChargeId, extractWebhookStoreId } from '../../../supabase/functions/_shared/culqi.ts'
import { canRetry, culqiFailureCopy, needsNewOtp } from './culqi-errors'
import { orderRegistered, payPhaseReducer } from './pay-phase'
import type { PayPhase } from './pay-phase'
import type { CheckoutState, StoreCulqi } from './types'

const run = (state: CheckoutState, ...actions: CheckoutAction[]): CheckoutState =>
  actions.reduce(checkoutReducer, state)

const base = () => initialCheckoutState('pack-2')

const CULQI_ALL: StoreCulqi = { enabled: true, scope: 'ALL' }
const CULQI_PROV: StoreCulqi = { enabled: true, scope: 'PROVINCIA' }

/** Pedido de provincia por agencia, con los datos del paso 2 completos. */
/** Precio del pack de prueba. El adelanto es un porcentaje de él. */
const PRECIO = 140

const provincia = (culqi: StoreCulqi | null) => run(base(),
  { type: 'SET_PACK', packId: 'pack-2', price: PRECIO },
  { type: 'SET_CULQI_CONFIG', culqi },
  { type: 'SET_WHATSAPP', whatsapp: '987654321' },
  { type: 'SET_DNI', dni: '12345678' },
  { type: 'SET_RECEIVER_NAME', receiverName: 'Ana Quispe' },
  { type: 'SET_DISTRICT', department: 'La Libertad', province: 'Trujillo', district: 'Trujillo' },
  { type: 'SET_AGENCY', agency: 'SHALOM' },
)

const lima = (culqi: StoreCulqi | null) => run(base(),
  { type: 'SET_PACK', packId: 'pack-2', price: PRECIO },
  { type: 'SET_CULQI_CONFIG', culqi },
  { type: 'SET_DISTRICT', department: 'Lima', province: 'Lima', district: 'Miraflores' },
)

describe('culqiActiveFor · dónde cobra Culqi', () => {
  it('scope ALL cobra también en Lima', () => {
    expect(culqiActiveFor(lima(CULQI_ALL))).toBe(true)
  })

  it('scope PROVINCIA deja Lima en el flujo manual', () => {
    expect(culqiActiveFor(lima(CULQI_PROV))).toBe(false)
    expect(culqiActiveFor(provincia(CULQI_PROV))).toBe(true)
  })

  it('sin config (tienda sin Culqi, o query aún en vuelo) es false', () => {
    expect(culqiActiveFor(provincia(null))).toBe(false)
  })

  it('sin destino elegido es false: no hay monto que cobrar todavía', () => {
    // Estado real entre el paso 1 y el 2: locationType null, advanceAmount 0.
    const s = run(base(), { type: 'SET_CULQI_CONFIG', culqi: CULQI_ALL })
    expect(s.locationType).toBeNull()
    expect(culqiActiveFor(s)).toBe(false)
  })
})

describe('validación · paso 3 bifurcado', () => {
  it('con Culqi exige celular y código de aprobación, no el código de Yape', () => {
    const e = validateStep(provincia(CULQI_ALL), 3)
    expect(e.culqiPhone).toBeTruthy()
    expect(e.culqiOtp).toBeTruthy()
    expect(e.yapeCode).toBeUndefined()
    expect(e.voucher).toBeUndefined()
  })

  it('sin Culqi el paso 3 sigue exigiendo el código de 3 dígitos — regresión', () => {
    const e = validateStep(provincia(null), 3)
    expect(e.yapeCode).toBeTruthy()
    expect(e.culqiPhone).toBeUndefined()
  })

  it('celular y código completos dejan pasar', () => {
    const s = run(provincia(CULQI_ALL),
      { type: 'SET_CULQI_PHONE', phone: '987654321' },
      { type: 'SET_CULQI_OTP', otp: '481207' },
    )
    expect(validateStep(s, 3)).toEqual({})
  })

  it('el celular exige el formato peruano: 9 dígitos empezando en 9', () => {
    const s = run(provincia(CULQI_ALL), { type: 'SET_CULQI_PHONE', phone: '812345678' })
    expect(validateStep(s, 3).culqiPhone).toMatch(/empieza con 9/)
  })
})

describe('máquina · acciones Culqi', () => {
  it('SET_CULQI_PHONE y SET_CULQI_OTP sanean a dígitos y recortan a 9/6', () => {
    const s = run(base(),
      { type: 'SET_CULQI_PHONE', phone: ' 9-8765 4321 999' },
      { type: 'SET_CULQI_OTP', otp: '4 8 1 2 0 7 9 9' },
    )
    expect(s.culqiPhone).toBe('987654321')
    expect(s.culqiOtp).toBe('481207')
  })

  it('las acciones Culqi no tocan advanceAmount — regla de oro del reducer', () => {
    const before = provincia(CULQI_ALL)
    const after = run(before,
      { type: 'SET_CULQI_PHONE', phone: '987654321' },
      { type: 'SET_CULQI_OTP', otp: '481207' },
      { type: 'SET_CULQI_CONFIG', culqi: CULQI_PROV },
    )
    expect(after.advanceAmount).toBe(before.advanceAmount)
    expect(after.advanceAmount).toBe(PRECIO / 2)
  })
})

describe('persistencia · los campos Culqi y el borrador', () => {
  beforeEach(() => localStorage.clear())

  it('un borrador viejo sin campos Culqi hidrata con defaults', () => {
    const s = run(base(), { type: 'SET_WHATSAPP', whatsapp: '987654321' })
    saveDraft(s)
    // Simula un borrador guardado por la versión ANTERIOR del checkout.
    const key = Object.keys(localStorage).find(k => k.includes(s.orderId))!
    const stored = JSON.parse(localStorage.getItem(key)!)
    delete stored.state.culqi
    delete stored.state.culqiPhone
    delete stored.state.culqiOtp
    localStorage.setItem(key, JSON.stringify(stored))

    const restored = loadActiveDraft()!
    expect(restored.culqi).toBeNull()
    expect(restored.culqiPhone).toBe('')
    expect(restored.culqiOtp).toBe('')
    expect(restored.customerInfo.whatsapp).toBe('987654321')
  })

  it('la config Culqi no sobrevive al borrador: la reinyecta el modal', () => {
    const s = run(provincia(CULQI_ALL), { type: 'SET_WHATSAPP', whatsapp: '987654321' })
    saveDraft(s)
    expect(loadActiveDraft()!.culqi).toBeNull()
  })

  it('un OTP guardado NO se restaura: vence en 2 minutos', () => {
    const s = run(provincia(CULQI_ALL),
      { type: 'SET_WHATSAPP', whatsapp: '987654321' },
      { type: 'SET_CULQI_PHONE', phone: '911222333' },
      { type: 'SET_CULQI_OTP', otp: '481207' },
    )
    saveDraft(s)
    const restored = loadActiveDraft()!
    expect(restored.culqiOtp).toBe('')
    // El celular sí vuelve: no vence y ahorra tecleo en el reintento.
    expect(restored.culqiPhone).toBe('911222333')
  })

  it('advancePending marca el último pedido y se limpia al resolverse', () => {
    saveLastOrder('tok123', 'ORD-1', null, { advancePending: true, culqiPhone: '987654321' })
    expect(loadLastOrder()?.advancePending).toBe(true)
    clearAdvancePending()
    expect(loadLastOrder()?.advancePending).toBeUndefined()
    expect(loadLastOrder()?.token).toBe('tok123')
  })
})

describe('paridad front ↔ server del adelanto', () => {
  // Si esto falla, register-buyer y el checkout derivan montos DISTINTOS y el
  // server va a pisar (con warning) lo que el comprador vio. Las dos reglas
  // tienen que moverse juntas: checkout.config.ts y _shared/advance.ts.
  //
  // Ya no es una tabla por destino: es un porcentaje del pedido, así que la
  // paridad se prueba sobre precios y no sobre combinaciones de despacho.
  it('la mitad, con el mismo redondeo en los dos lados', () => {
    for (const price of [35, 60, 110, 139, 189, 259, 270]) {
      expect(advanceForServer(price, 'HALF')).toBe(advanceFor(price, 'HALF'))
    }
  })

  it('el total, idéntico en los dos lados', () => {
    for (const price of [35, 139, 270]) {
      expect(advanceForServer(price, 'FULL')).toBe(advanceFor(price, 'FULL'))
    }
  })

  it('un precio imposible no cobra nada, en ninguno de los dos', () => {
    for (const bad of [0, -10, Number.NaN]) {
      expect(advanceForServer(bad, 'HALF')).toBe(0)
      expect(advanceFor(bad, 'HALF')).toBe(0)
    }
  })

  it('el server trata cualquier choice desconocida como la mitad', () => {
    // Llega del body: lo que no sea 'FULL' tiene que caer en el mínimo, nunca
    // en cobrar de más ni en cobrar cero.
    expect(advanceForServer(140, null)).toBe(70)
    expect(advanceForServer(140, 'lo-que-sea')).toBe(70)
  })
})

describe('fallos del cobro · copy y decisiones', () => {
  it('el user_message de Culqi llega intacto', () => {
    expect(culqiFailureCopy({ stage: 'charge', userMessage: 'Sin saldo suficiente.' }))
      .toBe('Sin saldo suficiente.')
  })

  it('sin user_message hay copy propia, nunca vacío', () => {
    expect(culqiFailureCopy({ stage: 'token' })).toMatch(/Genera uno nuevo/)
    expect(culqiFailureCopy({ stage: 'network_after' })).toMatch(/No vuelvas a pagar/)
  })

  it('needsNewOtp: token y charge sí (single-use); red-antes no', () => {
    expect(needsNewOtp({ stage: 'token' })).toBe(true)
    expect(needsNewOtp({ stage: 'charge' })).toBe(true)
    expect(needsNewOtp({ stage: 'network_before' })).toBe(false)
  })

  it('network_after JAMÁS ofrece reintento: el dinero pudo salir', () => {
    expect(canRetry({ stage: 'network_after' })).toBe(false)
    expect(canRetry({ stage: 'network_before' })).toBe(true)
    expect(canRetry({ stage: 'charge' })).toBe(true)
  })
})

describe('máquina de fases del pago', () => {
  const ref = { token: 'tok', orderCode: 'ORD-1', sessionId: 'sess-1' } as const
  const idle: PayPhase = { k: 'IDLE' }

  it('sin Culqi el registro va directo a DONE sin pagar — flujo actual intacto', () => {
    const p = payPhaseReducer(idle, { type: 'REGISTERED_MANUAL', ...ref })
    expect(p).toMatchObject({ k: 'DONE', paid: false })
  })

  it('con Culqi el registro pasa a CHARGING y el éxito a DONE pagado', () => {
    let p = payPhaseReducer(idle, { type: 'REGISTERED_CULQI', ...ref })
    expect(p.k).toBe('CHARGING')
    p = payPhaseReducer(p, { type: 'CHARGE_OK' })
    expect(p).toMatchObject({ k: 'DONE', paid: true, orderCode: 'ORD-1' })
  })

  it('desde CHARGING no se admite otro cobro: el doble tap muere aquí', () => {
    const charging = payPhaseReducer(idle, { type: 'REGISTERED_CULQI', ...ref })
    // Un segundo "registro" (segundo tap del CTA) no reinicia nada.
    expect(payPhaseReducer(charging, { type: 'REGISTERED_CULQI', ...ref })).toBe(charging)
    // Y un RETRY suelto tampoco existe desde CHARGING.
    expect(payPhaseReducer(charging, { type: 'RETRY' })).toBe(charging)
  })

  it('el retry solo existe desde CHARGE_FAILED y nunca re-registra', () => {
    const charging = payPhaseReducer(idle, { type: 'REGISTERED_CULQI', ...ref })
    const failed = payPhaseReducer(charging, { type: 'CHARGE_FAILED', fail: { stage: 'token' } })
    expect(failed.k).toBe('CHARGE_FAILED')
    const retried = payPhaseReducer(failed, { type: 'RETRY' })
    expect(retried.k).toBe('CHARGING')
    // El pedido sigue siendo el MISMO: el retry cobra, no registra otro.
    expect(retried).toMatchObject(ref)
  })

  it('cerrar solo retiene ANTES de registrar: después es una compra hecha', () => {
    // IDLE es el único momento en que el pedido todavía no existe. Ahí sí vale
    // el exit-intent con descuento y contar el abandono.
    expect(orderRegistered(idle)).toBe(false)

    // A partir del submit el pedido YA está en la base. Retenerlo con un
    // descuento por algo que acaba de comprar —y devolverlo al paso 1— sería la
    // peor pantalla del checkout; contarlo como `checkout_abandoned` mediría
    // abandonos donde hubo ventas.
    const charging = payPhaseReducer(idle, { type: 'REGISTERED_CULQI', ...ref })
    const failed = payPhaseReducer(charging, { type: 'CHARGE_FAILED', fail: { stage: 'charge' } })
    const confirming = payPhaseReducer(charging, { type: 'CHARGE_FAILED', fail: { stage: 'network_after' } })
    for (const p of [
      charging,
      failed,
      confirming,
      payPhaseReducer(charging, { type: 'CHARGE_OK' }),
      payPhaseReducer(idle, { type: 'REGISTERED_MANUAL', ...ref }),
      payPhaseReducer(failed, { type: 'GIVE_UP' }),
    ]) {
      expect(orderRegistered(p)).toBe(true)
    }
  })

  it('network_after va a CONFIRMING, que no tiene reintento — solo consulta', () => {
    const charging = payPhaseReducer(idle, { type: 'REGISTERED_CULQI', ...ref })
    const confirming = payPhaseReducer(charging, { type: 'CHARGE_FAILED', fail: { stage: 'network_after' } })
    expect(confirming.k).toBe('CONFIRMING')
    expect(payPhaseReducer(confirming, { type: 'RETRY' })).toBe(confirming)
    // La consulta ve MATCHED → pagado. O el comprador se rinde → asesor.
    expect(payPhaseReducer(confirming, { type: 'CONFIRMED' })).toMatchObject({ k: 'DONE', paid: true })
    expect(payPhaseReducer(confirming, { type: 'GIVE_UP' })).toMatchObject({ k: 'DONE', paid: false, unpaid: true })
  })
})

describe('extractores del webhook · las 3 formas del payload', () => {
  const CHR = 'chr_test_abc123XYZ'

  it('evento con data STRING (JSON embebido)', () => {
    const payload = { type: 'charge.creation.succeeded', data: JSON.stringify({ object: 'charge', id: CHR, metadata: { kross_store_id: 'st_x' } }) }
    expect(extractWebhookChargeId(payload)).toBe(CHR)
    expect(extractWebhookStoreId(payload)).toBe('st_x')
  })

  it('evento con data OBJETO', () => {
    const payload = { type: 'charge.creation.succeeded', data: { id: CHR, metadata: { kross_store_id: 'st_x' } } }
    expect(extractWebhookChargeId(payload)).toBe(CHR)
    expect(extractWebhookStoreId(payload)).toBe('st_x')
  })

  it('charge crudo', () => {
    expect(extractWebhookChargeId({ object: 'charge', id: CHR })).toBe(CHR)
  })

  it('basura no produce ids: sin chr_ válido no se toca la base', () => {
    expect(extractWebhookChargeId(null)).toBeNull()
    expect(extractWebhookChargeId({ data: 'no es json' })).toBeNull()
    expect(extractWebhookChargeId({ data: { id: 'evt_123' } })).toBeNull()
    expect(extractWebhookChargeId({ data: { id: 'chr_../inyeccion' } })).toBeNull()
    expect(extractWebhookStoreId({ data: { id: 'chr_x', metadata: {} } })).toBeNull()
  })
})

describe('errorForLog · que el próximo fallo de cobro diga POR QUÉ', () => {
  it('el 400 que bloqueó el cobro live: sin `code`, el motivo está en type + merchant_message', () => {
    // Respuesta real de `POST secure/tokens/yape` con llaves live correctas.
    // Loguear solo {status, code} imprimía {400, null} y no decía nada.
    const log = errorForLog(400, {
      object: 'error',
      type: 'authentication_error',
      merchant_message: 'Tu código de comercio no está autorizado para realizar este tipo de peticiones. Contáctate con culqi.com/soporte para obtener mas información.',
    })
    expect(log.type).toBe('authentication_error')
    expect(log.code).toBeNull()
    expect(String(log.merchant_message)).toContain('no está autorizado')
  })

  it('un rechazo de cargo trae su decline_code, en cualquiera de las dos grafías', () => {
    expect(errorForLog(402, { decline_code: 'insufficient_funds' }).decline_code).toBe('insufficient_funds')
    expect(errorForLog(402, { declined_code: 'insufficient_funds' }).decline_code).toBe('insufficient_funds')
  })

  it('`code` no se disfraza de decline: son campos distintos', () => {
    // `declineCodeOf` cae a `code` para la RESPUESTA; el log no, para que se
    // vea si Culqi mandó decline de verdad o solo un code genérico.
    const log = errorForLog(402, { code: 'invalid_token' })
    expect(log.code).toBe('invalid_token')
    expect(log.decline_code).toBeNull()
  })

  it('un fallo de red (error null) no revienta: todo en null salvo el status', () => {
    const log = errorForLog(0, null)
    expect(log.status).toBe(0)
    expect(Object.values(log).filter((v) => v !== null && v !== 0)).toHaveLength(0)
  })

  it('SOLO salen campos de Culqi: nada del request puede colarse al log', () => {
    // La lista es el contrato. Si alguien agrega un campo aquí, que sea una
    // decisión y no un descuido: por esta función pasan llave, celular y OTP.
    expect(Object.keys(errorForLog(400, { type: 'x' })).sort()).toEqual(
      ['charge_id', 'code', 'decline_code', 'merchant_message', 'param', 'status', 'type'],
    )
  })

  it('un merchant_message desmedido se corta antes de inflar la línea', () => {
    const log = errorForLog(400, { merchant_message: 'x'.repeat(1000) })
    expect(String(log.merchant_message)).toHaveLength(300)
  })
})
