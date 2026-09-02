import { describe, it, expect } from 'vitest'
import { pasosDelPedido, pasoActual, courierDelPedido, columnaDelPedido, COLUMNAS, antiguedad,
  estaVivo, esAnulado, contable, pedidoAbierto, conPlataEnJuego, esperaGuiaManual } from './order-tracking'
import { isPickupDispatch } from './session'

const claves = (p: Parameters<typeof pasosDelPedido>[0]) => pasosDelPedido(p).map(x => x.key)

describe('línea de vida del pedido', () => {
  it('a domicilio termina en la calle, no en una agencia', () => {
    expect(claves({ stage: 'confirmado', dispatch_type: 'MOTORIZADO_LIMA' }))
      .toEqual(['nuevo', 'confirmado', 'en_camino', 'entregado'])
  })

  it('por agencia abre los cuatro pasos del envío', () => {
    expect(claves({ stage: 'preparando', dispatch_type: 'AGENCIA_PROVINCIA', agency_name: 'SHALOM' }))
      .toEqual(['nuevo', 'confirmado', 'registrado', 'en_origen', 'transito', 'en_agencia', 'entregado'])
  })

  // Un punto que nunca se va a encender se lee como "algo se atascó".
  it('"validando" solo aparece si hubo adelanto', () => {
    expect(claves({ stage: 'nuevo', dispatch_type: 'MOTORIZADO_LIMA' })).not.toContain('validando')
    expect(claves({ stage: 'nuevo', dispatch_type: 'MOTORIZADO_LIMA', advance_amount: 12 })).toContain('validando')
  })

  // Los pasos se llaman IGUAL en todas partes, venga el pedido por Shalom o por
  // Olva. Antes se especializaban —"Registrado en Shalom", "En agencia de
  // Shalom"— y se leía bien de a uno y mal de a cien: el tablero decía "En
  // origen" y la cabecera del mismo pedido otra cosa, obligando a traducir
  // entre dos pantallas que hablan de lo mismo.
  it('los pasos se llaman igual sea cual sea el courier', () => {
    const shalom = pasosDelPedido({ stage: 'preparando', dispatch_type: 'AGENCIA_PROVINCIA', tracking_courier: 'SHALOM' })
    const olva = pasosDelPedido({ stage: 'preparando', dispatch_type: 'AGENCIA_PROVINCIA', tracking_courier: 'OLVA' })
    expect(shalom.map(p => p.label)).toEqual(olva.map(p => p.label))
  })

  // Y son los MISMOS que rotula el tablero, letra por letra: es lo único que
  // evita que las dos pantallas vuelvan a separarse.
  it('y son los mismos que usa el tablero', () => {
    const pasos = pasosDelPedido({ stage: 'confirmado', dispatch_type: 'AGENCIA_PROVINCIA', tracking_courier: 'SHALOM' })
    for (const c of COLUMNAS) {
      const p = pasos.find(x => x.key === c.key)
      if (p) expect(p.label).toBe(c.label)
    }
    expect(pasos.find(x => x.key === 'en_origen')?.label).toBe('En origen')
    expect(pasos.find(x => x.key === 'en_agencia')?.label).toBe('En destino')
  })

  // El vendedor marca a mano; el courier reporta solo. Cuando discrepan, que el
  // courier diga EN_TRANSITO significa que el paquete SALIÓ.
  it('si los dos relojes discrepan, gana el que va más adelante', () => {
    const p = { stage: 'confirmado', dispatch_type: 'AGENCIA_PROVINCIA', agency_name: 'OLVA', tracking_phase: 'EN_TRANSITO' }
    expect(pasoActual(p)?.key).toBe('transito')
    expect(pasosDelPedido(p).find(x => x.key === 'confirmado')?.estado).toBe('hecho')
  })

  it('sin fase del courier manda el reloj interno', () => {
    expect(pasoActual({ stage: 'confirmado', dispatch_type: 'AGENCIA_PROVINCIA', agency_name: 'SHALOM' })?.key)
      .toBe('confirmado')
  })

  // `preparando` salió del eje: no describía un hecho verificable —nadie marca
  // "ya lo empaqué"—. Los pedidos que la BD todavía tiene así no desaparecen:
  // caen en `confirmado`, que es lo que son — pagados y sin guía.
  it('un `preparando` de la base cae en confirmado, no se pierde', () => {
    expect(columnaDelPedido({ stage: 'preparando', dispatch_type: 'AGENCIA_LIMA', agency_name: 'SHALOM' })).toBe('confirmado')
    expect(pasoActual({ stage: 'preparando', dispatch_type: 'MOTORIZADO_LIMA' })?.key).toBe('confirmado')
  })

  it('"despachado" en un envío por agencia es "registrado", no "en camino"', () => {
    expect(pasoActual({ stage: 'en_camino', dispatch_type: 'AGENCIA_PROVINCIA', agency_name: 'SHALOM' })?.key)
      .toBe('registrado')
    expect(pasoActual({ stage: 'en_camino', dispatch_type: 'MOTORIZADO_LIMA' })?.key).toBe('en_camino')
  })

  // El no entregado cierra la línea donde haya quedado: no es un paso más.
  it('no entregado cierra la línea', () => {
    const pasos = pasosDelPedido({ stage: 'no_entregado', dispatch_type: 'MOTORIZADO_LIMA' })
    expect(pasos.at(-1)).toMatchObject({ key: 'no_entregado', estado: 'activo' })
    expect(pasos.some(p => p.key === 'entregado')).toBe(false)
  })

  it('entregado deja todo hecho', () => {
    const pasos = pasosDelPedido({ stage: 'entregado', dispatch_type: 'MOTORIZADO_LIMA' })
    expect(pasos.at(-1)).toMatchObject({ key: 'entregado', estado: 'activo' })
    expect(pasos.filter(p => p.estado === 'pendiente')).toHaveLength(0)
  })

  it('reconoce el courier y el tipo de envío', () => {
    expect(courierDelPedido({ agency_name: 'shalom' })).toBe('SHALOM')
    expect(courierDelPedido({ tracking_courier: 'OLVA', agency_name: 'SHALOM' })).toBe('OLVA')
    expect(courierDelPedido({ agency_name: 'OTRO' })).toBeNull()
    expect(isPickupDispatch('AGENCIA_PROVINCIA')).toBe(true)
    expect(isPickupDispatch('AGENCIA_LIMA')).toBe(true)
    expect(isPickupDispatch('MOTORIZADO_LIMA')).toBe(false)
  })

  // Un recojo en Lima va por Shalom igual que uno de provincia: le tocan los
  // pasos del courier, no el "en camino" del motorizado. Con la definición
  // partida en dos, este pedido mostraba la línea de domicilio y las fases del
  // courier no aparecían nunca — ni al vendedor ni al comprador.
  it('el recojo en agencia de Lima recorre la línea del courier', () => {
    const pasos = claves({ stage: 'preparando', dispatch_type: 'AGENCIA_LIMA', agency_name: 'SHALOM' })
    expect(pasos).toContain('registrado')
    expect(pasos).toContain('transito')
    expect(pasos).toContain('en_agencia')
    expect(pasos).not.toContain('en_camino')
  })

  it('la fase del courier avanza la línea de un recojo en Lima', () => {
    expect(pasoActual({
      stage: 'preparando', dispatch_type: 'AGENCIA_LIMA',
      agency_name: 'SHALOM', tracking_phase: 'EN_TRANSITO',
    })?.key).toBe('transito')
  })
})

