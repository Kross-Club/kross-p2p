import { useEffect, useRef, useState } from 'react'
import { Plus, X, Trash2, Copy, Image as ImageIcon, ExternalLink, GripVertical } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSeller } from '../../lib/seller-session'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface Pack { nombre: string; descripcion?: string; precio: number }
interface Product {
  id: string
  store_id: string | null
  nombre: string
  precio: number
  images: string[]
  packs: Pack[]
  active: boolean
}

export default function ProductosPage() {
  const { real, isAdmin, impersonating } = useSeller()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Product | null>(null)

  const load = () => {
    if (!real) return
    supabase.from('products').select('*').eq('store_id', real.store_id).order('created_at', { ascending: false })
      .then(({ data }) => { setProducts((data as Product[]) ?? []); setLoading(false) })
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [real?.store_id])

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[var(--brand)] animate-spin" /></div>

  if (!isAdmin || impersonating) {
    return <div className="px-4 py-8 text-center text-sm text-gray-400">Solo el administrador gestiona los productos.</div>
  }

  const newProduct = (): Product => ({ id: '', store_id: real?.store_id ?? null, nombre: '', precio: 0, images: [], packs: [], active: true })

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-black text-gray-900">Productos</h1>
        <button onClick={() => setEditing(newProduct())} className="flex items-center gap-1 text-xs font-black px-3 py-2 rounded-xl" style={{ background: 'var(--brand)', color: '#fff' }}>
          <Plus size={14} /> Nuevo
        </button>
      </div>

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
                <p className="text-xs text-gray-400">S/{p.precio} · {p.images.length} imagen(es) · {p.packs.length} pack(s)</p>
                <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/landing/${p.id}`) }}
                  className="text-[11px] font-bold mt-1 flex items-center gap-1" style={{ color: 'var(--brand)' }}>
                  <Copy size={11} /> Copiar link de landing
                </button>
              </div>
              <a href={`/landing/${p.id}`} target="_blank" rel="noreferrer" className="p-2 rounded-xl" style={{ background: '#F3F4F6', color: '#666' }}><ExternalLink size={14} /></a>
              <button onClick={() => setEditing(p)} className="text-xs font-black px-3 py-2 rounded-xl" style={{ background: '#EEF9FF', color: 'var(--brand)' }}>Editar</button>
            </div>
          ))}
        </div>
      )}

      {editing && <Editor product={editing} adminId={real?.auth_user_id ?? ''} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

function Editor({ product, adminId, onClose, onSaved }: { product: Product; adminId: string; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState(product.nombre)
  const [precio, setPrecio] = useState(String(product.precio || ''))
  const [images, setImages] = useState<string[]>(product.images)
  const [packs, setPacks] = useState<Pack[]>(product.packs)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setUploading(true)
    try {
      const urls: string[] = []
      for (const f of files) {
        const ext = f.name.split('.').pop() || 'jpg'
        const path = `${adminId}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`
        const { error } = await supabase.storage.from('products').upload(path, f, { contentType: f.type, upsert: true })
        if (!error) {
          const { data } = supabase.storage.from('products').getPublicUrl(path)
          urls.push(data.publicUrl)
        }
      }
      setImages(prev => [...prev, ...urls])
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
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
          action: 'save', admin_auth_id: adminId, id: product.id || undefined,
          nombre: nombre.trim(), precio: Number(precio) || 0, images,
          packs: packs.filter(p => p.nombre.trim()).map(p => ({ ...p, precio: Number(p.precio) || 0 })),
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || 'No se pudo guardar.'); return }
      onSaved()
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
            className="text-[11px] font-black px-2.5 py-1.5 rounded-lg disabled:opacity-50" style={{ background: 'var(--brand)', color: '#fff' }}>
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
          <button onClick={addPack} className="text-[11px] font-black px-2.5 py-1.5 rounded-lg" style={{ background: '#EEF9FF', color: 'var(--brand)' }}>+ Pack</button>
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
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          {product.id && <button onClick={del} disabled={busy} className="px-4 py-3 rounded-2xl font-black text-sm bg-red-50 text-red-600">Eliminar</button>}
          <button onClick={save} disabled={busy} className="flex-1 py-3 rounded-2xl font-black text-sm disabled:opacity-50" style={{ background: 'var(--brand)', color: '#fff' }}>
            {busy ? 'Guardando…' : 'Guardar producto'}
          </button>
        </div>
      </div>
    </div>
  )
}
