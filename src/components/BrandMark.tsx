import { KrossIcon, KrossLockup } from './KrossLogo'

// La firma que va arriba del panel. Sigue a la marca que estás operando:
//  · Kross (plataforma) → el lockup del manual (§3.4)
//  · una tienda         → su logo y su nombre; si no tiene logo, el símbolo
//
// El COLOR del panel es siempre el de Kross (ink + lima). Lo que la marca
// aporta acá es identidad, no paleta: el vendedor tiene que saber de un
// vistazo en qué tienda está parado.
//
// La única excepción es la PLACA del logo (08-set-2026). Un logo se sube con
// el aire que su diseñador le dio —márgenes transparentes, una caja que no es
// exactamente cuadrada—, y `object-contain` respeta ese aire sin tocarlo: lo
// correcto para el logo, pero contra el panel oscuro esos márgenes se leen
// como huecos y el logo parece flotar encogido en su casilla. Así que el aire
// se rellena con el color primario de la marca. El logo sigue entero y sin
// recortar, y su casilla se ve maciza. Un logo que YA trae su propio fondo del
// mismo color —el caso normal— no se nota que tiene placa: encaja al ras.
export default function BrandMark({
  brand,
  size = 28,
  soloLogo = false,
}: {
  brand: {
    nombre: string
    logo_url: string | null
    logo_wide_url?: string | null
    /** El relleno de la placa. Sin él, la placa no se pinta y el logo queda
     *  como estaba: nunca se inventa un color para una marca que no lo eligió. */
    color_primary?: string | null
  } | null
  size?: number
  /** Sin el nombre. El logo de una marca es 1:1, así que solo cabe él cuando el
   *  menú está plegado — y con el símbolo basta para saber dónde estás parado,
   *  que es todo lo que esta firma tiene que responder. */
  soloLogo?: boolean
}) {
  if (!brand || brand.nombre === 'Kross') {
    return soloLogo ? <KrossIcon size={size} /> : <KrossLockup size={size * 0.86} />
  }

  const placa = brand.color_primary || undefined

  // Con logo APAISADO (07-set-2026) va él solo: un lockup ya trae el nombre
  // dibujado como la marca quiere que se lea, y escribirlo al lado en nuestra
  // tipografía lo dice dos veces y peor. Plegado no cabe: manda el cuadrado.
  //
  // La placa se estira hasta donde el contenedor la deje (tope 168 px, el ancho
  // útil del menú desplegado) y el logo se centra dentro: así la firma es una
  // sola pieza sólida de lado a lado, no un dibujo pequeño pegado a la
  // izquierda con oscuridad al costado. `rounded-lg` y no `xl` como el
  // cuadrado: el mismo radio sobre una placa baja y ancha la deja con forma de
  // píldora.
  if (!soloLogo && brand.logo_wide_url) {
    return (
      <span className="rounded-lg overflow-hidden flex items-center justify-center w-full max-w-[168px] flex-shrink"
        style={{ height: size, background: placa }}>
        <img src={brand.logo_wide_url} alt={brand.nombre} className="w-full h-full object-contain" />
      </span>
    )
  }

  return (
    <span className="flex items-center gap-2 min-w-0">
      {brand.logo_url ? (
        // `object-contain`: recortar el logo de una marca para que llene el
        // cuadrado es lo último que se debe hacer con un logo. Lo que llena el
        // cuadrado es la placa de atrás.
        <span className="rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
          style={{ width: size, height: size, background: placa }}>
          <img src={brand.logo_url} alt={brand.nombre} className="w-full h-full object-contain" />
        </span>
      ) : (
        <KrossIcon size={size} />
      )}
      {!soloLogo && (
        <span className="truncate" style={{ color: 'var(--text)', fontWeight: 500, fontSize: size * 0.58 }}>
          {brand.nombre}
        </span>
      )}
    </span>
  )
}
