// ─── Caja de pago con Flow, cuando hay deeplink ──────────────────────────────
// La hermana de `Pay360Box` para el otro riel. Solo se pinta cuando el servidor
// pudo sacar el enlace directo a Yape (`_shared/flow-yape-deeplink.ts`) y el
// comprador está en un celular; si no, el checkout navega a la página oficial
// de Flow y esta caja no existe.
//
// Lo que hereda de Pay360Box, y por qué:
//
// · **El botón es un `<a>` con `yapeHref()`, sin `target="_blank"`.** Es la
//   lección del primer pedido real de 360pay: desde la PWA instalada, el
//   universal link `https://www.yape.com.pe/…` abría la WEB de Yape y no la
//   app, y solo el esquema `intent://` la abre desde una Custom Tab. Y la
//   navegación tiene que ser la del propio tap: Chrome no entrega un
//   `intent://` a la app si sale de un script sin gesto del usuario — que es
//   justo por lo que acá hay un botón y no un `location.href` automático
//   apenas llega la respuesta.
// · **Esta pantalla NO se va.** Yape no devuelve al comprador: se cambia de app
//   a mano. El modal se queda esperando y consulta el pedido hasta ver el
//   `MATCHED`, así que volver es ver la compra confirmada. Es exactamente lo
//   que la página de espera de Flow no puede prometer, porque Android la
//   congela cuando el comprador se va a aprobar.
//
// Y lo que es propio de Flow:
//
// · **No hay código que teclear.** Con 360pay el respaldo es el código de pago;
//   acá el respaldo es la página oficial de Flow (`coupon.payUrl`), en un
//   enlace discreto debajo del botón: si la app no se abrió, el comprador sigue
//   teniendo dónde pagar sin volver a empezar.

import { ExternalLink, ShieldCheck } from 'lucide-react'
import { COPY } from '../../../lib/checkout/checkout.config'
import { yapeHref } from '../../../lib/checkout/yape-link'
import type { CouponRef } from '../../../lib/checkout/pay-phase'

export default function FlowYapeBox({ coupon }: { coupon: CouponRef }) {
  const link = coupon.deeplink

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-sm font-bold text-gray-900">{COPY.flowYapeTitle}</p>
      <p className="mt-1 text-xs text-gray-500">{COPY.flowYapeIntro}</p>

      <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
          {COPY.pay360AmountLabel}
        </span>
        <p className="text-2xl font-black text-gray-900">S/{coupon.amountPen}</p>
      </div>

      {link && (
        <a
          href={yapeHref(link, navigator.userAgent)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#742284] px-4 py-3.5 text-base font-black text-white active:scale-[0.99]"
        >
          {COPY.flowYapeCta}
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      )}

      {coupon.payUrl && (
        <a
          href={coupon.payUrl}
          className="mt-2 block text-center text-[12px] font-bold text-gray-500 underline"
        >
          {COPY.flowYapeFallback}
        </a>
      )}

      <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5">
        <p className="flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-wide text-emerald-700">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {COPY.pay360Secure}
        </p>
        <p className="mt-1 text-center text-[13px] leading-relaxed text-gray-600">
          {COPY.flowYapeAfterHint}
        </p>
      </div>

      {/* La ATRIBUCIÓN de la pasarela, al pie de la caja y junto a la
          descripción de la espera. Es lo único de esta pantalla que nombra al
          recaudador —para el comprador todo lo demás es Yape— y está porque
          Flow lo pide: aparecer nombrado, con su nombre comercial, donde se
          paga por su riel. Ver `COPY.flowGateway`.

          Fuera del recuadro verde y en gris: ese recuadro es el sello de
          confianza, y meterle una marca que el comprador no conoce le quita
          justo lo que hace. */}
      <p className="mt-2.5 text-center text-[12px] font-bold text-gray-500">
        {COPY.flowGateway}
      </p>
    </div>
  )
}
