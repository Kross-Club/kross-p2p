import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock, CheckCircle2, CircleAlert } from 'lucide-react'
import PublicLayout from '../../components/publico/PublicLayout'
import { useCarrito } from '../../lib/carrito'
import { precioTexto, periodoTexto } from '../../config/catalogo'
import { EMPRESA } from '../../config/empresa'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ─── Checkout de la web pública ──────────────────────────────────────────────
// Cierra la compra: datos de facturación, resumen del pedido y confirmación con
// un código que el cliente puede citar.
//
// NOTA para quien conecte la pasarela: aquí NO se cobra todavía. El pedido se
// registra y el cobro se coordina con el cliente. Cuando Culqi esté habilitado,
// el importe a cobrar **debe calcularse en el servidor** (la Edge Function
// `web-order` ya guarda el detalle); lo que manda el navegador sirve para
// mostrar, nunca para cobrar.

type TipoCliente = 'natural' | 'empresa'

interface Errores { [campo: string]: string }

export default function PagoPage() {
  const { lineas, total, vaciar } = useCarrito()
  const [tipo, setTipo] = useState<TipoCliente>('empresa')
  const [form, setForm] = useState({ nombre: '', documento: '', email: '', telefono: '', nota: '' })
  const [acepta, setAcepta] = useState(false)
  const [errores, setErrores] = useState<Errores>({})
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState('')
  const [codigo, setCodigo] = useState<string | null>(null)

  const set = (campo: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }))

  const validar = (): boolean => {
    const e: Errores = {}
    const doc = form.documento.replace(/\D/g, '')
    if (form.nombre.trim().length < 3) e.nombre = tipo === 'empresa' ? 'Escribe la razón social.' : 'Escribe tu nombre completo.'
    if (tipo === 'empresa' ? doc.length !== 11 : doc.length !== 8) {
      e.documento = tipo === 'empresa' ? 'El RUC tiene 11 dígitos.' : 'El DNI tiene 8 dígitos.'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) e.email = 'Escribe un correo válido.'
    if (form.telefono.replace(/\D/g, '').length < 9) e.telefono = 'Escribe un teléfono de 9 dígitos.'
    if (!acepta) e.acepta = 'Necesitamos tu aceptación para continuar.'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!validar()) return
    setEnviando(true)
    setFallo('')
    try {
      const res = await fetch(`${BASE}/web-order`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo_cliente: tipo,
          nombre: form.nombre.trim(),
          documento: form.documento.replace(/\D/g, ''),
          email: form.email.trim(),
          telefono: form.telefono.replace(/\D/g, ''),
          nota: form.nota.trim(),
          items: lineas.map((l) => ({
            slug: l.item.slug, nombre: l.item.nombre, qty: l.qty,
            precio_unitario: l.item.precio, periodo: l.item.periodo,
          })),
          total_mostrado: total,
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const { codigo } = await res.json()
      setCodigo(codigo)
      vaciar()
    } catch {
      setFallo('No pudimos registrar tu pedido. Revisa tu conexión e inténtalo otra vez.')
    } finally {
      setEnviando(false)
    }
  }

  if (codigo) return <Confirmacion codigo={codigo} />

  if (lineas.length === 0) {
    return (
      <PublicLayout>
        <div className="max-w-[720px] mx-auto px-5 py-24 text-center">
          <p className="font-black text-xl">Tu carrito está vacío</p>
          <p className="text-gray-500 mt-2">Agrega un servicio para continuar con el pago.</p>
          <Link to="/servicios" className="inline-block mt-5 px-6 py-3 rounded-2xl font-black text-sm text-white"
            style={{ background: 'var(--brand-dark)' }}>
            Ver servicios
          </Link>
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <div className="max-w-[1000px] mx-auto px-5 py-12 grid gap-10 md:grid-cols-[1.2fr_.8fr]">
        <form onSubmit={enviar} noValidate>
          <h1 className="text-3xl font-black">Datos de facturación</h1>
          <p className="text-gray-600 mt-2">
            Con estos datos emitimos tu comprobante y activamos el servicio.
          </p>

          <div className="flex gap-2 mt-6">
            {(['empresa', 'natural'] as TipoCliente[]).map((t) => (
              <button key={t} type="button" onClick={() => { setTipo(t); setErrores({}) }}
                className={`flex-1 py-3 rounded-2xl font-black text-sm border-2 ${
                  tipo === t ? 'border-[var(--brand-dark)] bg-gray-50' : 'border-gray-200 text-gray-500'
                }`}>
                {t === 'empresa' ? 'Empresa (RUC)' : 'Persona natural (DNI)'}
              </button>
            ))}
          </div>

          <Campo label={tipo === 'empresa' ? 'Razón social' : 'Nombre completo'} error={errores.nombre}>
            <input value={form.nombre} onChange={set('nombre')} autoComplete="organization"
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 outline-none focus:border-gray-900" />
          </Campo>

          <Campo label={tipo === 'empresa' ? 'RUC' : 'DNI'} error={errores.documento}>
            <input value={form.documento} onChange={set('documento')} inputMode="numeric"
              maxLength={tipo === 'empresa' ? 11 : 8}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 outline-none focus:border-gray-900" />
          </Campo>

          <Campo label="Correo electrónico" error={errores.email}>
            <input value={form.email} onChange={set('email')} type="email" autoComplete="email"
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 outline-none focus:border-gray-900" />
          </Campo>

          <Campo label="Teléfono / WhatsApp" error={errores.telefono}>
            <input value={form.telefono} onChange={set('telefono')} inputMode="tel" maxLength={12} autoComplete="tel"
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 outline-none focus:border-gray-900" />
          </Campo>

          <Campo label="Comentario (opcional)">
            <textarea value={form.nota} onChange={set('nota')} rows={3} maxLength={500}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 outline-none focus:border-gray-900 resize-none" />
          </Campo>

          <label className="flex gap-3 mt-5 text-sm text-gray-600">
            <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-1" />
            <span>
              He leído y acepto los{' '}
              <Link to="/terminos" className="underline font-bold" target="_blank">Términos y condiciones</Link>,
              la{' '}
              <Link to="/cambios-y-devoluciones" className="underline font-bold" target="_blank">Política de cambios y devoluciones</Link>{' '}
              y la{' '}
              <Link to="/privacidad" className="underline font-bold" target="_blank">Política de privacidad</Link>.
            </span>
          </label>
          {errores.acepta && <p className="text-xs text-red-600 font-bold mt-1">{errores.acepta}</p>}

          {fallo && (
            <p className="flex items-center gap-2 mt-5 text-sm font-bold text-red-600">
              <CircleAlert size={16} /> {fallo}
            </p>
          )}

          <button type="submit" disabled={enviando}
            className="w-full mt-6 py-4 rounded-2xl font-black text-white disabled:opacity-50 active:scale-[.99] transition-transform"
            style={{ background: 'var(--brand-dark)' }}>
            {enviando ? 'Registrando…' : `Confirmar pedido · ${precioTexto(total)}`}
          </button>

          <p className="flex items-center gap-2 text-xs text-gray-500 mt-4">
            <Lock size={14} className="text-green-600" />
            Tus datos viajan cifrados (HTTPS) y se usan solo para tu comprobante y la activación.
          </p>
        </form>

        <aside className="rounded-3xl border border-gray-200 p-6 h-fit md:sticky md:top-24">
          <h2 className="font-black">Resumen del pedido</h2>
          <ul className="mt-4 space-y-3">
            {lineas.map(({ item, qty, subtotal }) => (
              <li key={item.slug} className="flex gap-3 text-sm">
                <img src={item.imagen} alt="" className="w-12 h-12 rounded-xl object-cover bg-gray-100" />
                <div className="flex-1">
                  <p className="font-bold leading-tight">{item.nombre}</p>
                  <p className="text-xs text-gray-500">
                    {qty} × {precioTexto(item.precio)} {periodoTexto(item.periodo)}
                  </p>
                </div>
                <p className="font-black">{precioTexto(subtotal)}</p>
              </li>
            ))}
          </ul>
          <div className="border-t border-gray-200 mt-5 pt-4 flex items-center justify-between">
            <span className="font-black">Total</span>
            <span className="text-2xl font-black">{precioTexto(total)}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">IGV incluido.</p>
          <Link to="/carrito" className="block text-center text-sm font-bold text-gray-500 hover:text-gray-900 mt-4">
            Editar carrito
          </Link>
        </aside>
      </div>
    </PublicLayout>
  )
}

