import { useEffect, useState } from 'react'
import { escuchar } from './realtime'
import { useDemo } from './demo/modo-demo'
import { tiendaDemo } from './demo/tienda-demo'

// ─── Quién está conectado ────────────────────────────────────────────────────
//
// El puntito verde. Lo tenía solo la Lista, con su propio canal y su propio
// `Set`; el Tablero y el chat lo mostraban a medias o no lo mostraban. Es el
// mismo dato —quién tiene la app abierta ahora— y por eso vive en un solo
// sitio, igual que la lista de pedidos (`useStoreOrders`).
//
// Saber si el cliente está en línea cambia lo que uno hace: a quien está mirando
// la pantalla se le escribe, y al que no, se le llama.

const VACIO: ReadonlySet<string> = new Set()

/**
 * Los `buyer_id` conectados en este momento.
 *
 * En demo sale del generador: la presencia real es de Supabase y en una tienda
 * de ejemplo nunca hay nadie: un tablero de mil pedidos al día donde ningún
 * cliente está conectado no enseña la herramienta, enseña un dato apagado.
 */
export function useCompradoresEnLinea(storeId: string | null | undefined): ReadonlySet<string> {
  const [enLinea, setEnLinea] = useState<ReadonlySet<string>>(VACIO)
  const demo = useDemo(storeId)

  useEffect(() => {
    let vivo = true

    if (demo) {
      tiendaDemo().then(t => { if (vivo) setEnLinea(new Set(t.enLinea)) })
      return () => { vivo = false }
    }

    const s = escuchar('presence:buyers', {
      presencia: estado => setEnLinea(new Set(Object.keys(estado))),
    })
    return () => { vivo = false; s.cerrar() }
  }, [demo])

  return enLinea
}
