import { describe, expect, it } from 'vitest'
import { enlaceDeArchivoDeTienda, enlaceDeTienda, rutaDeArchivo } from './archivos'

const GUIA = 'https://ofdjghntvmrdfjhazfvz.supabase.co/storage/v1/object/public/shalom-guias/e706c574-c600/95287853.pdf'

describe('rutaDeArchivo', () => {
  it('una URL de nuestro storage pasa a ser una ruta de nuestro dominio', () => {
    expect(rutaDeArchivo(GUIA)).toBe('/archivos/shalom-guias/e706c574-c600/95287853.pdf')
  })

  it('sirve para cualquier bucket, no solo el de guías', () => {
    expect(rutaDeArchivo('https://x.supabase.co/storage/v1/object/public/branding/logo.png'))
      .toBe('/archivos/branding/logo.png')
    expect(rutaDeArchivo('https://x.supabase.co/storage/v1/object/public/products/1/a.webp'))
      .toBe('/archivos/products/1/a.webp')
  })

  it('conserva la query, que a veces lleva la versión del archivo', () => {
    expect(rutaDeArchivo('https://x.supabase.co/storage/v1/object/public/branding/l.png?v=2'))
      .toBe('/archivos/branding/l.png?v=2')
  })

  it('el PDF de un TERCERO se devuelve intacto: reescribirlo lo rompería', () => {
    // Olva sirve su rótulo desde su propio dominio. Esa URL no es nuestra y no
    // hay ninguna reescritura que la atienda.
    const olva = 'https://clientes.olvacourier.com/rotulos/17491234.pdf'
    expect(rutaDeArchivo(olva)).toBe(olva)
  })

  it('una URL de supabase que no es del storage público tampoco se toca', () => {
    const fn = 'https://x.supabase.co/functions/v1/get-session'
    expect(rutaDeArchivo(fn)).toBe(fn)
  })

  it('lo que ya es relativo o está vacío no estorba', () => {
    expect(rutaDeArchivo('/archivos/shalom-guias/a.pdf')).toBe('/archivos/shalom-guias/a.pdf')
    expect(rutaDeArchivo('/guia/tok')).toBe('/guia/tok')
    expect(rutaDeArchivo(null)).toBeNull()
    expect(rutaDeArchivo('')).toBeNull()
    expect(rutaDeArchivo('   ')).toBeNull()
  })
})

describe('enlaceDeArchivoDeTienda · absoluto, por el dominio de la tienda', () => {
  const RUTA = '/archivos/shalom-guias/e706c574-c600/95287853.pdf'
  it('con dominio propio verificado, por ahí', () => {
    expect(enlaceDeArchivoDeTienda({ slug: 'monoshop', custom_domain: 'monoshop.fit', custom_domain_verified: true }, GUIA))
      .toBe(`https://monoshop.fit${RUTA}`)
  })
  it('sin dominio propio (o sin verificar), por el subdominio', () => {
    expect(enlaceDeArchivoDeTienda({ slug: 'monoshop' }, GUIA)).toBe(`https://monoshop.krossclub.app${RUTA}`)
    expect(enlaceDeArchivoDeTienda({ slug: 'monoshop', custom_domain: 'monoshop.fit', custom_domain_verified: false }, GUIA))
      .toBe(`https://monoshop.krossclub.app${RUTA}`)
  })
  it('sin tienda resuelta, la ruta relativa: nunca la raíz krossclub.app', () => {
    expect(enlaceDeArchivoDeTienda(null, GUIA)).toBe(RUTA)
    expect(enlaceDeArchivoDeTienda({ slug: null }, GUIA)).toBe(RUTA)
  })
  it('el archivo de un tercero se devuelve intacto, y sin URL no hay enlace', () => {
    const olva = 'https://clientes.olvacourier.com/rotulos/17491234.pdf'
    expect(enlaceDeArchivoDeTienda({ slug: 'monoshop' }, olva)).toBe(olva)
    expect(enlaceDeArchivoDeTienda({ slug: 'monoshop' }, null)).toBeNull()
  })
  it('enlaceDeTienda hace lo mismo con una ruta de la app', () => {
    expect(enlaceDeTienda({ slug: 'monoshop', custom_domain: 'monoshop.fit', custom_domain_verified: true }, '/guia/tok'))
      .toBe('https://monoshop.fit/guia/tok')
    expect(enlaceDeTienda(null, '/guia/tok')).toBe('/guia/tok')
  })
})
