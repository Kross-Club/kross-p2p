import { useEffect, useRef, useState } from 'react'
import { Plus, X, Trash2, Copy, Image as ImageIcon, ExternalLink, GripVertical, Truck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSeller } from '../../lib/seller-session'
import { IMAGE_PRESETS, downscaleImage } from '../../lib/images/downscale'
import AbTestPanel from './AbTestPanel'
import { mensajePanel } from '../../lib/panel-errors'
import { AgencyService } from '../../lib/checkout/services/AgencyService'
import type { AgencyBranch } from '../../lib/checkout/types'

/** El catálogo REAL de la cuenta Shalom Pro (lo que devuelve GET /v1/products),
 *  no una escala nuestra: de cuál se elija sale la tarifa del envío. Misma lista
 *  que valida `manage-product` —hay una prueba que vigila que no se separen—. */
const PACKAGE_SIZES = [
  ['SOBRE', 'Sobre'], ['XXS', 'Caja XXS'], ['XS', 'Caja XS'], ['S', 'Caja S'],
  ['M', 'Caja M'], ['L', 'Caja L'], ['OTRA_MEDIDA', 'Otra medida'],
] as const

/** La declaración jurada que Shalom exige en toda guía y sale impresa en ella. */
const DECLARED_CONTENTS = [
  ['art', 'Artículos de uso personal'], ['ropa', 'Ropa'],
  ['docs', 'Documentos'], ['electro', 'Electrodomésticos'],
] as const

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** `image` es la foto propia del pack. Opcional: sin ella el checkout cae a la
 *  primera imagen de la landing. Ver el aviso del editor sobre cuándo sirve. */
interface Pack { nombre: string; descripcion?: string; precio: number; image?: string }
interface Product {
  id: string
  store_id: string | null
  nombre: string
  precio: number
  images: string[]
  packs: Pack[]
  active: boolean
  /** Envío (sección 27.a del esquema): de qué sede Shalom sale este producto,
   *  de qué tamaño es su paquete y qué contenido declara. Sin los tres, su
   *  pedido no genera guía solo. */
  shalom_origin_branch_id?: string | null
  package_size?: string | null
  declared_content?: string | null
}

