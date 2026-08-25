import { KrossIcon, KrossLockup } from './KrossLogo'

// La firma que va arriba del panel. Sigue a la marca que estás operando:
//  · Kross (plataforma) → el lockup del manual (§3.4)
//  · una tienda         → su logo y su nombre; si no tiene logo, el símbolo
//
// El COLOR del panel es siempre el de Kross (ink + lima). Lo que la marca
// aporta acá es identidad, no paleta: el vendedor tiene que saber de un
// vistazo en qué tienda está parado.
export default function BrandMark({
  brand,
  size = 28,
}: {
  brand: { nombre: string; logo_url: string | null } | null
  size?: number
}) {
  if (!brand || brand.nombre === 'Kross') return <KrossLockup size={size * 0.86} />

  return (
    <span className="flex items-center gap-2 min-w-0">
      {brand.logo_url ? (
        <span className="rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
          style={{ width: size, height: size }}>
          <img src={brand.logo_url} alt={brand.nombre} className="w-full h-full object-cover" />
        </span>
      ) : (
        <KrossIcon size={size} />
      )}
      <span className="truncate" style={{ color: 'var(--text)', fontWeight: 500, fontSize: size * 0.58 }}>
        {brand.nombre}
      </span>
    </span>
  )
}
