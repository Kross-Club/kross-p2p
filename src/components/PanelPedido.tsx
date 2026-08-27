import { useEffect } from 'react'
import { useIsDesktop } from '../lib/use-desktop'
import { PedidoVista } from '../pages/vendedor/VendedorPedidoPage'

// ─── El pedido, como panel que entra por la derecha ──────────────────────────
//
// Abrir un pedido era irse de Pedidos: la lista se perdía, y volver costaba
// otra consulta y volver a encontrar dónde estabas. Con cien pedidos al día,
// ese viaje se paga cien veces.
//
// El panel encima resuelve las dos cosas: la lista sigue ahí detrás —el
// contexto no se pierde— y cerrar es un gesto, no una navegación. El token vive
// en la URL (`?pedido=`), así que "atrás" cierra el panel y el enlace se puede
// mandar; la ruta `/vendedor/pedido/:token` sigue existiendo para lo que llega
// de afuera (notificaciones, enlaces viejos, el historial del cliente).
//
// Es el MISMO componente que la página, no una copia: un pedido que se comporta
// distinto según por dónde se abrió sería otra pantalla que mantener.

export default function PanelPedido({ token, onCerrar }: {
  token: string
  onCerrar: () => void
}) {
  const desktop = useIsDesktop()

  // Escape cierra. Es lo que uno intenta antes de buscar la X, y en un panel
  // que tapa la pantalla entera no tenerlo se siente como estar atrapado.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  // El fondo no scrollea mientras el panel está abierto: si no, la rueda del
  // mouse mueve la lista de atrás cuando el puntero sale del panel.
  useEffect(() => {
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = antes }
  }, [])

  const velo = (
    <div className="absolute inset-0 panel-velo" style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onCerrar} aria-hidden="true" />
  )

  const panel = (ancho: string) => (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pedido"
      className="absolute inset-y-0 right-0 flex flex-col shadow-2xl panel-derecha"
      style={{ width: ancho }}
    >
      <PedidoVista token={token} enPanel onCerrar={onCerrar} />
    </div>
  )

  // ── Móvil: ocupa la pantalla, que es lo mismo que hacía la página ────────
  if (!desktop) {
    return (
      <div className="fixed inset-0 z-50">
        {velo}
        {panel('100%')}
      </div>
    )
  }

  // ── Escritorio: pegado al marco del panel, no a la ventana ───────────────
  //
  // En PC la app es una tarjeta 16:9 centrada, con margen gris alrededor
  // (`Layout`). Un panel anclado a la VENTANA se desbordaría sobre ese gris y
  // se vería como otra aplicación encima. Se repite acá la misma caja —mismas
  // medidas, mismo `p-4`— y el panel entra dentro de ella, recortado por sus
  // esquinas redondeadas.
  //
  // `pointer-events-none` en la capa de fuera: hacer clic en el gris de los
  // bordes no debería cerrar nada, porque ahí no hay nada.
  return (
    <div className="fixed inset-4 z-50 flex items-center justify-center pointer-events-none">
      <div
        className="relative overflow-hidden rounded-2xl pointer-events-auto"
        style={{ width: 'min(1440px, 100%, calc((100vh - 2rem) * 16 / 9))', aspectRatio: '16 / 9' }}
      >
        {velo}
        {/* Deja ver la lista de atrás por la izquierda: el panel es una capa
            encima del trabajo, no un reemplazo del trabajo. */}
        {panel('min(1100px, 100%)')}
      </div>
    </div>
  )
}
