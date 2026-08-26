// Símbolo y lockup de Kross — manual de marca v2.0, §3.
//
// La K se construye sobre una grilla de 5×5 módulos; el símbolo mide 4M × 5M
// (viewBox 112×140, módulo = 28). La junta —columna 2, fila 3— es el ÚNICO
// módulo en color: marca el punto donde se cruzan el brazo del pago y el brazo
// de la entrega. No decora, señala. Por eso no se colorea ningún otro módulo.
//
// Los colores salen de tokens (`--k-module` / `--k-joint`, en index.css) para
// que el mismo componente sirva en fondo oscuro (hueso + lima) y en fondo claro
// (ink + lima oscuro): el lima brillante desaparece sobre blanco.

const M = 28

export function KrossIcon({
  size = 40,
  joint,
  module = 'var(--k-module, #F2F2F0)',
  jointColor = 'var(--k-joint, #D4FF4F)',
  className,
}: {
  /** Alto del símbolo en px. El ancho sale solo: 4M × 5M. */
  size?: number
  /** Forzar/quitar la junta. Por defecto se apaga bajo 32 px (§3.6). */
  joint?: boolean
  /** Color de los módulos. Una sola tinta: pásalo y pon `joint={false}`. */
  module?: string
  jointColor?: string
  className?: string
}) {
  // §3.6: bajo 32 px la junta mide menos de 3 px y se lee como suciedad.
  // La versión simplificada no es una excepción que se pide: es el default.
  const conJunta = joint ?? size >= 32

  return (
    <svg
      width={size * 4 / 5}
      height={size}
      viewBox={`0 0 ${M * 4} ${M * 5}`}
      className={className}
      role="img"
      aria-label="Kross"
      xmlns="http://www.w3.org/2000/svg">
      <g fill={module}>
        <rect x="0" y="0" width={M} height={M * 5} />{/* astil */}
        <rect x={M * 2} y={M} width={M} height={M} />{/* brazo superior */}
        <rect x={M * 3} y="0" width={M} height={M} />
        <rect x={M * 2} y={M * 3} width={M} height={M} />{/* brazo inferior */}
        <rect x={M * 3} y={M * 4} width={M} height={M} />
      </g>
      {conJunta && <rect x={M} y={M * 2} width={M} height={M} fill={jointColor} />}
    </svg>
  )
}

/**
 * La bajada del lockup. Nunca va sola ni bajo 11 px (§3.4).
 *
 * OJO: el manual escrito dice "VENDE, COBRA Y DESPACHA", pero el archivo de
 * marca que se está usando trae esta otra. Manda el archivo hasta que se
 * decida cuál es la definitiva; está anotado en §10.1 del manual.
 */
const BAJADA = 'LA TECNOLOGÍA DE TU TIENDA'

export function KrossLockup({
  size = 28,
  bajada = false,
  module,
  jointColor,
  className,
}: {
  /** Alto del símbolo en px; el resto del lockup se deriva de su módulo. */
  size?: number
  bajada?: boolean
  module?: string
  jointColor?: string
  className?: string
}) {
  const m = size / 5
  // §3.4: la altura de la palabra es 3M. Eso es altura de MAYÚSCULA, no cuerpo:
  // en Inter la mayúscula mide 0.727em, así que el cuerpo sale de dividir.
  const cuerpo = (m * 3) / 0.727
  const cuerpoBajada = Math.max(11, m * 1.6)
  const muestraBajada = bajada && cuerpoBajada >= 11

  return (
    <span className={`inline-flex items-center ${className ?? ''}`} style={{ gap: m }}>
      <KrossIcon size={size} module={module} jointColor={jointColor} />
      <span className="inline-flex flex-col" style={{ gap: m * 0.35 }}>
        <span style={{
          fontSize: cuerpo,
          lineHeight: 1,
          fontWeight: 500,
          letterSpacing: '0.08em',
          color: 'var(--k-module, #F2F2F0)',
        }}>
          KROSS
        </span>
        {muestraBajada && (
          <span style={{
            fontSize: cuerpoBajada,
            lineHeight: 1,
            fontWeight: 400,
            letterSpacing: '0.12em',
            color: 'var(--k-joint, #D4FF4F)',
          }}>
            {BAJADA}
          </span>
        )}
      </span>
    </span>
  )
}
