// ─── Conexiones · el catálogo, el saneado y las referencias ──────────────────
// El módulo puro que comparten las Edge Functions (que anotan) y el panel (que
// muestra). Lo que se prueba acá es lo que no se puede probar en producción sin
// romper algo: que un secreto NO termine guardado, que el veredicto de salud
// diga lo que hay que decir, y que la referencia que se le enseña al proveedor
// sea legible por teléfono.

import { describe, it, expect } from 'vitest'
import {
  esProveedor, esRef, INTEGRACIONES, integracionDe, nuevaRef, PROVEEDORES,
  refDelProveedor, ROTULO_SALUD, sanear, saludDe,
} from '../../supabase/functions/_shared/integraciones.ts'

describe('el catálogo', () => {
  it('tiene una entrada por proveedor, sin sobras ni faltas', () => {
    expect(INTEGRACIONES.map(i => i.id).sort()).toEqual([...PROVEEDORES].sort())
  })

  it('no repite ids', () => {
    expect(new Set(INTEGRACIONES.map(i => i.id)).size).toBe(INTEGRACIONES.length)
  })

  it('cada una dice para qué sirve y de quién es — es lo que se reclama', () => {
    for (const i of INTEGRACIONES) {
      expect(i.que.length).toBeGreaterThan(10)
      expect(i.dueno.length).toBeGreaterThan(2)
    }
  })

  it('las de plataforma nombran el secret que las enciende; las de marca no', () => {
    for (const i of INTEGRACIONES) {
      if (i.alcance === 'marca') expect(i.secreto).toBe(null)
    }
    expect(integracionDe('SHALOM_LAT')?.secreto).toBe('SHALOM_LAT_API_KEY')
  })

  it('el titular de Shalom apunta a su suplente', () => {
    expect(integracionDe('SHALOM_PE')?.suplente).toBe('SHALOM_LAT')
  })

  it('reconoce un proveedor y rechaza lo que no lo es', () => {
    expect(esProveedor('OLVA')).toBe(true)
    expect(esProveedor('CORREOS_DEL_PERU')).toBe(false)
  })
})

describe('la referencia que se le enseña al proveedor', () => {
  it('sale legible por teléfono: sin I, L, O ni U', () => {
    const secuencia = [0.99, 0.5, 0.1, 0.7, 0.3, 0.85]
    let i = 0
    const ref = nuevaRef(() => secuencia[i++])
    expect(esRef(ref)).toBe(true)
    expect(ref).toMatch(/^KX-/)
    expect(ref.slice(3)).not.toMatch(/[ILOU]/)
  })

  it('mil referencias seguidas siguen teniendo la forma esperada', () => {
    for (let i = 0; i < 1000; i++) expect(esRef(nuevaRef())).toBe(true)
  })

  it('rechaza lo que no es una referencia nuestra', () => {
    expect(esRef('KX-1234')).toBe(false)
    expect(esRef('7QK4M2')).toBe(false)
    expect(esRef('KX-IIIIII')).toBe(false)
  })
})

describe('sanear lo que se guarda', () => {
  it('no deja pasar un Bearer', () => {
    const s = sanear('401 {"error":"invalid"} Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')
    expect(s).not.toContain('eyJhbGci')
    expect(s).toContain('«oculto»')
  })

  it('no deja pasar una contraseña ni una llave en JSON', () => {
    const s = sanear('{"username":"cliente@marca.pe","password":"laClaveDelCliente","api_key":"sk-1234"}')
    expect(s).not.toContain('laClaveDelCliente')
    expect(s).not.toContain('sk-1234')
    // Y lo que NO es secreto se conserva: sin eso el error no sirve de nada.
    expect(s).toContain('cliente@marca.pe')
  })

  it('no deja pasar una llave en la querystring', () => {
    expect(sanear('GET /v1/x?api_key=abc123&numero=6647')).not.toContain('abc123')
    expect(sanear('GET /v1/x?api_key=abc123&numero=6647')).toContain('numero=6647')
  })

  it('corta un chorizo que parece llave aunque nadie lo nombre', () => {
    const suelta = 'a'.repeat(48)
    expect(sanear(`falló con ${suelta} adentro`)).not.toContain(suelta)
  })

  it('recorta lo largo y aplana los saltos de línea', () => {
    expect(sanear('x'.repeat(900)).length).toBeLessThanOrEqual(601)
    expect(sanear('una\n\n  dos')).toBe('una dos')
  })

  it('con null o undefined devuelve texto vacío, no "null"', () => {
    expect(sanear(null)).toBe('')
    expect(sanear(undefined)).toBe('')
  })
})

describe('el id de request del proveedor', () => {
  it('lo encuentra con cualquiera de sus nombres usuales', () => {
    expect(refDelProveedor(h => (h === 'x-request-id' ? 'req_9f3' : null))).toBe('req_9f3')
    expect(refDelProveedor(h => (h === 'cf-ray' ? '8ab12-LIM' : null))).toBe('8ab12-LIM')
  })

  it('sin ninguno, null (y no una cadena vacía que parezca un id)', () => {
    expect(refDelProveedor(() => null)).toBe(null)
    expect(refDelProveedor(() => '  ')).toBe(null)
  })
})

describe('el veredicto de salud', () => {
  it('sin llave es SIN CONFIGURAR, que no es lo mismo que caída', () => {
    expect(saludDe({ configurado: false, ping: null, fallos: 0 })).toBe('SIN_CONFIGURAR')
    // Aunque haya fallos viejos: si ya no está montada, no está caída.
    expect(saludDe({ configurado: false, ping: false, fallos: 9 })).toBe('SIN_CONFIGURAR')
  })

  it('si no responde el chequeo, está caída', () => {
    expect(saludDe({ configurado: true, ping: false, fallos: 0 })).toBe('CAIDA')
  })

  it('responder el chequeo NO la salva si viene fallando', () => {
    // Este es el caso que hoy no se ve en ningún lado: healthz en verde y las
    // llamadas de verdad rebotando.
    expect(saludDe({ configurado: true, ping: true, fallos: 3 })).toBe('INESTABLE')
  })

  it('sin chequeo posible, manda el historial', () => {
    expect(saludDe({ configurado: true, ping: null, fallos: 0 })).toBe('DESCONOCIDA')
    expect(saludDe({ configurado: true, ping: null, fallos: 1 })).toBe('INESTABLE')
  })

  it('todo bien es OPERATIVA', () => {
    expect(saludDe({ configurado: true, ping: true, fallos: 0 })).toBe('OPERATIVA')
  })

  it('cada estado tiene rótulo para la gente', () => {
    for (const s of Object.keys(ROTULO_SALUD)) expect(ROTULO_SALUD[s as keyof typeof ROTULO_SALUD].length).toBeGreaterThan(3)
  })
})
