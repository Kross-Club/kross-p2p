import { create } from 'zustand'
import type { Usuario, Tienda, Producto, Landing, ClientePerfil, Chat, Pedido, Vendedora, Bot, ConfigIA, Valoracion, Reclamo, Mensaje, PedidoEtapa } from '../types'
import { USUARIOS, TIENDAS, PRODUCTOS, LANDINGS, CLIENTES, CHATS, PEDIDOS, VENDEDORAS, BOTS, CONFIGS_IA, VALORACIONES, RECLAMOS } from '../data/seed'

interface KrossState {
  currentUser: Usuario
  usuarios: Usuario[]
  tiendas: Tienda[]
  productos: Producto[]
  landings: Landing[]
  clientes: ClientePerfil[]
  chats: Chat[]
  pedidos: Pedido[]
  vendedoras: Vendedora[]
  bots: Bot[]
  configsIA: ConfigIA[]
  valoraciones: Valoracion[]
  reclamos: Reclamo[]

  switchUser: (userId: string) => void
  sendMessage: (chatId: string, mensaje: Omit<Mensaje, 'id' | 'timestamp'>) => void
  moveOrderStage: (pedidoId: string, etapa: PedidoEtapa, motivo?: string) => void
  toggleProduct: (productoId: string) => void
  marcarRecibido: (pedidoId: string) => void
  requestLandingApproval: (landingId: string) => void
  openNewChat: (clienteId: string, tiendaId: string, productoId: string, landingId: string, nombre: string, direccion: string, whatsapp?: string) => string
  updateBotPaso: (botId: string, pasoIdx: number, field: string, value: unknown) => void
  updateConfigIA: (iaId: string, updates: Partial<ConfigIA>) => void
  addVendedora: (vendedora: Omit<Vendedora, 'id'>) => void
  updateVendedoraAlcance: (vendedoraId: string, alcance: 'todos' | 'solo_asignados') => void
  addValoracion: (val: Omit<Valoracion, 'id'>) => void
  addReclamo: (rec: Omit<Reclamo, 'id'>) => void
}

