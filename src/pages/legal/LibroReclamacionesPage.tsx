import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Printer, CircleAlert, CheckCircle2 } from 'lucide-react'
import PublicLayout from '../../components/publico/PublicLayout'
import { EMPRESA, PLAZO_RESPUESTA_HABILES } from '../../config/empresa'
import { useStore, isPlatformHost } from '../../lib/store-context'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ─── LIBRO DE RECLAMACIONES VIRTUAL ──────────────────────────────────────────
// Formulario propio, dentro de la aplicación. La norma (D.S. 011-2011-PCM) y la
// pasarela exigen justo eso: nada de Google Forms, PDF suelto ni enlace a otro
// dominio. El consumidor llena la hoja, recibe su número correlativo y puede
// imprimirla o guardarla sin salir del sitio.
//
// La hoja se guarda en `complaints` vía la Edge Function `libro-reclamaciones`.

type Tipo = 'RECLAMO' | 'QUEJA'
type BienTipo = 'PRODUCTO' | 'SERVICIO'

interface Formulario {
  tipo: Tipo
  nombre: string
  docTipo: 'DNI' | 'CE' | 'PASAPORTE' | 'RUC'
  docNum: string
  domicilio: string
  telefono: string
  email: string
  esMenor: boolean
  apoderadoNombre: string
  apoderadoDoc: string
  apoderadoContacto: string
  bienTipo: BienTipo
  bienDesc: string
  monto: string
  pedidoRef: string
  detalle: string
  pedidoConsumidor: string
}

const VACIO: Formulario = {
  tipo: 'RECLAMO',
  nombre: '', docTipo: 'DNI', docNum: '', domicilio: '', telefono: '', email: '',
  esMenor: false, apoderadoNombre: '', apoderadoDoc: '', apoderadoContacto: '',
  bienTipo: 'SERVICIO', bienDesc: '', monto: '', pedidoRef: '',
  detalle: '', pedidoConsumidor: '',
}

interface Hoja { codigo: string; fecha: string; datos: Formulario }

