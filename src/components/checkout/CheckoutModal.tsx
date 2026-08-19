// ─── SALES ENGINE · Modal del Checkout ───────────────────────────────────────
// Contenedor de los 3 pasos. En móvil es un bottom-sheet a pantalla casi
// completa; en desktop, un contenedor centrado de ancho legible — el flujo
// entero tiene que poder ejecutarse con mouse y teclado para grabar tutoriales.
//
// Accesibilidad: role="dialog", trap de foco, Esc cierra (pidiendo confirmación
// si hay data ingresada) y el CTA es sticky dentro del safe area de iOS.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { ArrowLeft, Loader2, X } from 'lucide-react'
import { useCheckout } from '../../lib/checkout/useCheckout'
import { COPY, EXIT_DISCOUNT_ONCE, EXIT_DISCOUNT_PEN, culqiActiveFor } from '../../lib/checkout/checkout.config'
import { trackEvent } from '../../lib/checkout/analytics'
import type { CheckoutState, StoreCulqi } from '../../lib/checkout/types'
import type { CheckoutAbMode } from '../../lib/checkout/variant'
import { effectivePrice } from '../../lib/checkout/product-packs'
import { fetchPaymentVerification, submitOrder, uploadVoucher } from '../../lib/checkout/services/OrderService'
import { chargeAdvance } from '../../lib/checkout/services/CulqiService'
import { clearAdvancePending, saveLastOrder } from '../../lib/checkout/persistence'
import { orderRegistered, payPhaseReducer } from '../../lib/checkout/pay-phase'
import { canRetry, culqiFailureCopy, needsNewOtp } from '../../lib/checkout/culqi-errors'
import type { SubmitContext } from '../../lib/checkout/services/OrderService'
import Step1Pack from './steps/Step1Pack'
import type { PackOption } from './steps/Step1Pack'
import Step2Delivery from './steps/Step2Delivery'
import Step3Confirm from './steps/Step3Confirm'
import CulqiYapeBox from './payment/CulqiYapeBox'
import OrderDone from './steps/OrderDone'
import ExitOffer from './ExitOffer'

/** Datos de cobro de la tienda. Vienen de `stores.yape_*`, nunca de config. */
export interface StoreYape {
  number: string | null
  holder: string | null
  qrUrl: string | null
}

const STEP_LABEL = ['Tu pack', 'Tus datos', 'Confirmar'] as const
const TOTAL_STEPS = 3

interface CheckoutModalProps {
  packs: PackOption[]
  unitPrice: number
  bestPackId: string | null
  initialPack: string | null
  onClose: () => void
  onPartialLead?: (state: CheckoutState) => void
  /** Contexto del pedido. Sin él el checkout es solo demo y no puede cerrar. */
  submitContext?: Omit<SubmitContext, 'price' | 'packName'>
  yape?: StoreYape | null
  /** `stores.home_delivery_enabled`. Si es false la marca solo ofrece recojo en
   *  agencia y el checkout no muestra nunca la opción de entrega a domicilio. */
  homeDeliveryEnabled?: boolean
  /** Config Culqi de la tienda (columnas públicas). Puede llegar asíncrona. */
  culqi?: StoreCulqi | null
  /** Cómo reparte la tienda el A/B (`stores.checkout_ab_mode`). Asíncrona igual
   *  que `culqi`: hasta que llegue vale el sorteo 50/50 de siempre. */
  abMode?: CheckoutAbMode
}

