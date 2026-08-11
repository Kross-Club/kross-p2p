import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { porSlug, type ItemCatalogo } from '../config/catalogo'

// ─── Carrito de la web pública ───────────────────────────────────────────────
// Vive en localStorage, no en la base: nadie tiene que crear una cuenta para
// armar su compra. El pedido recién toca el servidor cuando se confirma en
// /pago, y ahí sí queda registrado con su código.
//
// Guardamos SOLO el slug y la cantidad, nunca el precio. Si mañana sube el
// precio de un plan, el carrito guardado no puede seguir cobrando el viejo:
// el precio se resuelve siempre contra `CATALOGO` al leer.

const LS_KEY = 'kross_carrito'
/** Tope por línea: es una suscripción, no un mayorista. Evita el 999 accidental. */
const MAX_QTY = 20

export interface LineaGuardada { slug: string; qty: number }
export interface Linea { item: ItemCatalogo; qty: number; subtotal: number }

interface CarritoCtx {
  lineas: Linea[]
  /** Unidades totales — es lo que muestra el globo del header. */
  unidades: number
  total: number
  agregar: (slug: string, qty?: number) => void
  cambiarQty: (slug: string, qty: number) => void
  quitar: (slug: string) => void
  vaciar: () => void
}

const Ctx = createContext<CarritoCtx | null>(null)

function leer(): LineaGuardada[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    // Filtra lo que ya no existe en el catálogo: un slug retirado no puede
    // dejar el carrito roto ni cobrar algo que no se vende.
    return arr
      .filter((l): l is LineaGuardada => !!l && typeof l.slug === 'string' && !!porSlug(l.slug))
      .map((l) => ({ slug: l.slug, qty: clamp(Number(l.qty) || 1) }))
  } catch {
    return []
  }
}

const clamp = (n: number) => Math.max(1, Math.min(MAX_QTY, Math.trunc(n)))

export function CarritoProvider({ children }: { children: ReactNode }) {
  const [guardadas, setGuardadas] = useState<LineaGuardada[]>(leer)

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(guardadas)) } catch { /* modo privado */ }
  }, [guardadas])

  const value = useMemo<CarritoCtx>(() => {
    const lineas: Linea[] = guardadas.flatMap((g) => {
      const item = porSlug(g.slug)
      return item ? [{ item, qty: g.qty, subtotal: item.precio * g.qty }] : []
    })
    return {
      lineas,
      unidades: lineas.reduce((n, l) => n + l.qty, 0),
      total: lineas.reduce((n, l) => n + l.subtotal, 0),
      agregar: (slug, qty = 1) => {
        if (!porSlug(slug)) return
        setGuardadas((prev) => {
          const ya = prev.find((l) => l.slug === slug)
          if (ya) return prev.map((l) => (l.slug === slug ? { ...l, qty: clamp(l.qty + qty) } : l))
          return [...prev, { slug, qty: clamp(qty) }]
        })
      },
      cambiarQty: (slug, qty) =>
        setGuardadas((prev) =>
          qty <= 0
            ? prev.filter((l) => l.slug !== slug)
            : prev.map((l) => (l.slug === slug ? { ...l, qty: clamp(qty) } : l)),
        ),
      quitar: (slug) => setGuardadas((prev) => prev.filter((l) => l.slug !== slug)),
      vaciar: () => setGuardadas([]),
    }
  }, [guardadas])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCarrito(): CarritoCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCarrito debe usarse dentro de <CarritoProvider>')
  return ctx
}
