import { useParams, Navigate } from 'react-router-dom'
import { anotarReferido } from '../../lib/referido'

// ─── `/u/:publicId` — la puerta del enlace de afiliado (§53) ─────────────────
//
// No es una página: es un apretón de manos. Anota quién trajo a este visitante
// y lo suelta en la web de siempre, que es lo que vino a ver. Un aterrizaje
// propio —"te invitó Fulano, continúa"— sería un peaje entre el clic y el
// producto, y el clic ya se gastó.
//
// La URL NO lleva nada legible. El código de una tienda es su slug, así que un
// enlace con el código publicaría el subdominio del comerciante —su dominio, su
// marca, su catálogo— a cualquiera que lo recibiera. Ocho dígitos opacos no
// dicen nada de nadie.
//
// El aviso de quién invitó lo pinta `PublicLayout`, arriba y en todas las
// páginas: el visitante no llega a decidir en esta pantalla, llega a decidir en
// la de planes, y ahí es donde el nombre de quien lo mandó todavía significa
// algo.
//
// ⚠️ Se anota ANTES de redirigir y en el cuerpo del componente, no en un
// efecto: el `Navigate` desmonta esto de inmediato y un efecto podría no llegar
// a correr. Escribir en `localStorage` no es un efecto secundario que haya que
// coordinar con React — nada de lo que se pinta depende de ello.
export default function InvitacionPage() {
  const { publicId } = useParams<{ publicId: string }>()
  anotarReferido(`/u/${publicId ?? ''}`)
  return <Navigate to="/" replace />
}