export default function LibroReclamacionesPage() {
  const { store } = useStore()
  // En un subdominio de marca el reclamo es CONTRA esa marca; en krossclub.app,
  // contra la plataforma. La hoja tiene que decir cuál de las dos.
  const marca = isPlatformHost() ? null : store.nombre || null

  const [f, setF] = useState<Formulario>(VACIO)
  const [acepta, setAcepta] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState('')
  const [hoja, setHoja] = useState<Hoja | null>(null)

  const set = <K extends keyof Formulario>(campo: K, valor: Formulario[K]) =>
    setF((prev) => ({ ...prev, [campo]: valor }))

  const validar = (): boolean => {
    const e: Record<string, string> = {}
    if (f.nombre.trim().length < 3) e.nombre = 'Escribe tus nombres y apellidos.'
    if (f.docNum.trim().length < 6) e.docNum = 'Escribe tu número de documento.'
    if (f.docTipo === 'DNI' && f.docNum.replace(/\D/g, '').length !== 8) e.docNum = 'El DNI tiene 8 dígitos.'
    if (f.domicilio.trim().length < 5) e.domicilio = 'Escribe tu domicilio.'
    if (f.telefono.replace(/\D/g, '').length < 6) e.telefono = 'Escribe un teléfono de contacto.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = 'Escribe un correo válido.'
    if (f.bienDesc.trim().length < 3) e.bienDesc = 'Describe el producto o servicio.'
    if (f.detalle.trim().length < 10) e.detalle = 'Cuéntanos qué pasó, con el mayor detalle posible.'
    if (f.pedidoConsumidor.trim().length < 5) e.pedidoConsumidor = 'Indica qué solicitas.'
    if (f.esMenor && f.apoderadoNombre.trim().length < 3) e.apoderadoNombre = 'Escribe el nombre del padre, madre o tutor.'
    if (!acepta) e.acepta = 'Debes confirmar la declaración para enviar la hoja.'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!validar()) {
      // Sin esto el error quedaba fuera de pantalla en el móvil y el botón
      // "no hacía nada" a los ojos de quien está reclamando.
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setEnviando(true)
    setFallo('')
    try {
      const res = await fetch(`${BASE}/libro-reclamaciones`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: isPlatformHost() ? null : store.id,
          store_nombre: marca,
          tipo: f.tipo,
          consumidor_nombre: f.nombre.trim(),
          consumidor_doc_tipo: f.docTipo,
          consumidor_doc_num: f.docNum.trim(),
          consumidor_domicilio: f.domicilio.trim(),
          consumidor_telefono: f.telefono.replace(/\D/g, ''),
          consumidor_email: f.email.trim(),
          es_menor: f.esMenor,
          apoderado_nombre: f.esMenor ? f.apoderadoNombre.trim() : null,
          apoderado_doc_num: f.esMenor ? f.apoderadoDoc.trim() : null,
          apoderado_contacto: f.esMenor ? f.apoderadoContacto.trim() : null,
          bien_tipo: f.bienTipo,
          bien_desc: f.bienDesc.trim(),
          monto_reclamado: f.monto ? Number(f.monto) : null,
          pedido_ref: f.pedidoRef.trim() || null,
          detalle: f.detalle.trim(),
          pedido_consumidor: f.pedidoConsumidor.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'error')
      setHoja({ codigo: data.codigo, fecha: data.fecha, datos: f })
      window.scrollTo({ top: 0 })
    } catch (err) {
      setFallo(
        err instanceof Error && err.message !== 'error'
          ? err.message
          : 'No pudimos registrar tu hoja. Revisa tu conexión e inténtalo otra vez.',
      )
    } finally {
      setEnviando(false)
    }
  }

  if (hoja) return <HojaRegistrada hoja={hoja} marca={marca} />

  return (
    <PublicLayout>
      <div className="max-w-[820px] mx-auto px-5 py-12">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white" style={{ background: 'var(--brand-dark)' }}>
            <BookOpen size={24} />
          </span>
          <div>
            <h1 className="text-3xl font-black leading-none">Libro de Reclamaciones</h1>
            <p className="text-sm text-gray-500 mt-1">Virtual, conforme al D.S. N° 011-2011-PCM</p>
          </div>
        </div>

        <p className="text-[15px] text-gray-700 mt-5 leading-relaxed">
          Registra aquí tu reclamo o queja. Al enviarlo recibirás el <b>número correlativo</b> de tu
          Hoja de Reclamación y podrás imprimirla o guardarla. Te responderemos en un plazo máximo de{' '}
          <b>{PLAZO_RESPUESTA_HABILES} días hábiles</b>.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 mt-6">
          <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
            <p className="font-black text-sm">Reclamo</p>
            <p className="text-sm text-gray-600 mt-1">Disconformidad relacionada a los productos o servicios.</p>
          </div>
          <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
            <p className="font-black text-sm">Queja</p>
            <p className="text-sm text-gray-600 mt-1">
              Malestar o descontento respecto a la atención al público, no relacionado a los productos
              o servicios.
            </p>
          </div>
        </div>

        <DatosProveedor marca={marca} />

        <form onSubmit={enviar} noValidate className="mt-8">
          {fallo && (
            <p className="flex items-center gap-2 mb-5 text-sm font-bold text-red-600 rounded-2xl bg-red-50 border border-red-200 px-4 py-3">
              <CircleAlert size={16} className="shrink-0" /> {fallo}
            </p>
          )}

          <Bloque titulo="1. Tipo de solicitud">
            <div className="flex gap-2">
              {(['RECLAMO', 'QUEJA'] as Tipo[]).map((t) => (
                <button key={t} type="button" onClick={() => set('tipo', t)}
                  className={`flex-1 py-3 rounded-2xl font-black text-sm border-2 ${
                    f.tipo === t ? 'border-[var(--brand-dark)] bg-gray-50' : 'border-gray-200 text-gray-500'
                  }`}>
                  {t === 'RECLAMO' ? 'Reclamo' : 'Queja'}
                </button>
              ))}
            </div>
          </Bloque>

          <Bloque titulo="2. Identificación del consumidor reclamante">
            <Campo label="Nombres y apellidos" error={errores.nombre}>
              <input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className={INPUT} autoComplete="name" />
            </Campo>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Tipo de documento">
                <select value={f.docTipo} onChange={(e) => set('docTipo', e.target.value as Formulario['docTipo'])} className={INPUT}>
                  <option value="DNI">DNI</option>
                  <option value="CE">Carné de extranjería</option>
                  <option value="PASAPORTE">Pasaporte</option>
                  <option value="RUC">RUC</option>
                </select>
              </Campo>
              <Campo label="Número de documento" error={errores.docNum}>
                <input value={f.docNum} onChange={(e) => set('docNum', e.target.value)} className={INPUT} maxLength={20} />
              </Campo>
            </div>

            <Campo label="Domicilio" error={errores.domicilio}>
              <input value={f.domicilio} onChange={(e) => set('domicilio', e.target.value)} className={INPUT} autoComplete="street-address" />
            </Campo>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Teléfono" error={errores.telefono}>
                <input value={f.telefono} onChange={(e) => set('telefono', e.target.value)} className={INPUT} inputMode="tel" maxLength={15} />
              </Campo>
              <Campo label="Correo electrónico" error={errores.email}>
                <input value={f.email} onChange={(e) => set('email', e.target.value)} className={INPUT} type="email" autoComplete="email" />
              </Campo>
            </div>

            <label className="flex gap-3 text-sm text-gray-600 mt-1">
              <input type="checkbox" checked={f.esMenor} onChange={(e) => set('esMenor', e.target.checked)} className="mt-1" />
              <span>El consumidor es menor de edad (completo los datos del padre, madre o tutor).</span>
            </label>

            {f.esMenor && (
              <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4 mt-3">
                <Campo label="Nombre del padre, madre o tutor" error={errores.apoderadoNombre}>
                  <input value={f.apoderadoNombre} onChange={(e) => set('apoderadoNombre', e.target.value)} className={INPUT} />
                </Campo>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo label="Documento de identidad">
                    <input value={f.apoderadoDoc} onChange={(e) => set('apoderadoDoc', e.target.value)} className={INPUT} maxLength={20} />
                  </Campo>
                  <Campo label="Teléfono o correo de contacto">
                    <input value={f.apoderadoContacto} onChange={(e) => set('apoderadoContacto', e.target.value)} className={INPUT} />
                  </Campo>
                </div>
              </div>
            )}
          </Bloque>

          <Bloque titulo="3. Identificación del bien contratado">
            <div className="flex gap-2">
              {(['PRODUCTO', 'SERVICIO'] as BienTipo[]).map((t) => (
                <button key={t} type="button" onClick={() => set('bienTipo', t)}
                  className={`flex-1 py-3 rounded-2xl font-black text-sm border-2 ${
                    f.bienTipo === t ? 'border-[var(--brand-dark)] bg-gray-50' : 'border-gray-200 text-gray-500'
                  }`}>
                  {t === 'PRODUCTO' ? 'Producto' : 'Servicio'}
                </button>
              ))}
            </div>

            <Campo label="Descripción del producto o servicio" error={errores.bienDesc}>
              <input value={f.bienDesc} onChange={(e) => set('bienDesc', e.target.value)} className={INPUT}
                placeholder="Ej.: Plan Vende, suscripción mensual" />
            </Campo>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Monto reclamado en soles (opcional)">
                <input value={f.monto} onChange={(e) => set('monto', e.target.value.replace(/[^\d.]/g, ''))}
                  className={INPUT} inputMode="decimal" placeholder="0.00" />
              </Campo>
              <Campo label="Código de pedido (opcional)">
                <input value={f.pedidoRef} onChange={(e) => set('pedidoRef', e.target.value)} className={INPUT}
                  placeholder="Ej.: KR-2026-000123" maxLength={40} />
              </Campo>
            </div>
          </Bloque>

          <Bloque titulo={`4. Detalle de la ${f.tipo === 'QUEJA' ? 'queja' : 'reclamación'}`}>
            <Campo label="Cuéntanos qué pasó" error={errores.detalle}>
              <textarea value={f.detalle} onChange={(e) => set('detalle', e.target.value)} rows={5} maxLength={4000}
                className={`${INPUT} resize-none`} />
            </Campo>
            <Campo label="¿Qué solicitas?" error={errores.pedidoConsumidor}>
              <textarea value={f.pedidoConsumidor} onChange={(e) => set('pedidoConsumidor', e.target.value)} rows={3} maxLength={2000}
                className={`${INPUT} resize-none`} />
            </Campo>
          </Bloque>

          <label className="flex gap-3 text-sm text-gray-600 mt-2">
            <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-1" />
            <span>
              Declaro que la información consignada es verdadera y autorizo el tratamiento de mis datos
              personales para la atención de esta hoja, conforme a la{' '}
              <Link to="/privacidad" className="underline font-bold" target="_blank">Política de privacidad</Link>.
            </span>
          </label>
          {errores.acepta && <p className="text-xs text-red-600 font-bold mt-1">{errores.acepta}</p>}

          <button type="submit" disabled={enviando}
            className="w-full mt-6 py-4 rounded-2xl font-black text-white disabled:opacity-50 active:scale-[.99] transition-transform"
            style={{ background: 'var(--brand-dark)' }}>
            {enviando ? 'Enviando…' : 'Enviar hoja de reclamación'}
          </button>

          <p className="text-xs text-gray-500 mt-4 leading-relaxed">
            La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es
            requisito previo para interponer una denuncia ante el INDECOPI.
          </p>
        </form>
      </div>
    </PublicLayout>
  )
}

