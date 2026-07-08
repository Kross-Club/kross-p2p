import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useKrossStore } from './store'
import Layout from './components/Layout'
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

function HomeRedirect() {
  const { currentUser } = useKrossStore()
  if (currentUser.tipo === 'comprador') return <Navigate to="/comprador/chats" replace />
  return <Navigate to="/vendedor/chats" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/p/:token" element={<OrderChatPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/landing/:landingId" element={<LandingProductoPage />} />
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
