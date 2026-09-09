import { describe, it, expect } from 'vitest'
import { imagenDelPack } from '../../supabase/functions/_shared/packs.ts'

// ─── La miniatura del ticket ─────────────────────────────────────────────────
//
// Lo que se prueba acá es una promesa hacia el comprador: la foto que ve en su
// ticket es la del pack que compró. La regla tiene que ser la MISMA del paso 1
// del checkout (`buildPackSelection`), porque las dos pantallas enseñan lo
// mismo con un pago de por medio: elegir una foto distinta después de cobrar es
// lo único que no puede pasar.

const PACKS = [
  { nombre: '1 unidad', precio: 110, image: 'https://cdn/uno.png' },
  { nombre: '2 unidades', precio: 189, image: 'https://cdn/dos.png' },
  { nombre: '3 unidades', precio: 259 },
]
const IMAGENES = ['https://cdn/producto-1.png', 'https://cdn/producto-2.png']

describe('imagenDelPack', () => {
  it('devuelve la foto propia del pack elegido', () => {
    expect(imagenDelPack(PACKS, '2 unidades', IMAGENES)).toBe('https://cdn/dos.png')
  })

  // El pack elegido manda: su foto, o ninguna. La del producto es la del frasco
  // suelto, así que al que compró tres le enseñaría uno — el mismo error que
  // esto vino a arreglar. Sin foto, quien pinta pone el logo de la marca.
  it('devuelve null cuando ese pack existe y no tiene foto', () => {
    expect(imagenDelPack(PACKS, '3 unidades', IMAGENES)).toBeNull()
  })

  it('sin pack elegido, la primera del producto', () => {
    expect(imagenDelPack(PACKS, null, IMAGENES)).toBe('https://cdn/producto-1.png')
  })

  // Sin foto no hay miniatura, y está bien: el ticket sabe callarse. Poner
  // cualquier otra imagen sería enseñarle al comprador algo que no compró.
  it('sin ninguna foto devuelve null', () => {
    expect(imagenDelPack([{ nombre: 'x', precio: 10 }], 'x', [])).toBeNull()
    expect(imagenDelPack(null, 'x', null)).toBeNull()
  })

  // Un pack renombrado después de la venta no deja al ticket sin nada que
  // enseñar: ahí la del producto es la que corresponde, porque ya no hay
  // cantidad que pueda contradecir.
  it('con un pack que ya no existe, la primera del producto', () => {
    expect(imagenDelPack(PACKS, 'Pack Mono Loco', IMAGENES)).toBe('https://cdn/producto-1.png')
  })

  it('descarta cadenas vacías, que la base sí guarda', () => {
    expect(imagenDelPack([{ nombre: 'x', precio: 10, image: '   ' }], 'x', ['https://cdn/p.png'])).toBeNull()
    expect(imagenDelPack([], null, ['  '])).toBeNull()
  })
})
