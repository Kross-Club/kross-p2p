export type UserType = 'comprador' | 'vendedor' | 'vendedora'

export interface Usuario {
  id: string
  nombre: string
  tipo: UserType
  avatar: string
  tiendaId?: string
}

export interface Tienda {
  id: string
  nombre: string
  dueno_id: string
  logo: string
  descripcion: string
}

export interface Producto {
  id: string
  tiendaId: string
  nombre: string
  descripcion: string
  precio: number
  imagenes: string[]
  estado: 'activo' | 'inactivo'
  landingId: string
}

export interface Recomendacion {
  id: string
  nombre: string
  texto: string
  estrellas: number
  fecha: string
}

export interface FAQ {
  pregunta: string
  respuesta: string
}

export interface Oferta {
  nombre: string
  precio: number
  descripcion: string
}

export interface Landing {
  id: string
  productoId: string
  titulo: string
  descripcionLarga: string
  recomendaciones: Recomendacion[]
  ofertas: Oferta[]
  faq: FAQ[]
  aprobadoPorKross: boolean
  estadoAprobacion: 'aprobado' | 'pendiente_aprobacion'
}

export interface Beneficio {
  id: string
  nombre: string
  descripcion: string
  scoreRequerido: number
}

export interface ClientePerfil {
  id: string
  usuarioId: string
  nombre: string
  direccion: string
  score: number
  puntos: number
}

export type MensajeTipo = 'texto' | 'audio' | 'precios' | 'botones'
export type MensajeAutor = 'cliente' | 'vendedor' | 'bot' | 'ia'

export interface MensajeAudio {
  duracion: string
  url: string
}

export interface MensajePrecioOpcion {
  nombre: string
  precio: number
  descripcion: string
}

export interface MensajeBotones {
  pregunta?: string
  opciones: string[]
  respuestas: Record<string, string>
  seleccionada?: string
}

export interface Mensaje {
  id: string
  autor: MensajeAutor
  tipo: MensajeTipo
  contenido: string | MensajeAudio | MensajePrecioOpcion[] | MensajeBotones
  timestamp: string
}

export type ChatEstado = 'activo' | 'cerrado' | 'pendiente'

export interface Chat {
  id: string
  clienteId: string
  tiendaId: string
  vendedoraAsignadaId: string | null
  productoId: string
  estado: ChatEstado
  mensajes: Mensaje[]
}

export type PedidoEtapa =
  | 'nuevo'
  | 'asesorando'
  | 'confirmo'
  | 'despacho'
  | 'ruta'
  | 'destino'
  | 'entregado'
  | 'cancelado'

export interface HistorialEtapa {
  etapa: PedidoEtapa
  fecha: string
}

export interface Pedido {
  id: string
  clienteId: string
  productoId: string
  tiendaId: string
  chatId: string
  etapa: PedidoEtapa
  motivoCancelacion?: string
  historial: HistorialEtapa[]
  clienteMarcoRecibido?: boolean
}

export interface Vendedora {
  id: string
  nombre: string
  tiendaId: string
  alcance: 'todos' | 'solo_asignados'
  avatar: string
}

export interface BotPaso {
  id: string
  pregunta: string
  opciones: string[]
  respuestas: Record<string, string>
}

export interface Bot {
  id: string
  tiendaId: string
  nombre: string
  pasos: BotPaso[]
}

export interface ConfigIA {
  id: string
  tiendaId: string
  estado: 'activo' | 'inactivo'
  instrucciones: string
  recontacto: {
    intencion: string
    mensajeAbridor: string
  }
}

export interface Valoracion {
  id: string
  productoId: string
  clienteId: string
  estrellas: number
  comentario: string
  fecha: string
}

export interface Reclamo {
  id: string
  pedidoId: string
  clienteId: string
  motivo: string
  estado: 'abierto' | 'en_revision' | 'resuelto'
  fecha: string
}
