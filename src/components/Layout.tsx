import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Eye, X, RotateCcw, Sparkles } from 'lucide-react'
import BottomNav from './BottomNav'
import SideNav from './SideNav'
import IncomingCallOverlay from './IncomingCallOverlay'
import InstallBanner from './InstallBanner'
import SellerPresenceTracker from './SellerPresenceTracker'
import ThemeToggle from './ThemeToggle'
import BrandMark from './BrandMark'
import { subscribePush, notifPermission, getPushPrefs } from '../lib/push'
import { playNotificationSound } from '../lib/notification-sounds'
import { supabase } from '../lib/supabase'
import { useSeller, clearSellerCache, setActingSeller } from '../lib/seller-session'
import { sellerNavLinks, activeNavLink } from '../lib/seller-nav'
import { useIsDesktop } from '../lib/use-desktop'
import { usePanelTheme } from '../lib/theme'
import { useDemo, setDemo } from '../lib/demo/modo-demo'
import { reiniciarDemo, useCambiosDemo } from '../lib/demo/cambios-demo'
import { administraLaPlataforma } from '../../supabase/functions/_shared/alcance.ts'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export default function Layout() {
  const { real, effective, impersonating, stopActing } = useSeller()
  const [uploading, setUploading] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [available, setAvailable] = useState(true)
  const [brand, setBrand] = useState<{ nombre: string; logo_url: string | null } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const desktop = useIsDesktop()
  const demo = useDemo(effective?.store_id)
  // ¿Se tocó algo enseñando? De ahí sale el botón de reiniciar (cambios-demo).
  const tocado = Object.keys(useCambiosDemo()).length > 0
  usePanelTheme()

  // Qué marca se muestra en el header sigue a QUIÉN estás actuando: quien
  // administra la plataforma ve Kross; dentro de una tienda, esa tienda (logo y
  // nombre).
  //
  // El COLOR ya no: el panel es la herramienta de Kross y se pinta con la
  // paleta del manual (ink + lima). El color de cada marca vive donde importa
  // —lo que ve el comprador— y lo aplica store-context.
  useEffect(() => {
    if (!effective) return
    if (administraLaPlataforma(effective)) { setBrand({ nombre: 'Kross', logo_url: null }); return }
    if (!effective.store_id) return
    supabase.from('stores').select('nombre, logo_url').eq('id', effective.store_id).maybeSingle()
      .then(({ data }) => { if (data) setBrand(data as { nombre: string; logo_url: string | null }) })
  }, [effective?.store_id, effective?.is_admin, effective?.is_super_admin])

  useEffect(() => { setAvatar(effective?.avatar_url ?? null) }, [effective?.avatar_url])
  useEffect(() => { if (real) setAvailable(real.available !== false) }, [real?.id, real?.available])

  // Register push for the real logged-in seller
  useEffect(() => {
    if (real && notifPermission() === 'granted') {
      subscribePush({ sellerId: real.auth_user_id, role: 'seller' as const }).catch(() => {})
    }
  }, [real?.auth_user_id])

  // Con la app enfocada el service worker muestra la notificación en silencio y
  // avisa por postMessage: aquí suena el sonido PROPIO de cada evento (nuevo
  // cliente / nuevo mensaje). Las llamadas no pasan por aquí — tienen su
  // ringtone en IncomingCallOverlay.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { kind?: string; type?: string } | null
      if (d?.kind !== 'kross-push') return
      const prefs = getPushPrefs()
      if (d.type === 'new_client' && prefs.new_client) playNotificationSound('new_client')
      else if (d.type === 'message' && prefs.new_message) playNotificationSound('new_message')
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Update the photo of WHOEVER you're acting as (effective) — your own, a team
    // member you entered as, or a brand you're operating.
    const who = effective
    if (!file || !who) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${who.auth_user_id}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${pub.publicUrl}?v=${Date.now()}`
      if (impersonating) {
        // RLS blocks updating another seller's row from the client → go through the
        // admin edge function (authorized because the caller is an admin).
        await fetch(`${BASE}/admin-team`, {
          method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'set_avatar', admin_auth_id: real?.auth_user_id, seller_id: who.auth_user_id, avatar_url: url }),
        })
        setActingSeller({ ...who, avatar_url: url })   // keep the acting profile in sync
      } else {
        await supabase.from('sellers').update({ avatar_url: url }).eq('id', who.id)
      }
      setAvatar(url)
    } catch {
      alert('No se pudo subir la foto. Verifica que exista el bucket "avatars" en Supabase Storage.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const logout = async () => {
    stopActing()
    clearSellerCache()
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  // ── Piezas compartidas entre el panel móvil y el de escritorio ──
  const links = sellerNavLinks(effective)
  const section = activeNavLink(links, pathname)

  // Un demo que no se anuncia es una mentira: mientras esté encendido, cada
  // pantalla del panel lleva esto encima y se puede apagar desde acá mismo.
  const demoBar = demo && (
    <div className="flex items-center justify-between px-4 py-2 flex-shrink-0"
      style={{ background: 'var(--brand)', color: 'var(--invert-fg, #0b0b0b)', borderBottom: '0.5px solid var(--border)' }}>
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles size={14} className="flex-shrink-0" />
        <p className="text-xs font-bold truncate">
          Modo demo{brand?.nombre ? ` en ${brand.nombre}` : ''} — estos datos son inventados
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Solo cuando hay algo que deshacer. Enseñando se avanzan etapas, se
            agregan productos y se escriben mensajes; esto devuelve la tienda de
            ejemplo a como empieza, sin tener que salir y volver a entrar. */}
        {tocado && (
          <button onClick={reiniciarDemo}
            className="flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-lg"
            style={{ background: 'var(--surface)', color: 'var(--text)' }}>
            <RotateCcw size={12} /> Reiniciar
          </button>
        )}
        <button onClick={() => effective?.store_id && setDemo(effective.store_id, false)}
          className="flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-lg"
          style={{ background: 'var(--surface)', color: 'var(--text)' }}>
          <X size={12} /> Salir
        </button>
      </div>
    </div>
  )

  const impersonationBar = impersonating && (
    <div className="flex items-center justify-between px-4 py-2 flex-shrink-0"
      style={{ background: 'var(--surface-3)', color: 'var(--text)', borderBottom: '0.5px solid var(--border)' }}>
      <div className="flex items-center gap-2 min-w-0">
        <Eye size={14} className="flex-shrink-0" />
        <p className="text-xs font-bold truncate">
          {administraLaPlataforma(real)
            ? <>Estás en {brand?.nombre ?? 'la marca'}</>
            : <>Viendo como {effective?.nombre.split(' ')[0]} · {effective?.role_label}</>}
        </p>
      </div>
      <button onClick={stopActing}
        className="flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-lg flex-shrink-0"
        style={{ background: 'var(--surface)', color: 'var(--text)' }}>
        <X size={12} /> {administraLaPlataforma(real) ? 'Volver a Kross' : 'Volver a admin'}
      </button>
    </div>
  )

  const shiftChip = real && !impersonating && (
    <span
      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black"
      style={available
        ? { background: 'var(--surface-3)', color: 'var(--text)' }
        : { background: 'var(--danger-bg)', color: 'var(--danger-fg)' }}
      title="Tu turno (lo asigna el admin)">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
      {available ? 'En turno' : 'Fuera de turno'}
    </span>
  )

  const userBlock = effective && (
    <>
      <div className="text-right">
        <p className="text-xs font-black leading-none" style={{ color: 'var(--text)' }}>
          {effective.nombre.split(' ')[0]}
        </p>
        <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {effective.role_label}
        </p>
      </div>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
        style={{ border: '0.5px solid var(--border-strong)', opacity: uploading ? 0.5 : 1 }}
        title="Cambiar foto">
        {avatar ? (
          <img src={avatar} alt={effective.nombre} className="w-full h-full object-cover" />
        ) : (
          <span className="font-black text-sm" style={{ color: 'var(--text)' }}>
            {effective.nombre.charAt(0).toUpperCase()}
          </span>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
    </>
  )

  const headerActions = (
    <>
      <ThemeToggle />
      <button onClick={logout} className="p-1.5 rounded-xl transition-colors hover:bg-gray-100"
        style={{ color: 'var(--text-faint)' }} title="Cerrar sesión">
        <LogOut size={17} />
      </button>
    </>
  )

  // ── Panel de escritorio: un marco 16:9 centrado ──────────────────────────
  // En la PC el panel de 430px se veía como un recibo: angosto y larguísimo,
  // con todo el ancho de la pantalla vacío. Acá el panel es una ventana 16:9
  // (limitada por el alto de la pantalla, así que nunca se estira), con la
  // navegación al costado y el contenido con scroll PROPIO adentro: la barra
  // de arriba y el menú no se van cuando bajas en la lista.
  if (desktop) {
    return (
      <div className="h-screen w-screen overflow-hidden flex items-center justify-center p-4"
        style={{ background: 'var(--surface-2)' }}>
        {effective && <IncomingCallOverlay storeId={effective.store_id} />}
        <SellerPresenceTracker authUserId={real?.auth_user_id} />

        <div
          className="rounded-2xl border border-gray-200 shadow-xl overflow-hidden flex flex-col"
          style={{ width: 'min(1440px, 100%, calc((100vh - 2rem) * 16 / 9))', aspectRatio: '16 / 9', background: 'var(--surface)' }}>
          {demoBar}
          {impersonationBar}

          <div className="flex-1 flex min-h-0">
            <SideNav effective={effective} brand={brand} />

            <div className="flex-1 flex flex-col min-w-0">
              <header className="flex-shrink-0 border-b border-gray-100 px-6 py-3 flex items-center justify-between gap-4">
                <p className="font-black text-base tracking-tight truncate" style={{ color: 'var(--text)' }}>
                  {section?.label ?? brand?.nombre ?? 'Kross'}
                </p>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {shiftChip}
                  {userBlock}
                  {headerActions}
                </div>
              </header>

              <main className="flex-1 overflow-y-auto min-h-0" style={{ background: 'var(--surface-2)' }}>
                <Outlet />
              </main>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Panel móvil / tablet ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex justify-center" style={{ background: 'var(--surface-2)' }}>
      <div className="w-full max-w-[430px] min-h-screen relative flex flex-col shadow-2xl"
        style={{ background: 'var(--surface)' }}>
        {effective && <IncomingCallOverlay storeId={effective.store_id} />}
        <SellerPresenceTracker authUserId={real?.auth_user_id} />
        <InstallBanner />

        {demoBar}
        {impersonationBar}

        <header className="sticky top-0 z-20 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between"
          style={{ background: 'color-mix(in srgb, var(--surface) 90%, transparent)' }}>
          <BrandMark brand={brand} size={30} />
          <div className="flex items-center gap-3">
            {shiftChip}
            {userBlock}
            {headerActions}
          </div>
        </header>

        <main className="flex-1 pb-20 overflow-y-auto">
          <Outlet />
        </main>

        <BottomNav />
      </div>
    </div>
  )
}
