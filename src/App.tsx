import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import BuyerLoginPage from './pages/comprador/BuyerLoginPage'
import MisPedidosPage from './pages/comprador/MisPedidosPage'
import ScorePage from './pages/comprador/ScorePage'
import LandingProductoPage from './pages/LandingProductoPage'
import PrivacidadPage from './pages/PrivacidadPage'
import ChatsPage from './pages/comprador/ChatsPage'
import ChatDetalleComprador from './pages/comprador/ChatDetalleComprador'
import PerfilPage from './pages/comprador/PerfilPage'
import ChatsVendedorPage from './pages/vendedor/ChatsVendedorPage'
import ChatDetalleVendedor from './pages/vendedor/ChatDetalleVendedor'
import ProductosPage from './pages/vendedor/ProductosPage'
import CRMPage from './pages/vendedor/CRMPage'
import BotIAPage from './pages/vendedor/BotIAPage'
import EquipoPage from './pages/vendedor/EquipoPage'
import MarcaPage from './pages/vendedor/MarcaPage'
import LlamadasPage from './pages/vendedor/LlamadasPage'
import EstadisticasPage from './pages/vendedor/EstadisticasPage'
import OrderChatPage from './pages/pedido/OrderChatPage'
import VendedorPedidoPage from './pages/vendedor/VendedorPedidoPage'
import BuyerPresenceTracker from './components/BuyerPresenceTracker'
import BuyerCallListener from './components/BuyerCallListener'

// Smart home: seller session → seller dashboard, buyer session → mis-pedidos, else → acceso
function HomeRedirect() {
  const [dest, setDest] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { setDest('/vendedor/chats'); return }
      const buyer = localStorage.getItem('buyer_session')
      setDest(buyer ? '/mis-pedidos' : '/acceso')
    })
  }, [])

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

        {/* Buyer PWA pages */}
        <Route path="/mis-pedidos" element={<MisPedidosPage />} />
        <Route path="/mi-score" element={<ScorePage />} />

        {/* Public routes */}
        <Route path="/p/:token" element={<OrderChatPage />} />
        <Route path="/vendedor/pedido/:token" element={<VendedorPedidoPage />} />
        <Route path="/landing/:landingId" element={<LandingProductoPage />} />
        <Route path="/privacidad" element={<PrivacidadPage />} />

        {/* Protected seller routes */}
        <Route element={<RequireSellerAuth><Layout /></RequireSellerAuth>}>
          <Route path="/comprador/chats" element={<ChatsPage />} />
          <Route path="/comprador/chat/:chatId" element={<ChatDetalleComprador />} />
          <Route path="/comprador/perfil" element={<PerfilPage />} />
          <Route path="/vendedor/chats" element={<ChatsVendedorPage />} />
          <Route path="/vendedor/chat/:chatId" element={<ChatDetalleVendedor />} />
          <Route path="/vendedor/productos" element={<ProductosPage />} />
          <Route path="/vendedor/crm" element={<CRMPage />} />
          <Route path="/vendedor/bots" element={<BotIAPage />} />
          <Route path="/vendedor/equipo" element={<EquipoPage />} />
          <Route path="/vendedor/marca" element={<MarcaPage />} />
          <Route path="/vendedor/llamadas" element={<LlamadasPage />} />
          <Route path="/vendedor/estadisticas" element={<EstadisticasPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
