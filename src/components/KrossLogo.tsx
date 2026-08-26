import { useState } from 'react'

// Marca gráfica de Kross — manual §3.
//
// El logo REAL es un archivo de diseño, no código:
//
//   public/logo-kross.svg      → el lockup CON bajada (símbolo + KROSS + bajada)
//   public/simbolo-kross.svg   → solo el símbolo (opcional)
//
// Sobre fondo claro el hueso desaparece, así que si existen estas variantes se
// usan ahí:
//
//   public/logo-kross-claro.svg
//   public/simbolo-kross-claro.svg
//
// Si un archivo no está, se dibuja la versión de respaldo que hay más abajo:
// la misma K de 5×5 módulos del manual, con los colores tomados de los tokens.
// Así la app nunca muestra un logo roto — pero el que manda es el archivo.

const M = 28

/** ¿Estamos sobre una superficie oscura? Lo dice el tema aplicado al documento. */
function enOscuro() {
  return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
}

/**
 * Elige el archivo según la superficie; `null` = no está, hay que dibujar.
 *
 * Se recuerda QUÉ ruta falló, no un simple "falló": el tema puede resolverse
 * después del primer render (usePanelTheme lo aplica en un efecto), y si al
 * cambiar de superficie cambia el archivo, hay que volver a intentarlo.
 */
function useArchivo(base: string): { src: string | null; fallar: () => void } {
  const [fallado, setFallado] = useState<string | null>(null)
  const src = enOscuro() ? `/${base}.svg` : `/${base}-claro.svg`
  return { src: fallado === src ? null : src, fallar: () => setFallado(src) }
}

export function KrossIcon({
  size = 40,
  joint,
  module = 'var(--k-module, #F2F2F0)',
  jointColor = 'var(--k-joint, #D4FF4F)',
  className,
}: {
  /** Alto del símbolo en px. El ancho sale solo: 4M × 5M. */
  size?: number
  /** Solo aplica al respaldo dibujado: por defecto la junta se apaga bajo 32 px (§3.6). */
  joint?: boolean
  module?: string
  jointColor?: string
  className?: string
}) {
  const { src, fallar } = useArchivo('simbolo-kross')

  if (src) {
    return <img src={src} alt="Kross" onError={fallar} className={className}
      style={{ height: size, width: 'auto', display: 'block' }} />
  }

  // ── Respaldo dibujado (manual §3.1) ──
  // §3.6: bajo 32 px la junta mide menos de 3 px y se lee como suciedad.
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
 * La bajada del respaldo dibujado. Nunca va sola ni bajo 11 px (§3.4).
 *
 * OJO: el manual escrito dice "VENDE, COBRA Y DESPACHA", pero el archivo de
 * marca trae esta otra. Manda el archivo; está anotado en §10.1 del manual.
 */
const BAJADA = 'LA TECNOLOGÍA DE TU TIENDA'

/**
 * El lockup.
 *
 * `logo-kross.svg` trae la bajada dentro del mismo archivo, y a tamaño chico
 * esa bajada baja de 11 px, que es justo lo que el §3.4 prohíbe. Por eso el
 * archivo se usa SOLO cuando se pide con bajada (arriba de ~60 px, donde se
 * lee); para el resto se dibuja el lockup sin ella. El día que exista un
 * `logo-kross-simple.svg` sin bajada, se enchufa acá y se acabó el dibujo.
 */
export function KrossLockup({
  size = 28,
  bajada = false,
  module,
  jointColor,
  className,
}: {
  /** Alto del lockup en px (del archivo, o del símbolo en el respaldo). */
  size?: number
  bajada?: boolean
  module?: string
  jointColor?: string
  className?: string
}) {
  const { src, fallar } = useArchivo('logo-kross')

  if (bajada && src) {
    return <img src={src} alt="Kross" onError={fallar} className={className}
      style={{ height: size, width: 'auto', display: 'block' }} />
  }

  // ── Respaldo dibujado ──
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
