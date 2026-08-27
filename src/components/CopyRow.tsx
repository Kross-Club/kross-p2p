import { useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'

/**
 * Fila copiable.
 *
 * En el celular del vendedor, teclear un DNI de memoria en otra app es donde
 * nacen los errores de una cifra. Vivía dentro de la ficha de contacto —el
 * modal que se abría tocando el avatar—; cuando esa ficha se disolvió en la
 * columna del pedido, el botón de copiar era lo único que no se podía perder.
 */
export default function CopyRow({ label, value, mono = true }: {
  label: string
  value: string
  mono?: boolean
}) {
  const [copiado, setCopiado] = useState(false)
  useEffect(() => {
    if (!copiado) return
    const t = setTimeout(() => setCopiado(false), 1500)
    return () => clearTimeout(t)
  }, [copiado])

  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>{label}</p>
        <p className={`text-xs truncate ${mono ? 'tabular' : ''}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{value}</p>
      </div>
      <button
        type="button"
        aria-label={`Copiar ${label}`}
        onClick={async () => {
          // Si el navegador niega el portapapeles el dato sigue en pantalla:
          // se puede seleccionar a mano. No hay nada que avisar.
          try { await navigator.clipboard.writeText(value); setCopiado(true) } catch { /* visible igual */ }
        }}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold flex-shrink-0"
        style={{ border: '0.5px solid var(--border)', color: 'var(--text-muted)' }}
      >
        {copiado ? <Check size={11} style={{ color: 'var(--ok-fg)' }} /> : <Copy size={11} />}
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}