describe('el tablero', () => {
  const AGENCIA = { dispatch_type: 'AGENCIA_LIMA', agency_name: 'SHALOM' }
  const claveColumnas = COLUMNAS.map(c => c.key)

  it('la columna la manda el courier cuando el courier reportó', () => {
    expect(columnaDelPedido({ ...AGENCIA, stage: 'preparando', tracking_phase: 'EN_ORIGEN' })).toBe('en_origen')
    expect(columnaDelPedido({ ...AGENCIA, stage: 'preparando', tracking_phase: 'EN_TRANSITO' })).toBe('transito')
    expect(columnaDelPedido({ ...AGENCIA, stage: 'preparando', tracking_phase: 'EN_DESTINO' })).toBe('en_agencia')
    expect(columnaDelPedido({ ...AGENCIA, stage: 'preparando', tracking_phase: 'ENTREGADO' })).toBe('entregado')
  })

  it('sin reporte del courier manda el reloj del equipo', () => {
    expect(columnaDelPedido({ ...AGENCIA, stage: 'nuevo' })).toBe('nuevo')
    expect(columnaDelPedido({ ...AGENCIA, stage: 'confirmado' })).toBe('confirmado')
    expect(columnaDelPedido({ ...AGENCIA, stage: 'preparando' })).toBe('confirmado')
  })

  // Domicilio y agencia comparten la casilla "va en camino": partirla en dos
  // dejaría media columna vacía en cada tablero sin decir nada nuevo.
  it('el "en camino" del domicilio comparte columna con el tránsito del courier', () => {
    expect(columnaDelPedido({ dispatch_type: 'MOTORIZADO_LIMA', stage: 'en_camino' })).toBe('transito')
    expect(columnaDelPedido({ ...AGENCIA, tracking_phase: 'EN_TRANSITO' })).toBe('transito')
  })

  // El bug que este tablero elimina por construcción: antes el filtro era
  // `stage === columna.key` y lo que no calzaba no salía en ninguna parte.
  // `validando` lo escribe register-buyer en TODO pedido con adelanto.
  it('ningún pedido se cae del tablero', () => {
    const validando = { ...AGENCIA, stage: 'validando', advance_amount: 60 }
    expect(claveColumnas).toContain(columnaDelPedido(validando))
    expect(columnaDelPedido(validando)).toBe('validando')

    // Cada stage real aterriza en una columna, o en el cierre de fracaso.
    const stages = ['nuevo', 'validando', 'confirmado', 'preparando', 'en_camino', 'entregado', 'no_entregado']
    for (const stage of stages) {
      const col = columnaDelPedido({ ...AGENCIA, stage, advance_amount: 60 })
      expect([...claveColumnas, 'no_entregado']).toContain(col)
    }
  })

  it('el fracaso no es una columna del tablero', () => {
    expect(columnaDelPedido({ ...AGENCIA, stage: 'no_entregado' })).toBe('no_entregado')
    expect(claveColumnas).not.toContain('no_entregado')
  })
})

