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
import { COPY, EXIT_DISCOUNT_ONCE, EXIT_DISCOUNT_PEN, PAY360_POLL_MS, onlinePayActiveFor, preferredRailFor } from '../../lib/checkout/checkout.config'
import { trackEvent } from '../../lib/checkout/analytics'
import type { CheckoutState, StoreFlow, StorePay360 } from '../../lib/checkout/types'
import { esRielEnLinea } from '../../../supabase/functions/_shared/comision.ts'
import type { Proveedor } from '../../../supabase/functions/_shared/comision.ts'
import type { CheckoutAbMode } from '../../lib/checkout/variant'
import { effectivePrice } from '../../lib/checkout/product-packs'
import { fetchPaymentVerification, submitOrder } from '../../lib/checkout/services/OrderService'
import { issueCoupon } from '../../lib/checkout/services/Pay360Service'
import { createFlowOrder, goToFlow } from '../../lib/checkout/services/FlowService'
import Pay360Box from './payment/Pay360Box'
import { saveLastOrder } from '../../lib/checkout/persistence'
import { orderRegistered, payPhaseReducer } from '../../lib/checkout/pay-phase'
import type { SubmitContext } from '../../lib/checkout/services/OrderService'
import Step1Pack from './steps/Step1Pack'
import type { PackOption } from './steps/Step1Pack'
import Step2Delivery from './steps/Step2Delivery'
import Step3Confirm from './steps/Step3Confirm'
import OrderDone from './steps/OrderDone'
import ExitOffer from './ExitOffer'


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
  /** `stores.home_delivery_enabled`. Si es false la marca solo ofrece recojo en
   *  agencia y el checkout no muestra nunca la opción de entrega a domicilio. */
  homeDeliveryEnabled?: boolean
  /** Config 360pay de la tienda (columnas públicas). Puede llegar asíncrona. */
  pay360?: StorePay360 | null
  /** Íd. para Flow. Cuál de los dos cobra este pedido lo decide el servidor. */
  flow?: StoreFlow | null
  /** Cómo reparte la tienda el A/B (`stores.checkout_ab_mode`). Asíncrona igual
   *  que `pay360`: hasta que llegue vale el sorteo 50/50 de siempre. */
  abMode?: CheckoutAbMode
}