const INPUT = 'w-full px-4 py-3 rounded-2xl border border-gray-200 outline-none focus:border-gray-900 bg-white'

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-8">
      <legend className="font-black text-lg mb-3">{titulo}</legend>
      <div className="space-y-4">{children}</div>
    </fieldset>
  )
}

function Campo({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-gray-500 uppercase tracking-wide">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error && <p className="text-xs text-red-600 font-bold mt-1">{error}</p>}
    </label>
  )
}

/** Datos del proveedor: obligatorios en la hoja. En un subdominio de marca, el
 *  proveedor reclamado es la marca; la plataforma se identifica igual porque es
 *  quien opera el libro. */
function DatosProveedor({ marca }: { marca: string | null }) {
  return (
    <div className="rounded-3xl border border-gray-200 p-5 mt-8">
      <p className="text-xs font-black text-gray-400 uppercase tracking-wide">Datos del proveedor</p>
      <ul className="text-sm text-gray-700 mt-2 space-y-1">
        {marca && <li><b>Establecimiento:</b> {marca} (tienda operada sobre la plataforma {EMPRESA.marca})</li>}
        {EMPRESA.razonSocial && <li><b>Razón social:</b> {EMPRESA.razonSocial}</li>}
        {EMPRESA.ruc && <li><b>RUC:</b> {EMPRESA.ruc}</li>}
        {EMPRESA.domicilioFiscal && <li><b>Domicilio fiscal:</b> {EMPRESA.domicilioFiscal}</li>}
        <li><b>Sitio web:</b> {EMPRESA.web}</li>
      </ul>
    </div>
  )
}

