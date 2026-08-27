import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import BuyerLoginPage from './pages/comprador/BuyerLoginPage'
import RecuperarPasswordPage from './pages/RecuperarPasswordPage'
import NuevaPasswordPage from './pages/NuevaPasswordPage'
import MisPedidosPage from './pages/comprador/MisPedidosPage'
import ScorePage from './pages/comprador/ScorePage'
import TiendaPage from './pages/comprador/TiendaPage'
import LandingProductoPage from './pages/LandingProductoPage'
import PrivacidadPage from './pages/PrivacidadPage'
import CheckoutDemoPage from './pages/CheckoutDemoPage'
import HomePage from './pages/publico/HomePage'
import ServiciosPage from './pages/publico/ServiciosPage'
import ServicioDetallePage from './pages/publico/ServicioDetallePage'
import CarritoPage from './pages/publico/CarritoPage'
import PagoPage from './pages/publico/PagoPage'
import ContactoPage from './pages/publico/ContactoPage'
import TerminosPage from './pages/legal/TerminosPage'
import CambiosDevolucionesPage from './pages/legal/CambiosDevolucionesPage'
import LibroReclamacionesPage from './pages/legal/LibroReclamacionesPage'
import ChatsPage from './pages/comprador/ChatsPage'
import ChatDetalleComprador from './pages/comprador/ChatDetalleComprador'
import PerfilPage from './pages/comprador/PerfilPage'
import PedidosPage from './pages/vendedor/PedidosPage'
import ChatDetalleVendedor from './pages/vendedor/ChatDetalleVendedor'
import ProductosPage from './pages/vendedor/ProductosPage'
import BotIAPage from './pages/vendedor/BotIAPage'
import EquipoPage from './pages/vendedor/EquipoPage'
import MarcaPage from './pages/vendedor/MarcaPage'
import LlamadasPage from './pages/vendedor/LlamadasPage'
import ClientesPage from './pages/vendedor/ClientesPage'
import RetencionPage from './pages/vendedor/RetencionPage'
import OrderChatPage from './pages/pedido/OrderChatPage'
import VendedorPedidoPage from './pages/vendedor/VendedorPedidoPage'
import BuyerPresenceTracker from './components/BuyerPresenceTracker'
import BuyerCallListener from './components/BuyerCallListener'
import { isPlatformHost } from './lib/store-context'

// Smart home: seller session → seller dashboard, buyer session → mis-pedidos.
//
// Sin sesión hay dos casos distintos:
//   · en el subdominio de una marca → el acceso del comprador, como siempre;
//   · en krossclub.app → la WEB PÚBLICA de la plataforma. Antes también caía en
//     /acceso, que en este dominio solo sabe decir "esta página es de cada
//     marca": quien entraba de fuera no encontraba ni qué vendemos ni cómo
//     contactarnos, y una pasarela de pago no puede revisar eso.
function HomeRedirect() {
  const [dest, setDest] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { setDest('/vendedor/pedidos'); return }
      const buyer = localStorage.getItem('buyer_session')
      if (buyer) { setDest('/mis-pedidos'); return }
      setDest(isPlatformHost() ? 'PUBLICA' : '/acceso')
    })
  }, [])

  if (dest === 'PUBLICA') return <HomePage />

  if (!dest) return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, var(--brand) 0%, #863bff 100%)' }}>
      <div className="w-10 h-10 rounded-full border-4 border-white/30 border-t-white animate-spin" />
    </div>
  )

  return <Navigate to={dest} replace />
}

