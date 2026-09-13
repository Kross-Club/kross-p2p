import { useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import PublicLayout from '../../components/publico/PublicLayout'
import { llamarAlta, guardarTokenDeAlta } from '../../lib/alta-api'
import { referidoActual } from '../../lib/referido'
import {
  MOTIVO_DE_ALTA, revisarAlta, slugDeLaMarca,
} from '../../../supabase/functions/_shared/alta-de-tienda.ts'
import { APEX } from '../../lib/dominio'

// ─── `/empezar` — dos campos y a pagar (§54) ─────────────────────────────────
//
// Todo lo que hace falta para que exista una tienda: **cómo se llama la marca y
// cómo se llama quien la lleva**. El correo lo captura Stripe en el checkout,
// así que pedirlo acá sería pedirlo dos veces.
//
// Dos campos y no cinco es una decisión, no pereza. Cada campo antes del pago es
// gente que se va, y lo que falta —logo, colores, productos— se edita después
// en *Marca* sin que nadie se quede esperando. Lo único que NO se puede arreglar
// cómodamente después es el subdominio: cambiarlo rompe los enlaces ya enviados
// (§47). Por eso ese sí se le enseña antes de cobrarle, y se le enseña **en
// vivo**, derivado con la misma función que lo va a crear
// (`slugDeLaMarca`) — una copia en el front se separaría del servidor, y lo que
// se separaría es la promesa que se le hizo a alguien antes de cobrarle.
export default function EmpezarPage() {
  const [marca, setMarca] = useState('')
  const [nombre, setNombre] = useState('')
  const [yendo, setYendo] = useState(false)
  const [error, setError] = useState('')

  const slug = useMemo(() => slugDeLaMarca(marca), [marca])
  const mal = revisarAlta({ marca, nombre })
  // El motivo solo se pinta cuando la persona ya escribió algo: un formulario
  // que grita «escribe tu marca» antes de que toques nada es un regaño.
  const aviso = marca.trim() || nombre.trim() ? (mal ? MOTIVO_DE_ALTA[mal] : '') : ''

  const empezar = async () => {
    if (mal) return
    setYendo(true)
    setError('')
    const r = await llamarAlta<{ token: string; slug: string; url_pago: string }>({
      action: 'reservar',
      marca: marca.trim(),
      nombre: nombre.trim(),
      // Quién lo trajo (§51.b). El `localStorage` no sobrevive el viaje a
      // Stripe y de vuelta, así que la atribución se guarda AHORA, del lado del
      // servidor, pegada a esta intención.
      affiliate_ref: referidoActual(),
    })
    if (!r.ok || !r.data?.url_pago) {
      setError(r.data?.error ?? 'No pudimos empezar tu alta. Inténtalo otra vez.')
      setYendo(false)
      return
    }
    // El token, por si Stripe devuelve sin `?cs=` o el navegador lo pierde.
    guardarTokenDeAlta(r.data.token)
    window.location.href = r.data.url_pago
  }

  return (
    <PublicLayout>
      <div className="max-w-[560px] mx-auto px-5 py-16 md:py-24">
        <h1 className="text-[32px] md:text-[42px] leading-[1.08]">Crea tu tienda</h1>
        <p className="mt-4 text-base leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Dos datos y listo. Tu tienda queda lista apenas se confirme el pago, y entras a
          configurarla de una vez.
        </p>

        <div className="mt-9 space-y-5">
          <Campo
            label="El nombre de tu marca"
            value={marca}
            onChange={setMarca}
            placeholder="Mono Shop"
            autoFocus
          />

          {/* El subdominio, en vivo. Es lo único de esta pantalla que después
              cuesta cambiar, así que se ve antes de pagar y no después. */}
          <div className="text-[13px] min-h-[20px]" style={{ color: 'var(--text-faint)' }}>
            {slug.length >= 3 && (
              <>Tu tienda vivirá en{' '}
                <strong className="tabular" style={{ color: 'var(--text)' }}>{slug}.{APEX}</strong>
              </>
            )}
          </div>

          <Campo
            label="Tu nombre"
            value={nombre}
            onChange={setNombre}
            placeholder="Javier López"
          />
          <p className="text-[12px] -mt-3" style={{ color: 'var(--text-faint)' }}>
            Es el que verán tus clientes en el chat, y el que aparece cuando recomiendas Kross.
          </p>
        </div>

        {aviso && <p className="mt-5 text-[13px]" style={{ color: 'var(--warn-fg)' }}>{aviso}</p>}
        {error && <p className="mt-5 text-[13px]" style={{ color: 'var(--danger-fg)' }}>{error}</p>}

        <button
          type="button"
          onClick={() => void empezar()}
          disabled={!!mal || yendo}
          className="mt-8 w-full px-6 py-4 rounded-2xl text-sm k-cta inline-flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {yendo ? 'Llevándote al pago…' : <>Continuar al pago <ArrowRight size={16} /></>}
        </button>

        <p className="mt-4 text-[12px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
          El pago lo procesa Stripe. Al terminar vuelves aquí para elegir tu contraseña y entrar a
          tu panel. Puedes cancelar tu suscripción cuando quieras.
        </p>
      </div>
    </PublicLayout>
  )
}

function Campo({ label, value, onChange, placeholder, autoFocus }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--text-faint)' }}>
        {label}
      </span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        maxLength={80}
        className="mt-2 w-full px-4 py-3.5 rounded-2xl text-base"
        style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
      />
    </label>
  )
}