/** Hoja registrada: la copia que la norma manda entregar al consumidor. Se
 *  puede imprimir o guardar como PDF desde el propio navegador. */
function HojaRegistrada({ hoja, marca }: { hoja: Hoja; marca: string | null }) {
  const { codigo, fecha, datos: d } = hoja
  const fechaTexto = new Date(fecha).toLocaleString('es-PE', { timeZone: 'America/Lima' })

  return (
    <PublicLayout>
      <div className="max-w-[820px] mx-auto px-5 py-12">
        <div className="flex items-start gap-3" data-no-print>
          <CheckCircle2 size={28} className="text-green-600 shrink-0 mt-1" />
          <div>
            <h1 className="text-2xl font-black">Tu hoja quedó registrada</h1>
            <p className="text-gray-600 mt-1">
              Guarda o imprime esta hoja: es tu constancia. También enviamos una copia a{' '}
              <b>{d.email}</b> cuando el correo está habilitado.
            </p>
          </div>
        </div>

        <div className="rounded-3xl border-2 border-gray-200 p-6 mt-6 print:border-0 print:p-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-200 pb-4">
            <div>
              <p className="font-black text-lg">Hoja de Reclamación</p>
              <p className="text-sm text-gray-500">Libro de Reclamaciones virtual · D.S. N° 011-2011-PCM</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">N° correlativo</p>
              <p className="font-black text-lg">{codigo}</p>
            </div>
          </div>

          <Fila label="Fecha y hora" valor={fechaTexto} />
          <Fila label="Tipo" valor={d.tipo === 'QUEJA' ? 'Queja' : 'Reclamo'} />

          <Titulo>Proveedor</Titulo>
          {marca && <Fila label="Establecimiento" valor={`${marca} (plataforma ${EMPRESA.marca})`} />}
          {EMPRESA.razonSocial && <Fila label="Razón social" valor={EMPRESA.razonSocial} />}
          {EMPRESA.ruc && <Fila label="RUC" valor={EMPRESA.ruc} />}
          {EMPRESA.domicilioFiscal && <Fila label="Domicilio fiscal" valor={EMPRESA.domicilioFiscal} />}

          <Titulo>Consumidor</Titulo>
          <Fila label="Nombre" valor={d.nombre} />
          <Fila label="Documento" valor={`${d.docTipo} ${d.docNum}`} />
          <Fila label="Domicilio" valor={d.domicilio} />
          <Fila label="Teléfono" valor={d.telefono} />
          <Fila label="Correo" valor={d.email} />
          {d.esMenor && (
            <>
              <Fila label="Padre, madre o tutor" valor={d.apoderadoNombre} />
              {d.apoderadoDoc && <Fila label="Documento del tutor" valor={d.apoderadoDoc} />}
              {d.apoderadoContacto && <Fila label="Contacto del tutor" valor={d.apoderadoContacto} />}
            </>
          )}

          <Titulo>Bien contratado</Titulo>
          <Fila label="Tipo" valor={d.bienTipo === 'PRODUCTO' ? 'Producto' : 'Servicio'} />
          <Fila label="Descripción" valor={d.bienDesc} />
          {d.monto && <Fila label="Monto reclamado" valor={`S/ ${d.monto}`} />}
          {d.pedidoRef && <Fila label="Pedido" valor={d.pedidoRef} />}

          <Titulo>Detalle</Titulo>
          <p className="text-sm text-gray-700 whitespace-pre-line mt-1">{d.detalle}</p>
          <Titulo>Pedido del consumidor</Titulo>
          <p className="text-sm text-gray-700 whitespace-pre-line mt-1">{d.pedidoConsumidor}</p>

          <p className="text-xs text-gray-500 mt-6 leading-relaxed border-t border-gray-200 pt-4">
            El proveedor debe dar respuesta en un plazo máximo de {PLAZO_RESPUESTA_HABILES} días hábiles,
            conforme al Código de Protección y Defensa del Consumidor (Ley N° 29571). La formulación del
            reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo
            para interponer una denuncia ante el INDECOPI.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mt-6" data-no-print>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-sm text-white"
            style={{ background: 'var(--brand-dark)' }}>
            <Printer size={16} /> Imprimir o guardar en PDF
          </button>
          <Link to="/" className="px-6 py-3 rounded-2xl font-black text-sm bg-gray-100 text-gray-700">
            Volver al inicio
          </Link>
        </div>
      </div>
    </PublicLayout>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <p className="font-black text-sm uppercase tracking-wide text-gray-400 mt-5">{children}</p>
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <p className="text-sm text-gray-700 mt-1.5">
      <span className="text-gray-500">{label}:</span> <b>{valor}</b>
    </p>
  )
}