describe('registrado no es lo mismo que en origen', () => {
  const AGENCIA = { dispatch_type: 'AGENCIA_LIMA', agency_name: 'SHALOM' }

  it('la línea separa los dos pasos', () => {
    const pasos = claves({ ...AGENCIA, stage: 'preparando' })
    expect(pasos).toEqual([
      'nuevo', 'confirmado', 'registrado', 'en_origen', 'transito', 'en_agencia', 'entregado',
    ])
  })

  // Hay guía pero el courier todavía no reporta: el paquete sigue en nuestro
  // almacén. Es el hueco donde se pierde la plata y ahora tiene columna.
  it('con guía y sin reporte del courier el pedido queda en registrado', () => {
    expect(columnaDelPedido({ ...AGENCIA, stage: 'preparando', tracking_numero: '12345' }))
      .toBe('registrado')
  })

  it('EN_ORIGEN significa que el courier YA lo tiene', () => {
    expect(columnaDelPedido({ ...AGENCIA, stage: 'preparando', tracking_numero: '12345', tracking_phase: 'EN_ORIGEN' }))
      .toBe('en_origen')
  })

  it('sin guía no se adelanta a registrado', () => {
    expect(columnaDelPedido({ ...AGENCIA, stage: 'preparando' })).toBe('confirmado')
  })

  it('la guía nunca hace retroceder a un pedido que ya va más adelante', () => {
    expect(columnaDelPedido({ ...AGENCIA, tracking_numero: '12345', tracking_phase: 'EN_DESTINO' }))
      .toBe('en_agencia')
  })
})

