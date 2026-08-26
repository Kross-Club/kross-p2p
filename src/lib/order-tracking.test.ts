import { describe, it, expect } from 'vitest'
import { pasosDelPedido, pasoActual, courierDelPedido, columnaDelPedido, COLUMNAS, antiguedad } from './order-tracking'
import { isPickupDispatch } from './session'

const claves = (p: Parameters<typeof pasosDelPedido>[0]) => pasosDelPedido(p).map(x => x.key)

describe('línea de vida del pedido', () => {
  it('a domicilio termina en la calle, no en una agencia', () => {
    expect(claves({ stage: 'confirmado', dispatch_type: 'MOTORIZADO_LIMA' }))
      .toEqual(['nuevo', 'confirmado', 'preparando', 'en_camino', 'entregado'])
  })

  it('por agencia abre los cuatro pasos del envío', () => {
    expect(claves({ stage: 'preparando', dispatch_type: 'AGENCIA_PROVINCIA', agency_name: 'SHALOM' }))
      .toEqual(['nuevo', 'confirmado', 'preparando', 'registrado', 'en_origen', 'transito', 'en_agencia', 'entregado'])
  })

  // Un punto que nunca se va a encender se lee como "algo se atascó".
  it('"validando" solo aparece si hubo adelanto', () => {
    expect(claves({ stage: 'nuevo', dispatch_type: 'MOTORIZADO_LIMA' })).not.toContain('validando')
    expect(claves({ stage: 'nuevo', dispatch_type: 'MOTORIZADO_LIMA', advance_amount: 12 })).toContain('validando')
  })

  it('el paso del courier lleva su nombre', () => {
    const shalom = pasosDelPedido({ stage: 'preparando', dispatch_type: 'AGENCIA_PROVINCIA', tracking_courier: 'SHALOM' })
    const olva = pasosDelPedido({ stage: 'preparando', dispatch_type: 'AGENCIA_PROVINCIA', tracking_courier: 'OLVA' })
    expect(shalom.find(p => p.key === 'registrado')?.label).toBe('Registrado en Shalom')
    expect(olva.find(p => p.key === 'registrado')?.label).toBe('Registrado en Olva')
  })

  // El vendedor marca a mano; el courier reporta solo. Cuando discrepan, que el
  // courier diga EN_TRANSITO significa que el paquete SALIÓ.
  it('si los dos relojes discrepan, gana el que va más adelante', () => {
    const p = { stage: 'confirmado', dispatch_type: 'AGENCIA_PROVINCIA', agency_name: 'OLVA', tracking_phase: 'EN_TRANSITO' }
    expect(pasoActual(p)?.key).toBe('transito')
    expect(pasosDelPedido(p).find(x => x.key === 'preparando')?.estado).toBe('hecho')
  })

  it('sin fase del courier manda el reloj interno', () => {
    expect(pasoActual({ stage: 'preparando', dispatch_type: 'AGENCIA_PROVINCIA', agency_name: 'SHALOM' })?.key)
      .toBe('preparando')
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
    expect(columnaDelPedido({ ...AGENCIA, stage: 'preparando' })).toBe('preparando')
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
      'nuevo', 'confirmado', 'preparando', 'registrado', 'en_origen', 'transito', 'en_agencia', 'entregado',
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
    expect(columnaDelPedido({ ...AGENCIA, stage: 'preparando' })).toBe('preparando')
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
