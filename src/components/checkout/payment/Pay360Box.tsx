// ─── Caja de pago con 360pay ─────────────────────────────────────────────────
// Lo que reemplaza al "yapea a este número y copia tu código": un botón que
// abre Yape con el servicio y el código ya puestos, y el monto fijado por el
// cupón del lado del servidor.
//
// Tres decisiones, todas heredadas de lo que ya se aprendió en YapeBox.tsx:
//
// · **Sí hay botón, y esta vez sí funciona.** El que se eliminó usaba `yape://`,
//   un esquema custom que Chrome Android no abre desde un enlace normal y que
//   en iOS lleva a la pantalla de error de Safari. Este es un universal link
//   `https://www.yape.com.pe/...`: Android e iOS lo resuelven, y si la app no
//   está instalada cae en una página web en vez de en un callejón sin salida.
//
// · **Paridad móvil/desktop, que aquí no es un lujo.** El flujo se graba en
//   tutoriales desde una laptop, y ninguna pantalla puede decir "ábrelo en tu
//   celular". Por eso el código de pago va SIEMPRE visible y copiable, no solo
//   cuando el botón falla: quien está en PC lo teclea en su Yape y sigue.
//
// · **El comprador no vuelve solo.** Yape no lo devuelve a la PWA — se cambia
//   de app a mano. La pantalla se lo dice antes de que se vaya, porque volver y
//   no entender qué pasó es donde se pierden los pedidos ya pagados.
//
// Y una cuarta que llegó del primer cupón real: **el botón puede no existir**.
// Si 360pay no manda enlace y la plataforma no tiene los identificadores del
// servicio, el cupón igual está emitido y se paga tecleando el código. Antes
// eso mataba el pedido; ahora la caja se reordena y el código pasa al frente,
// que es exactamente lo que ya se mostraba abajo para quien compra en PC.

import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { COPY, YAPE } from '../../../lib/checkout/checkout.config'
import type { CouponRef } from '../../../lib/checkout/pay-phase'

export default function Pay360Box({ coupon }: { coupon: CouponRef }) {
  const [copied, setCopied] = useState(false)
  const link = coupon.deeplink

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), YAPE.copiedFeedbackMs)
    return () => clearTimeout(t)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coupon.consumerCode)
      setCopied(true)
    } catch {
      // Sin permiso de portapapeles el código igual está a la vista y se puede
      // seleccionar a mano: no se le bloquea nada al comprador.
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-sm font-bold text-gray-900">{COPY.pay360Title}</p>
      <p className="mt-1 text-xs text-gray-500">
        {link ? COPY.pay360Intro : COPY.pay360IntroCodeOnly}
      </p>

      <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
          {COPY.pay360AmountLabel}
        </span>
        <p className="text-2xl font-black text-gray-900">S/{coupon.amountPen}</p>
      </div>

      {/* El monto no viaja en el enlace: lo resuelve Yape leyendo el cupón, y el
          comprador no puede editarlo. Por eso se puede prometer el monto exacto. */}
      {link && (
        <>
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#742284] px-4 py-3.5 text-base font-black text-white active:scale-[0.99]"
          >
            {COPY.pay360Cta}
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
          <p className="mt-2 text-center text-[11px] text-gray-400">{COPY.pay360AfterHint}</p>
        </>
      )}

      {/* Con botón esto es el respaldo, y aun así va SIEMPRE visible: en desktop
          es el camino principal, no el plan B. Sin botón es el único camino, y
          entonces no lleva separador ni rótulo de "¿pagas desde tu computadora?". */}
      <div className={link ? 'mt-4 border-t border-gray-100 pt-3' : 'mt-3'}>
        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
          {link ? COPY.pay360CodeLabel : COPY.pay360CodeLabelOnly}
        </span>
        <div className="mt-1 flex items-center gap-2">
          <code className="flex-1 select-all rounded-lg bg-gray-50 px-3 py-2 font-mono text-base font-bold tracking-wider text-gray-900">
            {coupon.consumerCode}
          </code>
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600"
          >
            {copied
              ? <><Check className="h-3.5 w-3.5" aria-hidden="true" />{COPY.yapeCopied}</>
              : <><Copy className="h-3.5 w-3.5" aria-hidden="true" />{COPY.pay360CodeCopy}</>}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">{COPY.pay360CodeHint}</p>
      </div>
    </div>
  )
}
