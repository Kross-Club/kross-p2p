import { useState } from 'react'
import { Wallet, ExternalLink, Check } from 'lucide-react'
import { puedePagarSaldo, soles } from '../lib/order-money'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ─── Pagar el saldo, desde el chat ───────────────────────────────────────────
//
// El pedido se cobra en dos momentos: el adelanto al cerrar el checkout, y el
// SALDO cuando ya hay guía. Ese segundo cobro se le prometía al comprador desde
// el primer mensaje —"tu saldo nos lo pagas por esta misma app, y apenas lo
// pagues te enviamos tu clave de recojo"— y no había por dónde pagarlo: había
// que pedírselo a un asesor por el chat.
//
// El botón emite el segundo cupón de 360pay y abre Yape con todo puesto. El
// resto es igual que el adelanto: 360pay cobra, el webhook confirma y el
// mensaje con la clave sale solo.
//
// Aparece cuando el saldo se puede pagar de verdad:
//
//   · queda saldo (adelantó una parte, no pagó todo),
//   · el adelanto YA está cruzado — antes no, y no es orden por orden: el
//     código de pago identifica al CLIENTE y el banco cobra siempre el cupón
//     pendiente más antiguo, así que con el adelanto sin pagar, quien viene a
//     pagar el saldo terminaría pagando el adelanto por otro monto,
//   · la tienda cobra en línea (`360PAY`). Sin eso, el saldo lo coordina el
//     asesor y prometer un botón que no cobra es peor que no ponerlo.

export interface PedidoConSaldo {
  token?: string
  product_price?: number | null
  advance_amount?: number | string | null
  payment_verification?: string | null
  payment_provider?: string | null
  saldo_verification?: string | null
}

export default function PagarSaldo({ pedido }: { pedido: PedidoConSaldo }) {
  const [pidiendo, setPidiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!puedePagarSaldo(pedido)) return null
  const falta = Math.max(0, Number(pedido.product_price ?? 0) - Number(pedido.advance_amount ?? 0))

  const pagar = async () => {
    if (pidiendo || !pedido.token) return
    setPidiendo(true); setError(null)
    try {
      const r = await fetch(`${BASE}/pay360-coupon`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_token: pedido.token, tipo: 'saldo' }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) {
        setError(d.user_message ?? 'No pudimos generar tu pago. Un asesor te escribirá para coordinarlo.')
        return
      }
      // Sin enlace NO se cae nada: el cupón existe igual y se paga tecleando el
      // código en "Pagar servicios" de Yape. Es el mismo camino que la caja del
      // checkout ya ofrece siempre, por paridad con escritorio.
      if (d.deeplink) window.location.href = d.deeplink
      else setError(`Abre Yape → Pagar servicios → 360Pay y usa tu código ${d.consumer_code ?? ''}`.trim())
    } catch {
      setError('No pudimos generar tu pago. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setPidiendo(false)
    }
  }

  return (
    <div className="mx-4 mt-2 rounded-2xl px-3 py-3"
      style={{ background: 'var(--ok-bg-soft)', border: '0.5px solid var(--ok-border)' }}>
      <p className="flex items-center gap-2 text-[12px] font-bold" style={{ color: 'var(--ok-fg)' }}>
        <Wallet size={14} className="flex-shrink-0" />
        Te queda un saldo de {soles(falta)}
      </p>
      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
        Págalo por aquí y te enviamos tu clave de recojo.
      </p>
      <button
        type="button"
        onClick={pagar}
        disabled={pidiendo}
        className="mt-2 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-black disabled:opacity-60"
        style={{ background: 'var(--ok-bg)', color: 'var(--ok-on)' }}
      >
        {pidiendo ? <Check size={14} /> : <ExternalLink size={14} />}
        {pidiendo ? 'Abriendo Yape…' : `Pagar ${soles(falta)} con Yape`}
      </button>
      {error && (
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--danger-fg)' }}>{error}</p>
      )}
    </div>
  )
}
