import { describe, it, expect, vi, beforeEach } from 'vitest'

// El doble imita lo que de verdad hace @supabase/realtime-js 2.110:
//   · `channel(topic)` DEVUELVE el canal existente si ya hay uno con ese topic
//   · `on(...)` después de `subscribe()` LANZA
// Sin esas dos reglas la prueba no probaría nada: el bug que arregla este
// módulo nace justo de ellas.
const canalesFalsos = new Map<string, FakeChannel>()
let quitados: string[] = []

class FakeChannel {
  suscrito = false
  ataduras: { tipo: string; evento: string; cb: (x: unknown) => void }[] = []
  estado: Record<string, unknown> = {}
  config: unknown
  topic: string
  constructor(topic: string) { this.topic = topic }
  on(tipo: string, filtro: { event: string }, cb: (x: unknown) => void) {
    if (this.suscrito) throw new Error(`cannot add \`${tipo}\` callbacks for ${this.topic} after \`subscribe()\`.`)
    this.ataduras.push({ tipo, evento: filtro.event, cb })
    return this
  }
  subscribe(cb?: (estado: string) => void) { this.suscrito = true; cb?.('SUBSCRIBED'); return this }
  presenceState() { return this.estado }
  /** Simula un broadcast entrante. */
  emitir(event: string, payload: Record<string, unknown>) {
    for (const a of this.ataduras) {
      if (a.tipo === 'broadcast' && (a.evento === '*' || a.evento === event)) {
        a.cb({ type: 'broadcast', event, payload })
      }
    }
  }
  sync(estado: Record<string, unknown>) {
    this.estado = estado
    for (const a of this.ataduras) if (a.tipo === 'presence') a.cb({ event: 'sync' })
  }
}

vi.mock('./supabase', () => ({
  supabase: {
    channel: (topic: string, opts?: { config?: unknown }) => {
      const existente = canalesFalsos.get(topic)
      if (existente) return existente
      const nuevo = new FakeChannel(topic)
      nuevo.config = opts?.config
      canalesFalsos.set(topic, nuevo)
      return nuevo
    },
    removeChannel: (c: FakeChannel) => { quitados.push(c.topic); canalesFalsos.delete(c.topic) },
  },
}))

const { escuchar } = await import('./realtime')

const canal = (topic: string) => canalesFalsos.get(topic) as FakeChannel

// Cada prueba estrena topic. El registro de `realtime.ts` es de módulo y vive
// entre pruebas —igual que en la app, donde el canal sobrevive a las pantallas—,
// así que compartir nombre haría que una prueba heredara el canal de la otra.
let n = 0
const topic = (nombre: string) => `${nombre}:${++n}`
beforeEach(() => { canalesFalsos.clear(); quitados = [] })