describe('cuánto lleva parado', () => {
  it('mide desde que entró a la fase cuando el courier la fechó', () => {
    const hace3d = new Date(Date.now() - 3 * 86400_000).toISOString()
    const a = antiguedad({ tracking_phase_at: hace3d }, Date.now())
    expect(a?.dias).toBe(3)
    expect(a?.exacta).toBe(true)
  })

  // Sin fecha de fase, lo único que sabemos es la edad del pedido. Se devuelve
  // igual pero marcada `exacta: false`: la pantalla no debe afirmar "3 días en
  // esta columna" cuando lo que sabe es "3 días desde que entró el pedido".
  it('sin fecha de fase cae a la edad del pedido y lo dice', () => {
    const hace5d = new Date(Date.now() - 5 * 86400_000).toISOString()
    const a = antiguedad({ created_at: hace5d }, Date.now())
    expect(a?.dias).toBe(5)
    expect(a?.exacta).toBe(false)
  })

  it('sin ninguna fecha no inventa nada', () => {
    expect(antiguedad({}, Date.now())).toBeNull()
  })

  it('la demora del courier es una alerta, no una fase', () => {
    const hoy = new Date().toISOString()
    expect(antiguedad({ created_at: hoy, tracking_demora_at: hoy }, Date.now())?.demorado).toBe(true)
    expect(antiguedad({ created_at: hoy }, Date.now())?.demorado).toBe(false)
  })
})

// ─── Muerto de dos maneras distintas ─────────────────────────────────────────
//
// Un CANCELADO es una venta que existió y se perdió: duele, y tiene que doler
// en la conversión. Un ANULADO nunca fue una venta —se creó por error, o es una
// prueba— y contarlo junto al otro ensucia el único número que la marca usa
// para decidir cuánto invertir. Por eso son dos preguntas y no una.
describe('cancelado y anulado no son lo mismo', () => {
  it('los dos sacan al pedido de las vistas vivas', () => {
    expect(estaVivo({ status: 'cancelado' })).toBe(false)
    expect(estaVivo({ status: 'anulado' })).toBe(false)
    expect(estaVivo({ status: 'active' })).toBe(true)
  })

  it('pero solo el anulado sale de las estadísticas', () => {
    expect(contable({ status: 'cancelado' })).toBe(true)
    expect(contable({ status: 'anulado' })).toBe(false)
    expect(contable({ status: 'active' })).toBe(true)
  })

  it('`esAnulado` no se deja confundir por el cancelado', () => {
    expect(esAnulado({ status: 'anulado' })).toBe(true)
    expect(esAnulado({ status: 'cancelado' })).toBe(false)
    expect(esAnulado({})).toBe(false)
  })

  // `no_entregado` NO mata al pedido: es la mitad de la tasa de entrega
  // (entregado / (entregado + no_entregado)) y esconderlo borraría el número
  // que más duele.
  it('un no entregado sigue vivo y sigue contando', () => {
    expect(estaVivo({ status: 'active', stage: 'no_entregado' })).toBe(true)
    expect(contable({ status: 'active' })).toBe(true)
  })
})

describe('¿sigue abierto?', () => {
  const AGENCIA_P = { dispatch_type: 'AGENCIA_PROVINCIA', agency_name: 'SHALOM' }

  it('un pedido en camino está abierto', () => {
    expect(pedidoAbierto({ ...AGENCIA_P, stage: 'confirmado', status: 'active' })).toBe(true)
    expect(pedidoAbierto({ ...AGENCIA_P, tracking_phase: 'EN_TRANSITO', status: 'active' })).toBe(true)
  })

  it('entregado, caído, cancelado y anulado están cerrados', () => {
    expect(pedidoAbierto({ ...AGENCIA_P, stage: 'entregado', status: 'active' })).toBe(false)
    expect(pedidoAbierto({ ...AGENCIA_P, stage: 'no_entregado', status: 'active' })).toBe(false)
    expect(pedidoAbierto({ ...AGENCIA_P, stage: 'confirmado', status: 'cancelado' })).toBe(false)
    expect(pedidoAbierto({ ...AGENCIA_P, stage: 'confirmado', status: 'anulado' })).toBe(false)
  })

  // El courier manda: que reporte ENTREGADO cierra el pedido aunque nadie del
  // equipo haya marcado nada.
  it('el reporte del courier cierra el pedido aunque el equipo no lo haya movido', () => {
    expect(pedidoAbierto({ ...AGENCIA_P, stage: 'confirmado', tracking_phase: 'ENTREGADO', status: 'active' }))
      .toBe(false)
  })
})