function Campo({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block mt-4">
      <span className="text-xs font-black text-gray-500 uppercase tracking-wide">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error && <p className="text-xs text-red-600 font-bold mt-1">{error}</p>}
    </label>
  )
}

function Confirmacion({ codigo }: { codigo: string }) {
  return (
    <PublicLayout>
      <div className="max-w-[640px] mx-auto px-5 py-20 text-center">
        <CheckCircle2 size={52} className="mx-auto text-green-600" />
        <h1 className="text-3xl font-black mt-5">Pedido registrado</h1>
        <p className="text-gray-600 mt-3">
          Guardamos tu pedido con el código <b className="text-gray-900">{codigo}</b>. Te escribimos al
          correo que dejaste para coordinar el pago y activar el servicio.
        </p>
        <p className="text-sm text-gray-500 mt-4">
          Si tienes una consulta, cítanos ese código
          {EMPRESA.email ? <> escribiendo a <a href={`mailto:${EMPRESA.email}`} className="underline font-bold">{EMPRESA.email}</a></> : null}
          {EMPRESA.telefono ? <> o llamando al <a href={`tel:${EMPRESA.telefono.replace(/\s/g, '')}`} className="underline font-bold">{EMPRESA.telefono}</a></> : null}.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-8">
          <Link to="/" className="px-6 py-3 rounded-2xl font-black text-sm text-white" style={{ background: 'var(--brand-dark)' }}>
            Volver al inicio
          </Link>
          <Link to="/servicios" className="px-6 py-3 rounded-2xl font-black text-sm bg-gray-100 text-gray-700">
            Seguir viendo servicios
          </Link>
        </div>
      </div>
    </PublicLayout>
  )
}