describe('un canal compartido entre pantallas', () => {
  // ESTE es el bug: la lista y el pedido abierto en panel piden el mismo topic.
  // Antes, la segunda le añadía un manejador a un canal ya suscrito, la
  // excepción subía por el efecto y desmontaba el árbol entero.
  it('la segunda pantalla no ata nada sobre un canal ya suscrito', () => {
    const t = topic('order')
    escuchar(t, { broadcast: { new_message: () => {} } })
    const c = canal(t)
    expect(c.suscrito).toBe(true)
    const atadurasIniciales = c.ataduras.length

    expect(() => escuchar(t, { broadcast: { stage_update: () => {} } })).not.toThrow()
    expect(c.ataduras.length).toBe(atadurasIniciales)
  })

  it('un solo canal por topic, con una sola atadura de cada tipo', () => {
    const t = topic('order')
    escuchar(t, { broadcast: { a: () => {} }, presencia: () => {} })
    escuchar(t, { broadcast: { b: () => {} } })
    expect(canalesFalsos.size).toBe(1)
    expect(canal(t).ataduras.map(a => a.tipo)).toEqual(['broadcast', 'presence'])
  })

  it('cada pantalla recibe lo suyo, y solo lo suyo', () => {
    const uno: string[] = []
    const dos: string[] = []
    const t = topic('order')
    escuchar(t, { broadcast: { new_message: m => uno.push(String(m.payload.x)) } })
    escuchar(t, { broadcast: { new_message: m => dos.push(String(m.payload.x)), typing: () => dos.push('typing') } })

    canal(t).emitir('new_message', { x: 'hola' })
    canal(t).emitir('typing', {})

    expect(uno).toEqual(['hola'])
    expect(dos).toEqual(['hola', 'typing'])
  })

  it('la presencia llega con el estado ya resuelto', () => {
    let visto: string[] = []
    const t = topic('presence:buyers')
    escuchar(t, { presencia: estado => { visto = Object.keys(estado) } })
    canal(t).sync({ 'buyer-7': [] })
    expect(visto).toEqual(['buyer-7'])
  })

  it('el canal se cierra recién cuando se va la última pantalla', () => {
    const t = topic('order')
    const a = escuchar(t, { broadcast: { x: () => {} } })
    const b = escuchar(t, { broadcast: { y: () => {} } })

    a.cerrar()
    expect(quitados).toEqual([])

    b.cerrar()
    expect(quitados).toEqual([t])
  })

  // El efecto de React limpia dos veces en StrictMode. Descontar dos veces
  // dejaría a la otra pantalla enganchada a un canal ya cerrado.
  it('cerrar dos veces no se lleva a la otra pantalla', () => {
    const t = topic('order')
    const a = escuchar(t, { broadcast: { x: () => {} } })
    escuchar(t, { broadcast: { y: () => {} } })
    a.cerrar()
    a.cerrar()
    expect(quitados).toEqual([])
  })

  it('después de cerrarse, el topic vuelve a abrirse limpio', () => {
    const t = topic('order')
    escuchar(t, { broadcast: { x: () => {} } }).cerrar()
    const recibido: string[] = []
    escuchar(t, { broadcast: { x: m => recibido.push(String(m.payload.v)) } })
    canal(t).emitir('x', { v: 'ok' })
    expect(recibido).toEqual(['ok'])
  })

  // Un canal compartido no puede dejar muda a una pantalla por el error de otra.
  it('el error de un manejador no corta a los demás', () => {
    const llegaron: string[] = []
    const quejas = vi.spyOn(console, 'error').mockImplementation(() => {})
    const t = topic('order')
    escuchar(t, { broadcast: { x: () => { throw new Error('boom') } } })
    escuchar(t, { broadcast: { x: () => llegaron.push('segunda') } })
    expect(() => canal(t).emitir('x', {})).not.toThrow()
    expect(llegaron).toEqual(['segunda'])
    // Que no corte no significa que se calle: el error se registra.
    expect(quejas).toHaveBeenCalled()
    quejas.mockRestore()
  })

  // La clave de presencia solo se puede poner al crear el canal. Quien la
  // necesita monta primero (el rastreador vive en Layout); quien llega después
  // se engancha y punto.
  it('la config y el estado de suscripción son de quien abre el topic', () => {
    const t = topic('presence:sellers')
    const estados: string[] = []
    escuchar(t, { config: { presence: { key: 'kevin' } }, alSuscribir: e => estados.push(e) })
    expect(canal(t).config).toEqual({ presence: { key: 'kevin' } })
    expect(estados).toEqual(['SUBSCRIBED'])

    const tarde: string[] = []
    escuchar(t, { config: { presence: { key: 'otro' } }, alSuscribir: e => tarde.push(e) })
    expect(canal(t).config).toEqual({ presence: { key: 'kevin' } })
    expect(tarde).toEqual([])
  })

  it('topics distintos son canales distintos', () => {
    escuchar(topic('order'), { broadcast: { x: () => {} } })
    escuchar(topic('order'), { broadcast: { x: () => {} } })
    expect(canalesFalsos.size).toBe(2)
  })
})