// El anillo de avance del pago arranca donde arranca la plata. Antes de
// `confirmado` no hay nada cobrado que mostrar, y un anillo vacío en cada
// tarjeta de las dos primeras columnas enseña a ignorarlo justo donde importa.
describe('desde dónde hay plata en juego', () => {
  it('no antes de confirmado', () => {
    expect(conPlataEnJuego('nuevo')).toBe(false)
    expect(conPlataEnJuego('validando')).toBe(false)
  })

  it('sí de confirmado en adelante, hasta el final', () => {
    expect(conPlataEnJuego('confirmado')).toBe(true)
    expect(conPlataEnJuego('registrado')).toBe(true)
    expect(conPlataEnJuego('transito')).toBe(true)
    expect(conPlataEnJuego('entregado')).toBe(true)
  })

  // La frontera se calcula contra COLUMNAS, no con una lista aparte: si mañana
  // entra una columna entre `validando` y `confirmado`, esto sigue siendo
  // cierto sin que nadie lo edite.
  it('la frontera sale del eje, no de una copia', () => {
    const desde = COLUMNAS.findIndex(c => c.key === 'confirmado')
    for (const [i, c] of COLUMNAS.entries()) {
      expect(conPlataEnJuego(c.key)).toBe(i >= desde)
    }
  })
})

// `preparando` salió del eje. Lo que la BD ya tiene guardado no se pierde: cae
// en `confirmado`, que es lo que esos pedidos son —cobrados y sin guía—. Es
// también la columna donde se atasca lo que pagó pero el API del courier
// rechazó, y por eso tiene que verse llena en vez de repartida en dos.
describe('el eje sin preparando', () => {
  it('preparando no es una columna', () => {
    expect(COLUMNAS.map(c => c.key)).not.toContain('preparando')
  })

  it('las columnas van de pedido creado a entregado, sin huecos', () => {
    expect(COLUMNAS.map(c => c.key)).toEqual([
      'nuevo', 'validando', 'confirmado', 'registrado', 'en_origen', 'transito', 'en_agencia', 'entregado',
    ])
  })
})

// El atasco más caro y el más invisible: la plata entró, el API del courier
// rechazó el registro, y el pedido se queda en `confirmado` — donde se ve igual
// que uno que todavía no se ha procesado. Uno espera a la máquina; el otro
// espera a una persona que no sabe que le toca.
describe('cobrado y esperando guía a mano', () => {
  it('solo el rechazo del proveedor levanta la alerta', () => {
    expect(esperaGuiaManual({ shalom_order_status: 'FAILED' })).toBe(true)
    expect(esperaGuiaManual({ shalom_order_status: 'failed' })).toBe(true)
  })

  // Marcar a todos los que no tienen guía convertiría la alerta en decoración:
  // un pedido recién cobrado tampoco la tiene, y eso es lo normal.
  it('no confunde "todavía no se procesó" con "lo rechazaron"', () => {
    expect(esperaGuiaManual({})).toBe(false)
    expect(esperaGuiaManual({ shalom_order_status: null })).toBe(false)
    expect(esperaGuiaManual({ shalom_order_status: 'PENDING' })).toBe(false)
    expect(esperaGuiaManual({ shalom_order_status: 'CREATED' })).toBe(false)
    expect(esperaGuiaManual({ shalom_order_status: 'SIMULADO' })).toBe(false)
    expect(esperaGuiaManual({ shalom_order_status: 'SKIPPED' })).toBe(false)
  })

  // Y un FAILED que YA tiene guía dejó de esperar: alguien la registró a mano
  // o el reintento por API la emitió. La alerta sin esto quedaba prendida para
  // siempre sobre un pedido resuelto.
  it('la guía registrada apaga la alerta, venga por donde venga', () => {
    expect(esperaGuiaManual({ shalom_order_status: 'FAILED', tracking_numero: '462767' })).toBe(false)
    expect(esperaGuiaManual({ shalom_order_status: 'FAILED', tracking_ose_id: '990011' })).toBe(false)
  })
})
