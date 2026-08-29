import { describe, it, expect } from 'vitest'
import { siguientePaso, pasoActual, COLUMNAS, PASOS } from './order-tracking'
import type { PedidoRastreable } from './order-tracking'

// ─── Lo que sigue, en la línea de ESTE pedido ────────────────────────────────
//
// El botón de avanzar del chat ofrecía la siguiente etapa de la lista cruda de
// la base mientras el chip de al lado pintaba el paso del eje. Dos listas en la
// misma fila, y el resultado era el de la captura: un pedido en "Registrado"
// con un botón que decía "✅ Entregado", saltándose media línea.

const agencia = (p: Partial<PedidoRastreable> = {}): PedidoRastreable => ({
  dispatch_type: 'AGENCIA_PROVINCIA', agency_name: 'SHALOM', advance_amount: 75, ...p,
})
const casa = (p: Partial<PedidoRastreable> = {}): PedidoRastreable => ({
  dispatch_type: 'MOTORIZADO_LIMA', advance_amount: 75, ...p,
})

describe('el paso que sigue', () => {
  // El caso de la captura, letra por letra.
  it('después de Registrado sigue En origen, no Entregado', () => {
    const p = agencia({ stage: 'en_camino', tracking_numero: '145446' })
    expect(pasoActual(p)?.key).toBe('registrado')
    expect(siguientePaso(p)?.key).toBe('en_origen')
    expect(siguientePaso(p)?.label).toBe('En origen')
  })

  // "En camino" es de los pedidos a domicilio. En uno por agencia esa palabra
  // no existe: ahí es "En tránsito", y antes va "Registrado".
  it('un pedido por agencia nunca ofrece "En camino"', () => {
    const p = agencia({ stage: 'confirmado' })
    expect(siguientePaso(p)?.key).toBe('registrado')
    const linea = ['nuevo', 'validando', 'confirmado', 'registrado', 'en_origen', 'transito', 'en_agencia', 'entregado']
    let actual = p
    const vistos: string[] = []
    for (let i = 0; i < 10; i++) {
      const sig = siguientePaso(actual)
      if (!sig) break
      vistos.push(sig.key)
      actual = sig.fase
        ? { ...actual, tracking_phase: sig.fase }
        : sig.quien === 'guia'
          ? { ...actual, tracking_numero: '145446' }
          : { ...actual, stage: sig.stage }
    }
    expect(vistos).not.toContain('en_camino')
    expect(vistos).toEqual(linea.slice(linea.indexOf('registrado')))
  })

  it('a domicilio sí, porque ahí es su paso', () => {
    expect(siguientePaso(casa({ stage: 'confirmado' }))?.key).toBe('en_camino')
    expect(siguientePaso(casa({ stage: 'confirmado' }))?.label).toBe('En camino')
  })

  // Ofrecer un botón para algo que no movemos es prometer un hecho que no
  // tenemos: la guía la enciende registrarla, y `En origen` lo reporta Shalom.
  it('dice de quién es cada paso', () => {
    expect(siguientePaso(agencia({ stage: 'validando' }))?.quien).toBe('equipo')
    expect(siguientePaso(agencia({ stage: 'confirmado' }))?.quien).toBe('guia')
    expect(siguientePaso(agencia({ stage: 'en_camino', tracking_numero: '1' }))?.quien).toBe('courier')
    expect(siguientePaso(agencia({ tracking_phase: 'EN_DESTINO', tracking_numero: '1' }))?.quien).toBe('equipo')
  })

  it('el paso del equipo trae qué etapa escribir; el del courier, qué fase', () => {
    expect(siguientePaso(casa({ stage: 'confirmado' }))?.stage).toBe('en_camino')
    expect(siguientePaso(agencia({ stage: 'en_camino', tracking_numero: '1' }))?.fase).toBe('EN_ORIGEN')
  })

  it('un pedido terminado no ofrece nada', () => {
    expect(siguientePaso(agencia({ stage: 'entregado' }))).toBe(null)
    expect(siguientePaso(agencia({ stage: 'no_entregado' }))).toBe(null)
  })

  // El chip del chat y el botón tienen que salir del mismo sitio, que es de
  // donde salen las columnas del tablero. Si se separan, vuelve el bug.
  it('los nombres son los del tablero', () => {
    for (const col of COLUMNAS) {
      expect(PASOS[col.key].label).toBe(col.label)
      expect(PASOS[col.key].emoji).toBe(col.emoji)
    }
  })
})
