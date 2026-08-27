import PanelDerecha from './PanelDerecha'
import { PedidoVista } from '../pages/vendedor/VendedorPedidoPage'

// ─── El pedido, en el cajón de la derecha ────────────────────────────────────
//
// Abrir un pedido era irse de Pedidos: la lista se perdía, y volver costaba
// otra consulta y volver a encontrar dónde estabas. Con cien pedidos al día,
// ese viaje se paga cien veces.
//
// El token vive en la URL (`?pedido=`), así que "atrás" cierra el cajón y el
// enlace se puede mandar; la ruta `/vendedor/pedido/:token` sigue existiendo
// para lo que llega de afuera (notificaciones, enlaces viejos).
//
// Es el MISMO componente que la página, no una copia: un pedido que se comporta
// distinto según por dónde se abrió sería otra pantalla que mantener.

export default function PanelPedido({ token, onCerrar }: {
  token: string
  onCerrar: () => void
}) {
  return (
    // Ancho: el pedido en escritorio son dos columnas —chat y contexto— y
    // necesita sitio para las dos, dejando ver la lista por la izquierda.
    <PanelDerecha etiqueta="Pedido" ancho="min(1100px, 100%)" onCerrar={onCerrar}>
      <PedidoVista token={token} enPanel onCerrar={onCerrar} />
    </PanelDerecha>
  )
}