function RequireSellerAuth({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setAuthed(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (authed === null) return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, var(--brand) 0%, #863bff 100%)' }}>
      <div className="w-10 h-10 rounded-full border-4 border-white/30 border-t-white animate-spin" />
    </div>
  )

  if (!authed) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Buyer-wide presence + incoming call ring (work on any page) */}
      <BuyerPresenceTracker />
      <BuyerCallListener />
      <Routes>
        {/* Smart home */}
        <Route path="/" element={<HomeRedirect />} />

        {/* Auth pages */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/acceso" element={<BuyerLoginPage />} />
        {/* Recuperar contraseña del panel. `/nueva-contrasena` es a donde
            vuelve el enlace del correo — sin tilde a propósito: esa URL viaja
            por correo, y la ñ se rompe al copiarla y al listarla en el
            allowlist de redirects de Supabase. */}
        <Route path="/recuperar" element={<RecuperarPasswordPage />} />
        <Route path="/nueva-contrasena" element={<NuevaPasswordPage />} />

        {/* Buyer PWA pages */}
        <Route path="/mis-pedidos" element={<MisPedidosPage />} />
        <Route path="/tienda" element={<TiendaPage />} />
        <Route path="/mi-score" element={<ScorePage />} />

        {/* Public routes */}
        <Route path="/p/:token" element={<OrderChatPage />} />
        <Route path="/vendedor/pedido/:token" element={<VendedorPedidoPage />} />
        <Route path="/landing/:landingId" element={<LandingProductoPage />} />

        {/* Web pública + páginas legales. Viven en TODOS los dominios (la
            plataforma y cada marca): los términos, la política de devoluciones
            y el Libro de Reclamaciones tienen que ser alcanzables desde
            cualquier URL donde alguien compre. */}
        <Route path="/servicios" element={<ServiciosPage />} />
        <Route path="/servicios/:slug" element={<ServicioDetallePage />} />
        <Route path="/carrito" element={<CarritoPage />} />
        <Route path="/pago" element={<PagoPage />} />
        <Route path="/contacto" element={<ContactoPage />} />
        <Route path="/terminos" element={<TerminosPage />} />
        <Route path="/cambios-y-devoluciones" element={<CambiosDevolucionesPage />} />
        <Route path="/libro-de-reclamaciones" element={<LibroReclamacionesPage />} />
        {/* Alias: es como la gente escribe la URL a mano y como la citan otros
            sitios. Mejor redirigir que devolver "esta página no existe". */}
        <Route path="/reclamaciones" element={<Navigate to="/libro-de-reclamaciones" replace />} />
        <Route path="/libro-reclamaciones" element={<Navigate to="/libro-de-reclamaciones" replace />} />
        <Route path="/terminos-y-condiciones" element={<Navigate to="/terminos" replace />} />
        <Route path="/devoluciones" element={<Navigate to="/cambios-y-devoluciones" replace />} />
        <Route path="/privacidad" element={<PrivacidadPage />} />
        {/* Revisión del checkout con packs de ejemplo. Solo en desarrollo:
            no se registra en el bundle de producción. */}
        {import.meta.env.DEV && <Route path="/checkout-demo" element={<CheckoutDemoPage />} />}

        {/* Protected seller routes */}
        <Route element={<RequireSellerAuth><Layout /></RequireSellerAuth>}>
          <Route path="/comprador/chats" element={<ChatsPage />} />
          <Route path="/comprador/chat/:chatId" element={<ChatDetalleComprador />} />
          <Route path="/comprador/perfil" element={<PerfilPage />} />
          <Route path="/vendedor/pedidos" element={<PedidosPage />} />
          {/* Chats, CRM, En vivo y Stats eran cuatro pantallas del mismo dato y
              ahora son cuatro modos de Pedidos. Las rutas viejas se quedan como
              redirección: hay enlaces guardados y push que apuntan ahí. */}
          <Route path="/vendedor/chats" element={<Navigate to="/vendedor/pedidos" replace />} />
          <Route path="/vendedor/crm" element={<Navigate to="/vendedor/pedidos?modo=tablero" replace />} />
          <Route path="/vendedor/mapa" element={<Navigate to="/vendedor/pedidos?modo=mapa" replace />} />
          <Route path="/vendedor/estadisticas" element={<Navigate to="/vendedor/pedidos?modo=resumen" replace />} />
          <Route path="/vendedor/chat/:chatId" element={<ChatDetalleVendedor />} />
          <Route path="/vendedor/productos" element={<ProductosPage />} />
          <Route path="/vendedor/bots" element={<BotIAPage />} />
          <Route path="/vendedor/equipo" element={<EquipoPage />} />
          <Route path="/vendedor/marca" element={<MarcaPage />} />
          <Route path="/vendedor/llamadas" element={<LlamadasPage />} />
          <Route path="/vendedor/clientes" element={<ClientesPage />} />
          <Route path="/vendedor/retencion" element={<RetencionPage />} />
        </Route>

        {/* Sin esto, cualquier URL que no exista renderizaba una página en
            blanco, indistinguible de un error de la app. */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}

function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-4xl">🧭</p>
      <p className="font-black text-gray-800">Esta página no existe</p>
      <p className="text-sm text-gray-500">Revisa el enlace o vuelve al inicio.</p>
      <a href="/" className="mt-2 font-black text-sm px-5 py-2.5 rounded-2xl bg-gray-100 text-gray-700">
        Ir al inicio
      </a>
    </div>
  )
}