export default function CheckoutModal({
  packs, unitPrice, bestPackId, initialPack, onClose, onPartialLead,
  submitContext, yape = null, homeDeliveryEnabled = true, culqi = null, abMode = 'SPLIT',
}: CheckoutModalProps) {
  const co = useCheckout({ initialPack, onPartialLead, homeDeliveryEnabled })
  const { state, dispatch, errors, touch } = co
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // La máquina del PAGO, aparte de la del checkout: registro y cobro son dos
  // operaciones que fallan por separado. Los guards del doble tap, el pie
  // sticky y el retry se gobiernan por esta fase, no por `state.status` — que
  // ya está en SUBMITTED mientras el cargo sigue en vuelo.
  const [phase, phaseDispatch] = useReducer(payPhaseReducer, { k: 'IDLE' })
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  // Qué mostrar en el diálogo se decide AL ABRIRLO, no en cada render.
  const [offerDiscount, setOfferDiscount] = useState(false)

  // La config de la tienda entra por dispatch y NO solo al montar: llega
  // asíncrona (la landing la consulta aparte), y un comprador rápido abre el
  // modal antes de que resuelva. Con deps reales, el estado se corrige solo.
  useEffect(() => {
    dispatch({ type: 'SET_CULQI_CONFIG', culqi: culqi ?? null })
  }, [culqi, dispatch])

  // Igual que la de Culqi: llega asíncrona y con deps reales se corrige sola.
  useEffect(() => {
    dispatch({ type: 'SET_AB_MODE', mode: abMode })
  }, [abMode, dispatch])

  const requestClose = useCallback(() => {
    // Con el diálogo de salida ya abierto, cualquier nuevo intento de cerrar
    // (Esc, clic en el fondo) significa "quedarme": nunca se pierde la venta por
    // una tecla repetida. Salir de verdad es un botón explícito del diálogo.
    if (confirmingClose) { setConfirmingClose(false); return }

    // Pedido ya registrado (todo lo que no es IDLE): cerrar es salir de una
    // compra hecha. Sale directo — sin retenerlo con un descuento por algo que
    // ya compró y sin contarlo como abandono. Ver `orderRegistered`.
    if (orderRegistered(phase)) { onClose(); return }

    // Con data ingresada se pide confirmación: cerrar por error tras llenar
    // cuatro campos es perder la venta. Nada de confirm() nativo.
    //
    // En móvil no existe `mouseleave`, así que el disparador real del
    // exit-intent es este: el toque en la X (o Esc en desktop).
    if (co.isDirty) {
      // El descuento se ofrece una sola vez por checkout: insistir cada vez le
      // enseña al comprador que salir es la forma de conseguirlo. `exitOfferShown`
      // vive en el estado, así que la regla sobrevive a una recarga.
      const firstOffer = state.discountPen === 0 && (!EXIT_DISCOUNT_ONCE || !state.exitOfferShown)
      setOfferDiscount(firstOffer)
      setConfirmingClose(true)
      if (firstOffer) {
        dispatch({ type: 'EXIT_OFFER_SHOWN' })
        trackEvent({ name: 'exit_offer_shown', step: state.step })
      }
      return
    }
    co.abandon()
    onClose()
  }, [co, confirmingClose, onClose, phase, state.exitOfferShown, state.discountPen, state.step, dispatch])

  // El handler vive en un ref para que el efecto de abajo se monte UNA sola vez.
  // Si dependiera de `requestClose` —que cambia de identidad en cada render— su
  // cleanup correría en cada render y `restoreFocus` le robaría el foco al campo
  // que el comprador está escribiendo. Pasó: el paso 2 era imposible de llenar.
  const closeRef = useRef(requestClose)
  useEffect(() => { closeRef.current = requestClose }, [requestClose])

  // ─── Trap de foco + Esc ────────────────────────────────────────────────────
  useEffect(() => {
    restoreFocus.current = document.activeElement as HTMLElement
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); return }
      if (e.key !== 'Tab') return

      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusables?.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      restoreFocus.current?.focus?.()
    }
    // Sin dependencias a propósito: el modal monta y desmonta una vez.
  }, [])

  const stepIdx = state.step - 1

  // El pack elegido y su precio ya descontado. Es la única fuente del monto que
  // se le muestra Y del que se manda al backend: si se calcularan aparte podrían
  // discrepar, y cobrarle distinto a lo que vio es el peor error posible.
  const pack = packs.find(p => p.id === state.selectedPack) ?? null
  const price = pack ? effectivePrice(pack.precio, state.discountPen) : 0

  // El pack PRESELECCIONADO entra al estado sin pasar por `onSelect`, así que su
  // precio no llegaría solo — y el adelanto, que ahora es un porcentaje del
  // pedido, saldría 0 hasta que el comprador tocara otro pack. Se sincroniza
  // aquí, que es el único lugar que conoce los precios.
  useEffect(() => {
    if (pack && state.packPrice !== pack.precio) {
      dispatch({ type: 'SET_PACK', packId: pack.id, price: pack.precio })
    }
  }, [pack?.id, pack?.precio]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Fase 2 · el cobro. Solo existe con Culqi activo. ─────────────────────
  // Toma el teléfono y el OTP del estado EN el momento de cobrar, y el pedido
  // de la referencia explícita — jamás de un closure viejo.
  const charge = useCallback(async (ref: { token: string; orderCode: string; sessionId: string }) => {
    const res = await chargeAdvance({
      orderToken: ref.token, phone: state.culqiPhone, otp: state.culqiOtp,
    })
    if (res.ok) {
      trackEvent({ name: 'culqi_charge_ok', orderId: state.orderId, alreadyPaid: !!res.alreadyPaid })
      clearAdvancePending()
      phaseDispatch({ type: 'CHARGE_OK' })
      return
    }
    trackEvent({ name: 'culqi_charge_failed', orderId: state.orderId, stage: res.stage, code: res.code })
    // El OTP quemado no se re-muestra: single-use, y verlo lleno invita a
    // reenviar el mismo. El pedido pendiente queda en localStorage para que la
    // landing ofrezca terminar el pago si el comprador cierra el modal aquí.
    dispatch({ type: 'SET_CULQI_OTP', otp: '' })
    saveLastOrder(ref.token, ref.orderCode, submitContext?.productId ?? null, {
      advancePending: true, culqiPhone: state.culqiPhone,
    })
    phaseDispatch({ type: 'CHARGE_FAILED', fail: { stage: res.stage, code: res.code, userMessage: res.userMessage } })
  }, [state.culqiPhone, state.culqiOtp, state.orderId, submitContext, dispatch])

  const submit = useCallback(async () => {
    if (!submitContext) {
      setSubmitError('Falta la configuración de la tienda (modo demo).')
      return
    }
    // Guard duro del doble tap: con un pago ya en marcha, este botón no existe
    // (el pie se desmonta), pero el guard queda por si algo lo re-monta.
    if (phase.k !== 'IDLE') return
    const culqiActive = culqiActiveFor(state)
    setSubmitError(null)
    dispatch({ type: 'SUBMITTING' })
    try {
      // ─── Fase 1 · el registro. Idempotente por checkout_id. ──────────────
      // SIEMPRE primero: si el pago falla, el pedido ya existe y Ventas tiene
      // el lead con todo — el comprador reintenta sin volver a llenar nada.
      const res = await submitOrder(state, {
        ...submitContext, price, packName: pack?.nombre ?? null,
      })
      const ref = {
        token: res.token, orderCode: res.order_id,
        sessionId: res.session_id ?? res.id ?? '',
      }
      // Sobrevive al cierre del modal: la landing ofrece volver al pedido.
      saveLastOrder(res.token, res.order_id, submitContext.productId ?? null)
      dispatch({ type: 'SUBMITTED' })
      trackEvent({ name: 'order_submitted', orderId: state.orderId })
      // El borrador deja de existir: un pedido enviado no se reabre.
      co.clear()

      if (!culqiActive) {
        // Flujo manual: directo a la pantalla final, como siempre.
        phaseDispatch({ type: 'REGISTERED_MANUAL', ...ref })
        return
      }
      phaseDispatch({ type: 'REGISTERED_CULQI', ...ref })
      await charge(ref)
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'error desconocido'
      dispatch({ type: 'ERROR' })
      // El estado NO se borra: el comprador reintenta sin volver a llenar nada.
      setSubmitError(COPY.submitError)
      trackEvent({ name: 'order_failed', orderId: state.orderId, reason })
    }
  }, [state, submitContext, price, pack, dispatch, co, phase.k, charge])

  // Retry del cobro: SOLO desde CHARGE_FAILED, y jamás re-registra.
  const retryCharge = useCallback(async () => {
    if (phase.k !== 'CHARGE_FAILED') return
    const ref = { token: phase.token, orderCode: phase.orderCode, sessionId: phase.sessionId }
    phaseDispatch({ type: 'RETRY' })
    await charge(ref)
  }, [phase, charge])

  // "Prefiero que me escriban": pedido registrado, pago para el asesor.
  const giveUp = useCallback(() => phaseDispatch({ type: 'GIVE_UP' }), [])

  // ─── CONFIRMING · red caída DESPUÉS de enviar el cargo ────────────────────
  // El dinero pudo salir: aquí NO hay botón de reintento. Se consulta el
  // estado real cada 4 s por ~1 min; si el webhook cuadró el pedido, esta
  // pantalla se vuelve la de éxito sola.
  useEffect(() => {
    if (phase.k !== 'CONFIRMING') return
    const token = phase.token
    let tries = 0
    let cancelled = false
    const id = setInterval(async () => {
      if (cancelled || ++tries > 15) { clearInterval(id); return }
      const v = await fetchPaymentVerification(token)
      if (!cancelled && v === 'MATCHED') {
        clearAdvancePending()
        phaseDispatch({ type: 'CONFIRMED' })
        clearInterval(id)
      }
    }, 4000)
    return () => { cancelled = true; clearInterval(id) }
  }, [phase])

  const onVoucher = useCallback(async (file: File) => {
    const path = await uploadVoucher(file, state.orderId)
    dispatch({ type: 'SET_VOUCHER', url: path, uploadedAt: new Date().toISOString() })
    trackEvent({ name: 'voucher_uploaded' })
  }, [state.orderId, dispatch])

  const submitting = state.status === 'SUBMITTING'
  const culqiActive = culqiActiveFor(state)
  const done = phase.k === 'DONE'

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={requestClose} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Completa tu pedido"
        className="fixed z-50 bg-white flex flex-col
          inset-x-0 bottom-0 rounded-t-3xl max-h-[95dvh]
          sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[90dvh] sm:w-[min(480px,calc(100%-2rem))] sm:rounded-3xl"
      >
        {/* ── Cabecera: progreso siempre visible ── */}
        <div className="px-5 pt-3 pb-2 flex-shrink-0">
          <div className="flex justify-center sm:hidden mb-2">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>

          <button
            onClick={requestClose}
            aria-label="Cerrar"
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center
              focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
          >
            <X size={16} className="text-gray-500" />
          </button>

          <div className="flex items-center gap-1.5" aria-hidden="true">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className="flex-1 h-1.5 rounded-full transition-colors"
                style={{ background: i <= stepIdx ? '#16A34A' : '#E5E7EB' }}
              />
            ))}
          </div>
          <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mt-1.5">
            Paso {state.step} de {TOTAL_STEPS} · {STEP_LABEL[stepIdx]}
          </p>
        </div>

        {state.discountPen > 0 && (
          <p className="mx-5 mb-2 text-[11px] font-black text-center rounded-xl py-1.5 flex-shrink-0"
            style={{ background: '#F0FDF4', color: '#15803D' }}>
            {COPY.exitApplied}
          </p>
        )}

        {/* ── Contenido del paso ── */}
        <div className="px-5 pb-4 overflow-y-auto flex-1">
          {state.step === 1 && (
            <Step1Pack
              packs={packs}
              unitPrice={unitPrice}
              selected={state.selectedPack}
              bestPackId={bestPackId}
              discountPen={state.discountPen}
              onSelect={packId => dispatch({
                type: 'SET_PACK', packId,
                price: packs.find(p => p.id === packId)?.precio ?? 0,
              })}
            />
          )}

          {state.step === 2 && (
            <Step2Delivery state={state} dispatch={dispatch} errors={errors} touch={touch} />
          )}

          {state.step === 3 && phase.k === 'IDLE' && (
            <Step3Confirm
              state={state}
              packName={pack?.nombre ?? null}
              price={price}
              yape={yape}
              culqi={culqiActive}
              errors={errors}
              touch={touch}
              onYapeCode={code => dispatch({ type: 'SET_YAPE_CODE', code })}
              onCulqiPhone={phone => dispatch({ type: 'SET_CULQI_PHONE', phone })}
              onCulqiOtp={otp => dispatch({ type: 'SET_CULQI_OTP', otp })}
              onAdvanceChoice={choice => dispatch({ type: 'SET_ADVANCE_CHOICE', choice })}
              onVoucher={onVoucher}
              submitError={submitError}
            />
          )}

          {/* ── Cobro en vuelo ── */}
          {phase.k === 'CHARGING' && (
            <div className="py-10 text-center">
              <Loader2 size={34} className="animate-spin mx-auto mb-4 text-green-600" />
              <p className="text-base font-black text-gray-900">{COPY.culqiCharging}</p>
              <p className="text-xs text-gray-400 mt-1">{COPY.culqiChargingHint}</p>
            </div>
          )}

          {/* ── Pedido creado + pago fallido: la pantalla que NO dice "error"
                a secas. Primero lo que SÍ pasó, después lo que falta. ── */}
          {phase.k === 'CHARGE_FAILED' && (
            <div className="py-2">
              <h2 className="text-xl font-black text-gray-900 mb-0.5">{COPY.culqiRetryTitle}</h2>
              <p className="text-sm text-gray-500 mb-1">{COPY.culqiRetryBody}</p>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">
                Tu pedido · <span className="text-gray-700">{phase.orderCode}</span>
              </p>

              <p role="alert" className="text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-4">
                {culqiFailureCopy(phase.fail)}
              </p>

              {canRetry(phase.fail) && (
                <CulqiYapeBox
                  state={state}
                  amount={state.advanceAmount}
                  errors={errors}
                  touch={touch}
                  onPhone={phone => dispatch({ type: 'SET_CULQI_PHONE', phone })}
                  onOtp={otp => dispatch({ type: 'SET_CULQI_OTP', otp })}
                  askNewOtp={needsNewOtp(phase.fail)}
                />
              )}

              {canRetry(phase.fail) && (
                <button
                  onClick={retryCharge}
                  disabled={!co.canAdvance}
                  className={`w-full mt-4 py-4 rounded-2xl font-black text-base text-white shadow-lg transition-transform active:scale-95
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500
                    ${co.canAdvance ? 'bg-green-500 shadow-green-200' : 'bg-green-300 cursor-not-allowed'}`}
                >
                  {COPY.culqiRetryCta}
                </button>
              )}

              {/* La salida sin pagar SIEMPRE existe: el pedido ya está
                  registrado y un asesor puede cobrar por el chat. */}
              <button
                onClick={giveUp}
                className="w-full mt-2.5 py-4 rounded-2xl bg-gray-100 text-gray-600 font-black text-sm
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
              >
                {COPY.culqiContactMe}
              </button>
            </div>
          )}

          {/* ── network_after: el dinero pudo salir. Sin botón de reintento —
                se consulta el estado real y esta pantalla se resuelve sola. ── */}
          {phase.k === 'CONFIRMING' && (
            <div className="py-10 text-center">
              <Loader2 size={34} className="animate-spin mx-auto mb-4 text-amber-500" />
              <p className="text-base font-black text-gray-900">{COPY.culqiConfirming}</p>
              <p className="text-xs text-gray-500 mt-2 px-6">{COPY.culqiConfirmingHint}</p>
              <button
                onClick={giveUp}
                className="mt-6 px-5 py-3 rounded-2xl bg-gray-100 text-gray-600 font-black text-sm
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
              >
                {COPY.culqiContactMe}
              </button>
            </div>
          )}

          {done && (
            <OrderDone
              orderCode={phase.orderCode}
              advance={state.advanceAmount}
              // El cargo Culqi exitoso llega ya verificado: la caja nace verde
              // y el polling ni se monta. Sin Culqi, el estado real de siempre.
              verification={phase.paid ? 'MATCHED' : state.payment.verification}
              token={phase.token}
              unpaid={phase.unpaid}
            />
          )}
        </div>

        {/* ── CTA sticky, dentro del safe area de iOS ── */}
        {/* El pie SOLO existe en fase IDLE: durante el cobro (CHARGING), el
            retry (CHARGE_FAILED), la confirmación (CONFIRMING) y la pantalla
            final, dejarlo montado es dejar armado el botón del doble cargo —
            cada una de esas pantallas ya trae sus propias acciones. */}
        {phase.k === 'IDLE' && (
          <div
            className="px-5 pt-3 border-t border-gray-100 flex-shrink-0 bg-white sm:rounded-b-3xl"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center gap-2">
              {state.step > 1 && !submitting && (
                <button
                  onClick={co.back}
                  className="flex items-center justify-center gap-1 px-4 py-4 rounded-2xl bg-gray-100 text-gray-600 font-black text-sm
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                >
                  <ArrowLeft size={16} /> Atrás
                </button>
              )}
              <button
                onClick={state.step === 3 ? submit : co.next}
                // `disabled` de verdad mientras se envía: es la última barrera
                // contra el doble tap. La otra es `checkout_id` en el backend.
                disabled={submitting}
                aria-disabled={!co.canAdvance || submitting}
                className={`flex-1 font-black py-4 rounded-2xl text-base shadow-lg transition-transform active:scale-95
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500
                  ${co.canAdvance && !submitting ? 'bg-green-500 text-white shadow-green-200' : 'bg-green-300 text-white cursor-not-allowed'}`}
              >
                {submitting ? COPY.submitting
                  : state.step === 3 ? (culqiActive ? COPY.culqiSubmit : COPY.submit)
                    : 'Continuar →'}
              </button>
            </div>

            {/* Un botón gris sin explicación se lee como un error. */}
            {!co.canAdvance && !submitting && state.step >= 2 && (
              <p className="text-[11px] text-gray-400 text-center mt-2">
                Completa los datos marcados para continuar
              </p>
            )}
          </div>
        )}
      </div>

      {/* Va DENTRO del fragmento pero fuera del panel: es un diálogo propio,
          centrado, por encima del checkout. */}
      {confirmingClose && (
        <ExitOffer
          offerDiscount={offerDiscount}
          onApplyDiscount={() => {
            dispatch({ type: 'APPLY_EXIT_DISCOUNT' })
            trackEvent({ name: 'exit_discount_applied', amount: EXIT_DISCOUNT_PEN })
            setConfirmingClose(false)
            // Vuelve al paso 1 para que vea los precios nuevos: el descuento que
            // no se ve no retiene a nadie.
            co.goTo(1)
          }}
          onCancel={() => setConfirmingClose(false)}
          onConfirm={() => { co.abandon(); onClose() }}
        />
      )}
    </>
  )
}

