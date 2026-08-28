import { avanceDelPago, soles, valorDelPedido, cobradoDelPedido, saldoDelPedido } from '../lib/order-money'
import type { PedidoConPlata } from '../lib/order-money'

// ─── Cuánto de este pedido ya está pagado ────────────────────────────────────
//
// Un anillo, no un número. Con cincuenta pedidos en una columna, la pregunta no
// es "cuánto adelantó este" sino "a cuál corro primero", y eso se responde
// comparando — y una fracción se compara de un vistazo, un monto no.
//
//   · lleno   → pagado entero: plata que ya está en casa, solo falta despachar
//   · medio   → falta cobrar el saldo, y eso depende de que el cliente aparezca
//   · vacío   → no ha entrado nada verificado
//
// Solo cuenta lo que 360pay cruzó (`cobradoDelPedido`): un anillo lleno con un
// adelanto declarado y sin verificar sería la peor mentira posible, porque es
// justo la que hace despachar.

export default function AnilloAvance({ pedido, size = 22, sobreOscuro = false }: {
  pedido: PedidoConPlata
  size?: number
  /** Va encima de la cabecera del chat, que es oscura en los DOS temas. Ahí los
   *  tokens neutros no sirven: en claro `--warn-fg` y `--border-strong` están
   *  pensados para fondo hueso y desaparecen sobre el ink. El lima sí funciona
   *  en ambos, así que solo cambian el gris y la pista. */
  sobreOscuro?: boolean
}) {
  const { fraccion, completo, vacio } = avanceDelPago(pedido)
  const valor = valorDelPedido(pedido)
  const cobrado = cobradoDelPedido(pedido)
  const saldo = saldoDelPedido(pedido)

  const grosor = Math.max(2, Math.round(size * 0.14))
  const radio = (size - grosor) / 2
  const vuelta = 2 * Math.PI * radio
  // §6.1: solo el estado que CIERRA bien lleva color. Medio pagado no es una
  // alarma —es lo normal en este negocio— así que va en gris.
  const neutro = sobreOscuro ? 'rgba(255,255,255,0.65)' : 'var(--warn-fg)'
  const apagado = sobreOscuro ? 'rgba(255,255,255,0.35)' : 'var(--text-faint)'
  const pista = sobreOscuro ? 'rgba(255,255,255,0.22)' : 'var(--border-strong)'
  const color = completo ? 'var(--ok-fg)' : vacio ? apagado : neutro

  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Pagado ${Math.round(fraccion * 100)} por ciento`}
      title={completo
        ? `Pagado entero · ${soles(valor)}`
        : `Cobrado ${soles(cobrado)} de ${soles(valor)} · faltan ${soles(saldo)}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={radio} fill="none"
          stroke={pista} strokeWidth={grosor} opacity={sobreOscuro ? 1 : 0.45} />
        {!vacio && (
          <circle cx={size / 2} cy={size / 2} r={radio} fill="none"
            stroke={color} strokeWidth={grosor} strokeLinecap="round"
            strokeDasharray={`${vuelta * fraccion} ${vuelta}`}
            // Arranca arriba y gira como un reloj: cualquier otra cosa obliga a
            // pensar antes de leerlo.
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </svg>
    </span>
  )
}
