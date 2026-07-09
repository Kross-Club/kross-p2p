import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import LandingProductoPage from './pages/LandingProductoPage'
import ChatsPage from './pages/comprador/ChatsPage'
import ChatDetalleComprador from './pages/comprador/ChatDetalleComprador'
import PerfilPage from './pages/comprador/PerfilPage'
import ChatsVendedorPage from './pages/vendedor/ChatsVendedorPage'
import ChatDetalleVendedor from './pages/vendedor/ChatDetalleVendedor'
import ProductosPage from './pages/vendedor/ProductosPage'
import CRMPage from './pages/vendedor/CRMPage'
import BotIAPage from './pages/vendedor/BotIAPage'
import EquipoPage from './pages/vendedor/EquipoPage'
import EstadisticasPage from './pages/vendedor/EstadisticasPage'
import OrderChatPage from './pages/pedido/OrderChatPage'
import VendedorPedidoPage from './pages/vendedor/VendedorPedidoPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setAuthed(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (authed === null) return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #55C8F5 0%, #863bff 100%)' }}>
      <div className="w-10 h-10 rounded-full border-4 border-white/30 border-t-white animate-spin" />
    </div>
  )

  if (!authed) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes — no auth needed */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/p/:token" element={<OrderChatPage />} />
        <Route path="/vendedor/pedido/:token" element={<VendedorPedidoPage />} />
        <Route path="/landing/:landingId" element={<LandingProductoPage />} />

        {/* Protected seller routes */}
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/" element={<Navigate to="/vendedor/chats" replace />} />
          <Route path="/comprador/chats" element={<ChatsPage />} />
          <Route path="/comprador/chat/:chatId" element={<ChatDetalleComprador />} />
          <Route path="/comprador/perfil" element={<PerfilPage />} />
          <Route path="/vendedor/chats" element={<ChatsVendedorPage />} />
          <Route path="/vendedor/chat/:chatId" element={<ChatDetalleVendedor />} />
          <Route path="/vendedor/productos" element={<ProductosPage />} />
          <Route path="/vendedor/crm" element={<CRMPage />} />
          <Route path="/vendedor/bots" element={<BotIAPage />} />
          <Route path="/vendedor/equipo" element={<EquipoPage />} />
          <Route path="/vendedor/estadisticas" element={<EstadisticasPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