export default function CheckoutModal({
  packs, unitPrice, bestPackId, initialPack, onClose, onPartialLead,
  submitContext, homeDeliveryEnabled = true, pay360 = null, flow = null, abMode = 'SPLIT',
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
    dispatch({ type: 'SET_PAY360_CONFIG', pay360: pay360 ?? null })
  }, [pay360, dispatch])
  useEffect(() => {
    dispatch({ type: 'SET_FLOW_CONFIG', flow: flow ?? null })
  }, [flow, dispatch])

  // Igual que la de 360pay: llega asíncrona y con deps reales se corrige sola.
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

  // Token del pedido en curso. Un ref y no una dep: el callback de emisión se
  // vuelve a llamar en el retry, y re-crearlo en cada cambio de fase reintroduce
  // el doble tap que el reducer justamente evita.
  const phaseRef = useRef('')
  // Y el riel, por la misma razón: el retry tiene que saber a qué servicio
  // volver a llamar, y lo decidió el servidor al registrar.
  const railRef = useRef<Proveedor | null>(null)
  useEffect(() => {
    if (phase.k !== 'IDLE' && 'token' in phase) { phaseRef.current = phase.token; railRef.current = phase.rail }
  }, [phase])

  // ─── Fase 2 · emitir: el cupón (360pay) o la orden (Flow) ─────────────────
  // Ninguna cobra: devuelven CÓMO pagar. Con 360pay el "sí, entró" llega por
  // el webhook y esta pantalla lo ve por el polling; con Flow el comprador SE
  // VA a la página de pago y vuelve solo, así que acá no hay espera — la fase
  // queda en ISSUING mientras el navegador navega.
  const issue = useCallback(async () => {
    if (railRef.current === 'FLOW') {
      const res = await createFlowOrder({ orderToken: phaseRef.current })
      if (res.ok) {
        if (res.alreadyPaid) {
          phaseDispatch({ type: 'PAID' })
          return
        }
        trackEvent({ name: 'flow_order_created', orderId: state.orderId })
        goToFlow(res.payUrl)
        return
      }
      trackEvent({ name: 'flow_issue_failed', orderId: state.orderId, stage: res.stage, code: res.code })
      phaseDispatch({ type: 'ISSUE_FAILED' })
      saveLastOrder(phaseRef.current, '', submitContext?.productId ?? null, { advancePending: true })
      return
    }
    const res = await issueCoupon({ orderToken: phaseRef.current })
    if (res.ok) {
      if (res.alreadyPaid) {
        phaseDispatch({ type: 'PAID' })
        return
      }
      trackEvent({ name: 'pay360_coupon_issued', orderId: state.orderId })
      phaseDispatch({ type: 'COUPON_ISSUED', coupon: {
        deeplink: res.deeplink, consumerCode: res.consumerCode, amountPen: res.amountPen,
      } })
      return
    }
    trackEvent({ name: 'pay360_issue_failed', orderId: state.orderId, stage: res.stage, code: res.code })
    phaseDispatch({ type: 'ISSUE_FAILED' })
    // El pedido YA existe: se marca para que la landing ofrezca retomarlo.
    saveLastOrder(phaseRef.current, '', submitContext?.productId ?? null, { advancePending: true })
  }, [state.orderId, submitContext])

  const submit = useCallback(async () => {
    if (!submitContext) {
      setSubmitError('Falta la configuración de la tienda (modo demo).')
      return
    }
    // Guard duro del doble tap: con un pago ya en marcha, este botón no existe
    // (el pie se desmonta), pero el guard queda por si algo lo re-monta.
    if (phase.k !== 'IDLE') return
    const onlineActive = onlinePayActiveFor(state)
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

      // El riel lo dijo el SERVIDOR (`payment_provider`, por monto). Si la
      // función desplegada es anterior al ruteo y no lo devuelve, se sigue con
      // lo que el front prefirió: una tienda solo con 360pay cobra igual.
      const rail: Proveedor | null = res.payment_provider === undefined
        ? (preferredRailFor(state) ?? null)
        : esRielEnLinea(res.payment_provider) ? res.payment_provider : null
      if (onlineActive && rail) {
        phaseRef.current = ref.token
        railRef.current = rail
        phaseDispatch({ type: 'REGISTERED_ONLINE', ...ref, rail })
        await issue()
        return
      }
      // Sin cobro en línea: directo a la pantalla final. Es el camino de las
      // marcas que no tienen ningún riel y el de los pedidos sin adelanto.
      phaseDispatch({ type: 'REGISTERED_MANUAL', ...ref, rail: null })
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'error desconocido'
      dispatch({ type: 'ERROR' })
      // El estado NO se borra: el comprador reintenta sin volver a llenar nada.
      setSubmitError(COPY.submitError)
      trackEvent({ name: 'order_failed', orderId: state.orderId, reason })
    }
  }, [state, submitContext, price, pack, dispatch, co, phase.k, issue])

  // ─── La espera del pago ───────────────────────────────────────────────────
  // El comprador se fue a Yape, en otra app. Aquí se consulta el pedido hasta
  // ver el MATCHED que dejó el webhook. No hay timeout que corte: el pedido ya
  // está registrado y la pantalla dice que se puede cerrar, así que seguir
  // consultando mientras esté abierta no le cuesta nada y le ahorra el susto de
  // volver y no ver su pago reflejado.
  useEffect(() => {
    if (phase.k !== 'AWAITING') return
    let alive = true
    const tick = async () => {
      const v = await fetchPaymentVerification(phase.token)
      if (!alive) return
      if (v === 'MATCHED') phaseDispatch({ type: 'PAID' })
    }
    const id = setInterval(tick, PAY360_POLL_MS)
    void tick()
    return () => { alive = false; clearInterval(id) }
  }, [phase])

  // Retry de la emisión: SOLO desde ISSUE_FAILED. El reducer ya lo impone; el
  // guard evita el viaje de red.
  const retryIssue = useCallback(async () => {
    if (phase.k !== 'ISSUE_FAILED') return
    phaseDispatch({ type: 'RETRY' })
    await issue()
  }, [phase.k, issue])


  const submitting = state.status === 'SUBMITTING'
  // La misma lectura que hace el submit: calcularla distinto aquí pintaría una
  // pantalla que no corresponde al cobro que después se ejecuta.
  const onlineActive = onlinePayActiveFor(state)
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
              onlinePay={onlineActive}
              onAdvanceChoice={choice => dispatch({ type: 'SET_ADVANCE_CHOICE', choice })}
              submitError={submitError}
            />
          )}

          {/* ── Cobro en vuelo ── */}
          {/* 360pay · emitiendo el cupón. Dura lo que una llamada; sin pantalla
                propia el botón se quedaría mudo y el comprador volvería a tocar. */}
          {phase.k === 'ISSUING' && (
            <div className="py-10 text-center">
              <Loader2 size={34} className="animate-spin mx-auto mb-4 text-[#742284]" />
              {/* Con Flow el comprador está a punto de SALIR de la PWA: se le
                  dice a dónde va y que vuelve solo, antes de que la pantalla
                  cambie. Sin nombrar el motor — para él es Yape. */}
              <p className="text-base font-black text-gray-900">
                {phase.rail === 'FLOW' ? COPY.flowRedirecting : COPY.submitting}
              </p>
              {phase.rail === 'FLOW' && (
                <p className="mt-1.5 px-4 text-[13px] leading-relaxed text-gray-600">{COPY.flowRedirectingHint}</p>
              )}
            </div>
          )}

          {/* Sin salida de "prefiero que me escriban": el adelanto se paga
              aquí, y ofrecer la alternativa justo en la espera invitaba a
              abandonar un cobro ya emitido. El escape sigue existiendo SOLO en
              ISSUE_FAILED, donde no hay cupón que pagar hasta que el retry
              funcione. */}
          {phase.k === 'AWAITING' && (
            <div className="py-2">
              <Pay360Box coupon={phase.coupon} />
              <div className="mt-4 flex items-center justify-center gap-2 text-center">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-[#742284]" />
                <p className="text-lg font-black text-gray-900">{COPY.pay360Waiting}</p>
              </div>
              <p className="mt-1.5 px-4 text-center text-[13px] leading-relaxed text-gray-600">{COPY.pay360WaitingHint}</p>
            </div>
          )}

          {phase.k === 'ISSUE_FAILED' && (
            <div className="py-2 text-center">
                {/* Primero lo que SÍ pasó. El pedido existe: decir "error" a
                    secas empuja a rehacer una compra que ya está hecha. */}
              <h2 className="mb-0.5 text-xl font-black text-gray-900">{COPY.paymentPendingTitle}</h2>
              <p className="mb-3 text-sm text-gray-500">{COPY.paymentPendingBody}</p>
              <p className="mb-4 text-sm text-gray-700">{COPY.pay360IssueFailed}</p>
              <button
                type="button"
                onClick={retryIssue}
                className="w-full rounded-xl bg-[#742284] px-4 py-3.5 text-base font-black text-white"
              >
                {COPY.retryPaymentCta}
              </button>
              <button
                type="button"
                onClick={() => phaseDispatch({ type: 'GIVE_UP' })}
                className="mt-2 w-full py-2 text-xs font-bold text-gray-400 underline"
              >
                {COPY.contactMeInstead}
              </button>
            </div>
          )}

          {done && (
            <OrderDone
              orderCode={phase.orderCode}
              state={state}
              price={price}
              packName={pack?.nombre ?? null}
              // El pago ya confirmado por el webhook llega verificado: la caja
              // nace verde y el polling ni se monta. Si no, el estado real.
              verification={phase.paid ? 'MATCHED' : state.payment.verification}
              token={phase.token}
              unpaid={phase.unpaid}
            />
          )}
        </div>

        {/* ── CTA sticky, dentro del safe area de iOS ── */}
        {/* El pie SOLO existe en fase IDLE: durante la emisión (ISSUING), la
            espera del pago (AWAITING), el retry (ISSUE_FAILED) y la pantalla
            final, dejarlo montado es dejar armado el botón del doble cobro —
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
                {submitting ? COPY.submitting : state.step === 3 ? COPY.submit : 'Continuar →'}
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