export const useKrossStore = create<KrossState>((set, get) => ({
  currentUser: USUARIOS[0],
  usuarios: USUARIOS,
  tiendas: TIENDAS,
  productos: PRODUCTOS,
  landings: LANDINGS,
  clientes: CLIENTES,
  chats: CHATS,
  pedidos: PEDIDOS,
  vendedoras: VENDEDORAS,
  bots: BOTS,
  configsIA: CONFIGS_IA,
  valoraciones: VALORACIONES,
  reclamos: RECLAMOS,

  switchUser: (userId) => {
    const user = get().usuarios.find(u => u.id === userId)
    if (user) set({ currentUser: user })
  },

  sendMessage: (chatId, mensaje) => {
    const msg: Mensaje = {
      ...mensaje,
      id: `m${Date.now()}`,
      timestamp: new Date().toISOString(),
    }
    set(state => ({
      chats: state.chats.map(c =>
        c.id === chatId ? { ...c, mensajes: [...c.mensajes, msg] } : c
      )
    }))
  },

  moveOrderStage: (pedidoId, etapa, motivo) => {
    set(state => ({
      pedidos: state.pedidos.map(p =>
        p.id === pedidoId
          ? {
              ...p,
              etapa,
              motivoCancelacion: motivo || p.motivoCancelacion,
              historial: [...p.historial, { etapa, fecha: new Date().toISOString() }]
            }
          : p
      )
    }))
  },

  toggleProduct: (productoId) => {
    set(state => ({
      productos: state.productos.map(p =>
        p.id === productoId
          ? { ...p, estado: p.estado === 'activo' ? 'inactivo' : 'activo' }
          : p
      )
    }))
  },

  marcarRecibido: (pedidoId) => {
    const pedido = get().pedidos.find(p => p.id === pedidoId)
    if (!pedido) return
    const cliente = get().clientes.find(c => c.id === pedido.clienteId)
    if (!cliente) return
    const newScore = Math.min(100, cliente.score + 10)
    set(state => ({
      pedidos: state.pedidos.map(p =>
        p.id === pedidoId ? { ...p, clienteMarcoRecibido: true } : p
      ),
      clientes: state.clientes.map(c =>
        c.id === pedido.clienteId
          ? { ...c, score: newScore, puntos: c.puntos + 100 }
          : c
      )
    }))
  },

  requestLandingApproval: (landingId) => {
    set(state => ({
      landings: state.landings.map(l =>
        l.id === landingId ? { ...l, estadoAprobacion: 'pendiente_aprobacion', aprobadoPorKross: false } : l
      )
    }))
  },

  openNewChat: (clienteId, tiendaId, productoId, landingId, nombre, direccion, _whatsapp?) => {
    const landing = get().landings.find(l => l.id === landingId)
    const chatId = `ch${Date.now()}`
    const pedidoId = `ped${Date.now()}`
    const newChat: Chat = {
      id: chatId,
      clienteId,
      tiendaId,
      vendedoraAsignadaId: null,
      productoId,
      estado: 'activo',
      mensajes: [
        {
          id: `m${Date.now()}a`,
          autor: 'bot',
          tipo: 'audio',
          contenido: { duracion: '0:42', url: '#' },
          timestamp: new Date().toISOString(),
        },
        (() => {
          const primerNombre = nombre.split(' ')[0]
          const entrega = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
          const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
          const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
          const fechaStr = `${dias[entrega.getDay()]} ${entrega.getDate()} de ${meses[entrega.getMonth()]}`
          return {
            id: `m${Date.now()}ab`,
            autor: 'bot' as const,
            tipo: 'texto' as const,
            contenido: `¡Hola ${primerNombre}! 🎉 Tu pedido llegará a la puerta de tu casa sin ningún adelanto si confirmas ahora y contestas nuestras llamadas de confirmación. Te estará llegando el ${fechaStr} entre las 11 am y 6 pm. Solo necesitamos que nos confirmes la llamada que llegará en un momento — mientras tanto puedes resolver dudas por aquí 👇`,
            timestamp: new Date(Date.now() + 100).toISOString(),
          }
        })(),
        ...(landing && landing.faq.length > 0 ? [{
          id: `m${Date.now()}c`,
          autor: 'bot' as const,
          tipo: 'botones' as const,
          contenido: {
            pregunta: '¿Tienes alguna duda?',
            opciones: [...landing.faq.map(f => f.pregunta), 'Chatear con un asesor'],
            respuestas: Object.fromEntries(landing.faq.map(f => [f.pregunta, f.respuesta])),
          },
          timestamp: new Date(Date.now() + 200).toISOString(),
        }] : []),
        {
          id: `m${Date.now()}d`,
          autor: 'bot' as const,
          tipo: 'botones' as const,
          contenido: {
            pregunta: 'Para asegurar tu pedido y que llegue puntual, confírmalo ahora:',
            opciones: ['✅ Sí, confirmo mi pedido'],
            respuestas: { '✅ Sí, confirmo mi pedido': '¡Perfecto! 🎉 Tu pedido está confirmado. Recibirás una llamada en breve para coordinar la entrega.' },
          },
          timestamp: new Date(Date.now() + 400).toISOString(),
        },
      ]
    }
    const newPedido: Pedido = {
      id: pedidoId,
      clienteId,
      productoId,
      tiendaId,
      chatId,
      etapa: 'nuevo',
      historial: [{ etapa: 'nuevo', fecha: new Date().toISOString() }],
    }
    // Update or create client profile
    const existingCliente = get().clientes.find(c => c.usuarioId === clienteId)
    set(state => ({
      chats: [...state.chats, newChat],
      pedidos: [...state.pedidos, newPedido],
      clientes: existingCliente
        ? state.clientes
        : [...state.clientes, { id: `c${Date.now()}`, usuarioId: clienteId, nombre, direccion, score: 0, puntos: 0 }]
    }))
    return chatId
  },

  updateBotPaso: (botId, pasoIdx, field, value) => {
    set(state => ({
      bots: state.bots.map(b =>
        b.id === botId
          ? { ...b, pasos: b.pasos.map((p, i) => i === pasoIdx ? { ...p, [field]: value } : p) }
          : b
      )
    }))
  },

  updateConfigIA: (iaId, updates) => {
    set(state => ({
      configsIA: state.configsIA.map(c => c.id === iaId ? { ...c, ...updates } : c)
    }))
  },

  addVendedora: (vendedora) => {
    set(state => ({
      vendedoras: [...state.vendedoras, { ...vendedora, id: `v${Date.now()}` }]
    }))
  },

  updateVendedoraAlcance: (vendedoraId, alcance) => {
    set(state => ({
      vendedoras: state.vendedoras.map(v => v.id === vendedoraId ? { ...v, alcance } : v)
    }))
  },

  addValoracion: (val) => {
    set(state => ({
      valoraciones: [...state.valoraciones, { ...val, id: `val${Date.now()}` }]
    }))
  },

  addReclamo: (rec) => {
    set(state => ({
      reclamos: [...state.reclamos, { ...rec, id: `rec${Date.now()}` }]
    }))
  },
}))