export default function ProductosPage() {
  const { real, effective } = useSeller()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Product | null>(null)
  /** `null` mientras carga. Se pide entero y no solo el slug porque el
   *  experimento A/B también depende de la marca — ver abajo. */
  const [store, setStore] = useState<{ slug: string | null; home_delivery_enabled: boolean } | null>(null)
  /** Cuál de los enlaces se acaba de copiar. Sin acuse, copiar no se siente:
   *  el portapapeles no da señal y el vendedor toca dos veces por las dudas. */
  const [copiado, setCopiado] = useState<string | null>(null)

  // Scope to the store you're currently acting in (effective) — so a super admin
  // who entered a brand sees THAT brand's products.
  const load = () => {
    if (!effective?.store_id) { setLoading(false); return }
    supabase.from('products').select('*').eq('store_id', effective.store_id).order('created_at', { ascending: false })
      .then(({ data }) => { setProducts((data as Product[]) ?? []); setLoading(false) })
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [effective?.store_id])

  // Brand subdomain, so shared landing links always point to the brand's site
  // (e.g. marca.krossclub.app/landing/…), even when the super admin shares them.
  useEffect(() => {
    if (!effective?.store_id) return
    supabase.from('stores').select('slug, home_delivery_enabled').eq('id', effective.store_id).maybeSingle()
      .then(({ data }) => setStore({
        slug: data?.slug ?? null,
        // El default de la columna es `true` y las marcas viejas no la tienen
        // escrita: `undefined` significa "reparte", igual que en el checkout.
        home_delivery_enabled: data?.home_delivery_enabled ?? true,
      }))
  }, [effective?.store_id])
  const landingBase = store?.slug ? `https://${store.slug}.krossclub.app` : window.location.origin

  // ─── ¿Tiene sentido el experimento en esta marca? ──────────────────────────
  // A y B se diferencian SOLO en provincia con cobertura: en A la cobertura
  // decide el envío, en B lo elige el comprador. Sin entrega a domicilio no hay
  // qué elegir —el reducer fuerza AGENCIA y el selector de método ni se pinta—,
  // así que las dos versiones renderizan idéntico.
  //
  // Se esconde en vez de dejarlo inerte porque un experimento visible promete
  // una respuesta: el panel iría acumulando leads en las dos ramas y mostrando
  // diferencias que son puro azar, y los enlaces `?checkout=A` / `?checkout=B`
  // mandarían dos anuncios a la MISMA pantalla creyendo que se comparan.
  // Vuelve solo con prender el switch de domicilio.
  const abIsLive = store?.home_delivery_enabled === true

  const copiar = (url: string, key: string) => {
    navigator.clipboard?.writeText(url)
    setCopiado(key)
    setTimeout(() => setCopiado(c => (c === key ? null : c)), 1500)
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" /></div>

  if (!effective?.is_admin) {
    return <div className="px-4 py-8 text-center text-sm text-gray-400">Solo el administrador gestiona los productos.</div>
  }

  const newProduct = (): Product => ({ id: '', store_id: effective?.store_id ?? null, nombre: '', precio: 0, images: [], packs: [], active: true })

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-black text-gray-900">Productos</h1>
        <button onClick={() => setEditing(newProduct())} className="flex items-center gap-1 text-xs font-black px-3 py-2 rounded-xl" style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
          <Plus size={14} /> Nuevo
        </button>
      </div>

      {effective.store_id && abIsLive && <AbTestPanel storeId={effective.store_id} />}

      {products.length === 0 ? (
        <div className="text-center py-14">
          <ImageIcon size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm text-gray-400">Aún no tienes productos. Crea uno y sube sus imágenes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map(p => (
            <div key={p.id} className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                {p.images[0] ? <img src={p.images[0]} alt={p.nombre} className="w-full h-full object-cover" /> : <ImageIcon size={20} className="m-auto mt-4 text-gray-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm text-gray-900 truncate">{p.nombre || 'Sin nombre'}</p>
                <p className="text-xs text-gray-400">S/ {p.precio} · {p.images.length} imagen(es) · {p.packs.length} pack(s)</p>
                {/* Sin esto, el vendedor se entera de que falta configurar el envío
                    recién cuando un pedido no generó su guía. */}
                {!(p.shalom_origin_branch_id && p.package_size && p.declared_content) && (
                  <p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--warn-fg)' }}>
                    Envío sin configurar — su guía se registra a mano
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                  <button onClick={() => copiar(`${landingBase}/landing/${p.id}`, p.id)}
                    className="text-[11px] font-bold flex items-center gap-1" style={{ color: 'var(--brand)' }}>
                    <Copy size={11} /> {copiado === p.id ? '¡Copiado!' : 'Copiar link de landing'}
                  </button>
                  {/* Los dos enlaces del experimento. `?checkout=` FUERZA la versión
                      y no la guarda, así que sirven para mandar cada anuncio a una
                      —y comparar— pero no sortean: quien entre por el link limpio
                      sigue cayendo en el reparto de la tienda.
                      Solo donde el experimento existe: ver `abIsLive`. */}
                  {abIsLive && (['A', 'B'] as const).map(v => (
                    <button key={v} onClick={() => copiar(`${landingBase}/landing/${p.id}?checkout=${v}`, `${p.id}-${v}`)}
                      className="text-[11px] font-bold flex items-center gap-1 text-gray-400">
                      <Copy size={10} /> {copiado === `${p.id}-${v}` ? '¡Copiado!' : `Versión ${v}`}
                    </button>
                  ))}
                </div>
              </div>
              <a href={`${landingBase}/landing/${p.id}`} target="_blank" rel="noreferrer" className="p-2 rounded-xl" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}><ExternalLink size={14} /></a>
              <button onClick={() => setEditing(p)} className="text-xs font-black px-3 py-2 rounded-xl" style={{ background: 'var(--brand-tint)', color: 'var(--brand)' }}>Editar</button>
            </div>
          ))}
        </div>
      )}

      {editing && <Editor product={editing} adminId={real?.auth_user_id ?? ''} storeId={effective?.store_id ?? ''} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

function Editor({ product, adminId, storeId, onClose, onSaved }: { product: Product; adminId: string; storeId: string; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState(product.nombre)
  const [precio, setPrecio] = useState(String(product.precio || ''))
  const [images, setImages] = useState<string[]>(product.images)
  const [packs, setPacks] = useState<Pack[]>(product.packs)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  /** Índice del pack al que le toca la foto que se está eligiendo/subiendo. */
  const [packTarget, setPackTarget] = useState<number | null>(null)
  const [packUploading, setPackUploading] = useState<number | null>(null)
  const packFileRef = useRef<HTMLInputElement>(null)
  // ─── Envío ─────────────────────────────────────────────────────────────────
  const [size, setSize] = useState<string | null>(product.package_size ?? null)
  const [contenido, setContenido] = useState<string | null>(product.declared_content ?? null)
  const [origen, setOrigen] = useState<string | null>(product.shalom_origin_branch_id ?? null)
  const [origenBranch, setOrigenBranch] = useState<AgencyBranch | null>(null)
  const [buscarSede, setBuscarSede] = useState('')
  const [sedes, setSedes] = useState<AgencyBranch[]>([])

  // La sede guardada es un id; para que el vendedor la reconozca hay que
  // resolverla contra el listado (el mismo que ve el comprador al elegir dónde
  // recoger — un solo catálogo para las dos puntas del envío).
  useEffect(() => {
    let vivo = true
    const sede = origen ? AgencyService.getBranch('SHALOM', origen) : Promise.resolve(null)
    sede.then(b => { if (vivo) setOrigenBranch(b) })
    return () => { vivo = false }
  }, [origen])

  // Búsqueda con freno: 487 sedes filtradas en cada tecla se siente pegajoso en
  // el celular, que es donde se usa este panel.
  useEffect(() => {
    const q = buscarSede.trim()
    let vivo = true
    const t = setTimeout(() => {
      const r = q.length < 2 ? Promise.resolve([]) : AgencyService.search('SHALOM', q, 8)
      r.then(lista => { if (vivo) setSedes(lista) })
    }, 200)
    return () => { vivo = false; clearTimeout(t) }
  }, [buscarSede])

  // Devolvía `null` en silencio si Storage fallaba: la foto no aparecía y no
  // había forma de saber por qué. Ahora el error se muestra, y antes se descarta
  // la causa más común —la sesión vencida—, que la política del bucket reporta
  // como "row-level security policy" y no le dice nada útil a nadie.
  const uploadOne = async (f: File): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      alert('Tu sesión venció. Vuelve a entrar y reintenta: la foto no se subió.')
      return null
    }

    const ext = f.name.split('.').pop() || 'jpg'
    const path = `${adminId}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`
    // Sin `upsert`: la ruta ya es única (timestamp + aleatorio), así que nunca
    // hay nada que reemplazar. Pedirlo obliga a Storage a resolver además el
    // camino de UPDATE, con los permisos extra que eso arrastra.
    const { error } = await supabase.storage
      .from('products').upload(path, f, { contentType: f.type })
    if (error) { alert(`No se pudo subir la imagen: ${error.message}`); return null }
    return supabase.storage.from('products').getPublicUrl(path).data.publicUrl
  }

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setUploading(true)
    try {
      const urls: string[] = []
      for (const f of files) {
        const url = await uploadOne(f)
        if (url) urls.push(url)
      }
      setImages(prev => [...prev, ...urls])
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ─── Foto del pack ─────────────────────────────────────────────────────────
  // Se reduce antes de subirla: se muestra a 56 px en el checkout y el comprador
  // la carga en 4G. Un solo input oculto para todos los packs; `packTarget` dice
  // a cuál le toca.
  const uploadPackImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    const i = packTarget
    if (!f || i === null) return
    setPackUploading(i)
    try {
      const url = await uploadOne(await downscaleImage(f, IMAGE_PRESETS.packThumb))
      if (url) setPack(i, { image: url })
    } finally {
      setPackUploading(null)
      setPackTarget(null)
      if (packFileRef.current) packFileRef.current.value = ''
    }
  }

  const move = (i: number, dir: -1 | 1) => {
    setImages(prev => {
      const arr = [...prev]; const j = i + dir
      if (j < 0 || j >= arr.length) return prev
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return arr
    })
  }
  const removeImg = (i: number) => setImages(prev => prev.filter((_, k) => k !== i))

  const addPack = () => setPacks(prev => [...prev, { nombre: '', descripcion: '', precio: 0 }])
  const setPack = (i: number, patch: Partial<Pack>) => setPacks(prev => prev.map((p, k) => k === i ? { ...p, ...patch } : p))
  const removePack = (i: number) => setPacks(prev => prev.filter((_, k) => k !== i))

  const save = async () => {
    if (!nombre.trim()) { alert('Ponle un nombre al producto.'); return }
    setBusy(true)
    try {
      const res = await fetch(`${BASE}/manage-product`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save', admin_auth_id: adminId, store_id: storeId || undefined, id: product.id || undefined,
          nombre: nombre.trim(), precio: Number(precio) || 0, images,
          packs: packs.filter(p => p.nombre.trim()).map(p => ({ ...p, precio: Number(p.precio) || 0 })),
          shalom_origin_branch_id: origen, package_size: size, declared_content: contenido,
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        alert(mensajePanel(e.error, 'No se pudo guardar.'))
        return
      }
      onSaved()
    } catch (e) {
      // Un `fetch` que rechaza —sin red, CORS, una función que no arrancó— se
      // iba en silencio: el modal se quedaba en "Guardando…" sin decir nada.
      console.error('[ProductosPage] manage-product no respondió', e)
      alert('El servidor no respondió. Revisa tu conexión (o si la función está desplegada) y reintenta.')
    } finally { setBusy(false) }
  }

  const del = async () => {
    if (!product.id || !confirm('¿Eliminar este producto?')) return
    setBusy(true)
    try {
      await fetch(`${BASE}/manage-product`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', admin_auth_id: adminId, id: product.id }),
      })
      onSaved()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl p-5 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-gray-900">{product.id ? 'Editar producto' : 'Nuevo producto'}</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        <label className="text-xs font-bold text-gray-500 mb-1 block">Nombre</label>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Aceite de Orégano 6000mg"
          className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none mb-3" />

        <label className="text-xs font-bold text-gray-500 mb-1 block">Precio base (S/)</label>
        <input value={precio} onChange={e => setPrecio(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="189"
          className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none mb-4" />

        {/* Imágenes de la landing */}
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold text-gray-500">Imágenes de la landing (en orden)</label>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="text-[11px] font-black px-2.5 py-1.5 rounded-lg disabled:opacity-50" style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
            {uploading ? 'Subiendo…' : '+ Subir'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={upload} />
        </div>
        <div className="space-y-2 mb-4">
          {images.map((img, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
              <GripVertical size={14} className="text-gray-300 flex-shrink-0" />
              <img src={img} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
              <span className="text-xs text-gray-400 flex-1">#{i + 1}</span>
              <button onClick={() => move(i, -1)} className="text-xs px-2 py-1 rounded bg-white border">↑</button>
              <button onClick={() => move(i, 1)} className="text-xs px-2 py-1 rounded bg-white border">↓</button>
              <button onClick={() => removeImg(i)} className="p-1.5 rounded bg-white border"><Trash2 size={13} className="text-red-500" /></button>
            </div>
          ))}
          {images.length === 0 && <p className="text-[11px] text-gray-400">Sube las imágenes que arman la landing (se muestran a pantalla completa, una debajo de otra).</p>}
        </div>

        {/* Packs (opcional) */}
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold text-gray-500">Packs / ofertas (opcional)</label>
          <button onClick={addPack} className="text-[11px] font-black px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--brand-tint)', color: 'var(--brand)' }}>+ Pack</button>
        </div>
        <div className="space-y-2 mb-4">
          {packs.map((p, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-2 space-y-1.5">
              <div className="flex gap-2">
                <input value={p.nombre} onChange={e => setPack(i, { nombre: e.target.value })} placeholder="Nombre (ej: 2 unidades)" className="flex-1 bg-white rounded-lg px-3 py-2 text-xs outline-none border" />
                <input value={String(p.precio || '')} onChange={e => setPack(i, { precio: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} inputMode="decimal" placeholder="S/" className="w-20 bg-white rounded-lg px-3 py-2 text-xs outline-none border" />
                <button onClick={() => removePack(i)} className="p-2 rounded-lg bg-white border"><Trash2 size={13} className="text-red-500" /></button>
              </div>
              <input value={p.descripcion ?? ''} onChange={e => setPack(i, { descripcion: e.target.value })} placeholder="Descripción corta" className="w-full bg-white rounded-lg px-3 py-2 text-xs outline-none border" />

              {/* Foto del pack: la que se ve en el paso 1 del checkout. */}
              <div className="flex items-center gap-2">
                {p.image
                  ? <img src={p.image} alt="" className="w-10 h-10 rounded-lg object-cover border bg-white flex-shrink-0" />
                  : <div className="w-10 h-10 rounded-lg border border-dashed flex items-center justify-center flex-shrink-0"><ImageIcon size={14} className="text-gray-300" /></div>}
                <button
                  onClick={() => { setPackTarget(i); packFileRef.current?.click() }}
                  disabled={packUploading !== null}
                  className="text-[11px] font-black px-2.5 py-1.5 rounded-lg bg-white border disabled:opacity-50"
                >
                  {packUploading === i ? 'Subiendo…' : p.image ? 'Cambiar foto' : '+ Foto del pack'}
                </button>
                {p.image && (
                  <button onClick={() => setPack(i, { image: undefined })} className="text-[11px] font-bold text-gray-400 underline">
                    Quitar
                  </button>
                )}
              </div>
            </div>
          ))}
          <input ref={packFileRef} type="file" accept="image/*" className="hidden" onChange={uploadPackImage} />

          {/* La regla que decide si la foto vende o solo pesa. */}
          {packs.length > 0 && (
            <p className="text-[11px] text-gray-400 leading-snug">
              La foto sale en el paso 1 del checkout. Sirve <b>solo si cada pack muestra su
              cantidad real</b> (1 frasco, 2 frascos, 3 frascos). Si subes la misma foto en
              todos, mejor no subas ninguna: no distingue nada y pesa en 4G. Sin foto propia
              se usa la primera imagen de la landing.
            </p>
          )}
        </div>

        {/* ── Envío: lo que hace falta para que la guía se genere sola ──
              Vive en el producto y no en la marca porque lo decide la
              mercadería: dos productos de la misma tienda pueden salir de
              almacenes distintos y en cajas de otro tamaño. ── */}
        <div className="rounded-2xl p-3 mb-4" style={{ background: 'var(--warn-bg-soft)', border: '0.5px solid var(--warn-border)' }}>
          <span className="text-xs font-black flex items-center gap-1.5" style={{ color: 'var(--warn-fg)' }}>
            <Truck size={14} /> Envío por agencia (Shalom)
          </span>
          <p className="text-[10px] text-gray-500 mt-1 mb-2 leading-snug">
            Con estos dos datos, un pedido de recojo en Shalom que ya pagó su adelanto
            <b> genera su guía solo</b>. Sin ellos el pedido se cierra igual y Logística la
            registra a mano, como siempre.
          </p>

          <label className="text-[11px] font-bold text-gray-500 mb-1 block">Tamaño del paquete</label>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PACKAGE_SIZES.map(([valor, etiqueta]) => (
              <button key={valor} onClick={() => setSize(size === valor ? null : valor)}
                className="text-[11px] font-black px-3 py-1.5 rounded-xl border"
                style={size === valor
                  ? { background: 'var(--invert)', color: 'var(--invert-fg)', borderColor: 'var(--invert)' }
                  : { background: 'var(--surface)', color: 'var(--warn-fg)', borderColor: 'var(--warn-border)' }}>
                {etiqueta}
              </button>
            ))}
          </div>

          <label className="text-[11px] font-bold text-gray-500 mb-1 block">
            Contenido declarado <span className="font-bold text-gray-400">(sale impreso en la guía)</span>
          </label>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {DECLARED_CONTENTS.map(([valor, etiqueta]) => (
              <button key={valor} onClick={() => setContenido(contenido === valor ? null : valor)}
                className="text-[11px] font-black px-3 py-1.5 rounded-xl border"
                style={contenido === valor
                  ? { background: 'var(--invert)', color: 'var(--invert-fg)', borderColor: 'var(--invert)' }
                  : { background: 'var(--surface)', color: 'var(--warn-fg)', borderColor: 'var(--warn-border)' }}>
                {etiqueta}
              </button>
            ))}
          </div>

          <label className="text-[11px] font-bold text-gray-500 mb-1 block">
            Agencia de origen (de dónde sale el paquete)
          </label>
          {origen ? (
            <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border" style={{ borderColor: 'var(--warn-border)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black text-gray-800 truncate">
                  {origenBranch ? origenBranch.name : `Sede ${origen}`}
                </p>
                {origenBranch && (
                  <p className="text-[10px] text-gray-400 truncate">{origenBranch.district} · {origenBranch.department}</p>
                )}
              </div>
              <button onClick={() => { setOrigen(null); setBuscarSede('') }} className="text-[11px] font-bold text-gray-400 underline flex-shrink-0">
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <input value={buscarSede} onChange={e => setBuscarSede(e.target.value)}
                placeholder="Busca por distrito o nombre (ej: Los Olivos)"
                className="w-full bg-white rounded-xl px-3 py-2 text-xs outline-none border mb-1.5" style={{ borderColor: 'var(--warn-border)' }} />
              <div className="space-y-1">
                {sedes.map(b => (
                  <button key={b.id} onClick={() => { setOrigen(b.id); setSedes([]) }}
                    className="w-full text-left bg-white rounded-xl px-3 py-2 border" style={{ borderColor: 'var(--warn-border)' }}>
                    <p className="text-[11px] font-black text-gray-800 truncate">{b.name}</p>
                    <p className="text-[10px] text-gray-400 truncate">{b.district} · {b.department}</p>
                  </button>
                ))}
                {buscarSede.trim().length >= 2 && sedes.length === 0 && (
                  <p className="text-[10px] text-gray-400">Ninguna sede coincide. Prueba con el distrito.</p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2">
          {product.id && <button onClick={del} disabled={busy} className="px-4 py-3 rounded-2xl font-black text-sm bg-red-50 text-red-600">Eliminar</button>}
          <button onClick={save} disabled={busy} className="flex-1 py-3 rounded-2xl font-black text-sm disabled:opacity-50" style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>
            {busy ? 'Guardando…' : 'Guardar producto'}
          </button>
        </div>
      </div>
    </div>
  )
}
