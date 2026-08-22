// ─── Caja de pago con 360pay ─────────────────────────────────────────────────
// Lo que reemplaza al "yapea a este número y copia tu código": un botón que
// abre Yape con el servicio y el código ya puestos, y el monto fijado por el
// cupón del lado del servidor.
//
// Tres decisiones, todas heredadas de lo que ya se aprendió en YapeBox.tsx:
//
// · **Sí hay botón, y esta vez sí funciona — pero solo en el celular.** El que
//   se eliminó usaba `yape://`, un esquema custom que Chrome Android no abre
//   desde un enlace normal y que en iOS lleva a la pantalla de error de Safari.
//   El servidor manda un universal link `https://www.yape.com.pe/...` — pero
//   desde la PWA INSTALADA ese enlace abría la página web de Yape, no la app:
//   los enlaces externos de una PWA standalone salen por una Custom Tab, y
//   Android no resuelve App Links para la URL inicial de una Custom Tab. Por
//   eso el `href` pasa por `yapeHref()`: en Android se vuelve un `intent://`
//   que abre la app de Yape directo (con la web como fallback si no está
//   instalada), y va sin `target="_blank"`, que rompía lo mismo en navegador.
//   En una PC el enlace solo abre la web de Yape — no cobra nada — así que ahí
//   el botón se oculta (`sm:hidden`) en vez de invitar a un clic muerto.
//
// · **Cada pantalla muestra UN camino.** En el celular, el botón: nadie va a
//   copiar un código teniendo Yape a un toque, y el código solo mete ruido
//   justo donde la confianza decide. En desktop, el código: quien está en PC
//   lo teclea en el Yape de su teléfono y sigue. El flujo se graba en
//   tutoriales desde una laptop, y ninguna pantalla dice "ábrelo en tu celular".
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
import { Check, Copy, ExternalLink, ShieldCheck } from 'lucide-react'
import { COPY, YAPE } from '../../../lib/checkout/checkout.config'
import { yapeHref } from '../../../lib/checkout/yape-link'
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
      {/* La intro describe el camino que ESTA pantalla muestra: en móvil el
          botón, en desktop (o sin enlace) el código. */}
      {link ? (
        <>
          <p className="mt-1 text-xs text-gray-500 sm:hidden">{COPY.pay360Intro}</p>
          <p className="mt-1 hidden text-xs text-gray-500 sm:block">{COPY.pay360IntroCodeOnly}</p>
        </>
      ) : (
        <p className="mt-1 text-xs text-gray-500">{COPY.pay360IntroCodeOnly}</p>
      )}

      <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
          {COPY.pay360AmountLabel}
        </span>
        <p className="text-2xl font-black text-gray-900">S/{coupon.amountPen}</p>
      </div>

      {/* El monto no viaja en el enlace: lo resuelve Yape leyendo el cupón, y el
          comprador no puede editarlo. Por eso se puede prometer el monto exacto.
          Solo móvil: en PC el universal link abre la web de Yape y no cobra.
          Sin `target="_blank"`: la navegación tiene que ser la del propio tap
          para que el sistema la entregue a la app; si Yape no está instalada,
          el fallback navega y el borrador + "Ver mi pedido" sostienen la vuelta. */}
      {link && (
        <a
          href={yapeHref(link, navigator.userAgent)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#742284] px-4 py-3.5 text-base font-black text-white active:scale-[0.99] sm:hidden"
        >
          {COPY.pay360Cta}
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      )}

      {/* El código: con enlace es el camino de desktop (en móvil se oculta y la
          pantalla queda en una sola acción, el botón); sin enlace es el único
          camino en cualquier pantalla. */}
      <div className={link ? 'mt-3 hidden sm:block' : 'mt-3'}>
        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
          {COPY.pay360CodeLabelOnly}
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
        <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">{COPY.pay360CodeHint}</p>
      </div>

      {/* La reafirmación va al final y en TODA pantalla: en móvil es LA
          indicación tras el botón; en desktop cierra tras el código. Por eso no
          es letra chica gris sino una tarjeta con sello de pago seguro. */}
      <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5">
        <p className="flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-wide text-emerald-700">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {COPY.pay360Secure}
        </p>
        <p className="mt-1 text-center text-[13px] leading-relaxed text-gray-600">
          {COPY.pay360AfterHint}
        </p>
      </div>
    </div>
  )
}
