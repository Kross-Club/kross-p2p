import { describe, expect, it } from 'vitest'
import { APEX, baseDeLaTienda, comoResolver, esHostDePlataforma, normalizarDominio } from './dominio'

const ok = (crudo: string) => {
  const r = normalizarDominio(crudo)
  return r.ok ? r.dominio : `RECHAZADO: ${r.motivo}`
}

describe('normalizarDominio', () => {
  it('acepta lo que la gente pega de verdad y devuelve el host a secas', () => {
    expect(ok('monoshop.pe')).toBe('monoshop.pe')
    expect(ok('  MonoShop.PE  ')).toBe('monoshop.pe')
    expect(ok('https://monoshop.pe/')).toBe('monoshop.pe')
    expect(ok('http://www.monoshop.pe/tienda?x=1')).toBe('www.monoshop.pe')
    expect(ok('monoshop.pe.')).toBe('monoshop.pe')
    expect(ok('monoshop.pe:443')).toBe('monoshop.pe')
    expect(ok('tienda.monoshop.com.pe')).toBe('tienda.monoshop.com.pe')
  })

  it('rechaza lo que no es un dominio', () => {
    expect(ok('')).toContain('RECHAZADO')
    expect(ok('   ')).toContain('RECHAZADO')
    expect(ok('monoshop')).toContain('Falta la terminación')
    expect(ok('mono shop.pe')).toContain('Solo letras')
    expect(ok('-monoshop.pe')).toContain('Solo letras')
    expect(ok('monoshop-.pe')).toContain('Solo letras')
    expect(ok('monoshop.1')).toContain('terminación no parece válida')
    expect(ok('190.12.4.7')).toContain('dirección IP')
  })

  it('rechaza el espacio de la plataforma: el subdominio no se pide por acá', () => {
    expect(ok(APEX)).toContain('dominio de Kross')
    expect(ok(`monoshop.${APEX}`)).toContain('dominio de Kross')
    expect(ok(`https://MONOSHOP.${APEX}/acceso`)).toContain('dominio de Kross')
  })

  it('rechaza los hosts del hosting y el desarrollo', () => {
    expect(ok('kross-p2p.vercel.app')).toContain('del hosting')
    expect(ok('localhost')).toContain('del hosting')
    expect(ok('mono.localhost')).toContain('del hosting')
  })

  it('pide la forma punycode en vez de adivinarla', () => {
    expect(ok('monoshopeña.pe')).toContain('xn--')
    expect(ok('xn--monoshopea-r6a.pe')).toBe('xn--monoshopea-r6a.pe')
  })

  it('no se traga un correo pegado por error', () => {
    expect(ok('hola@monoshop.pe')).toBe('monoshop.pe')
  })
})

describe('esHostDePlataforma', () => {
  it('lo nuestro es nuestro', () => {
    for (const h of [APEX, `www.${APEX}`, `monoshop.${APEX}`, 'localhost', 'mono.localhost', '127.0.0.1', 'kross-p2p.vercel.app', '']) {
      expect(esHostDePlataforma(h), h).toBe(true)
    }
  })

  it('un dominio de marca no lo es', () => {
    for (const h of ['monoshop.pe', 'www.monoshop.pe', 'tienda.monoshop.com.pe']) {
      expect(esHostDePlataforma(h), h).toBe(false)
    }
  })
})

describe('comoResolver', () => {
  it('el apex y los hosts de la plataforma son la web de Kross', () => {
    for (const h of [APEX, `www.${APEX}`, `app.${APEX}`, 'localhost', 'kross-p2p.vercel.app', '10.0.0.4']) {
      expect(comoResolver(h), h).toBeNull()
    }
  })

  it('un subdominio de la plataforma se busca por slug', () => {
    expect(comoResolver(`monoshop.${APEX}`)).toEqual({ por: 'slug', valor: 'monoshop' })
    expect(comoResolver(`MONOSHOP.${APEX}:443`)).toEqual({ por: 'slug', valor: 'monoshop' })
    expect(comoResolver('mono.localhost')).toEqual({ por: 'slug', valor: 'mono' })
  })

  it('un subdominio de dos niveles no es de nadie', () => {
    expect(comoResolver(`a.b.${APEX}`)).toBeNull()
  })

  it('cualquier otro host se busca como dominio propio', () => {
    expect(comoResolver('monoshop.pe')).toEqual({ por: 'dominio', valor: 'monoshop.pe' })
    expect(comoResolver('www.monoshop.pe.')).toEqual({ por: 'dominio', valor: 'www.monoshop.pe' })
  })

  it('el `?store=` de desarrollo manda sobre el host', () => {
    expect(comoResolver(APEX, 'monoshop')).toEqual({ por: 'slug', valor: 'monoshop' })
    expect(comoResolver('monoshop.pe', ' otra ')).toEqual({ por: 'slug', valor: 'otra' })
    expect(comoResolver('monoshop.pe', '')).toEqual({ por: 'dominio', valor: 'monoshop.pe' })
  })
})

describe('baseDeLaTienda', () => {
  it('sin dominio propio, el subdominio de siempre', () => {
    expect(baseDeLaTienda({ slug: 'monoshop' })).toBe(`https://monoshop.${APEX}`)
  })

  it('con dominio propio VERIFICADO, el suyo', () => {
    expect(baseDeLaTienda({ slug: 'monoshop', custom_domain: 'monoshop.pe', custom_domain_verified: true }))
      .toBe('https://monoshop.pe')
  })

  it('escrito pero SIN verificar, el subdominio: un enlace se abre horas después', () => {
    // Es la regla que evita mandar por WhatsApp un enlace a un DNS que todavía
    // no resuelve. Se cae al subdominio, que sí funciona.
    expect(baseDeLaTienda({ slug: 'monoshop', custom_domain: 'monoshop.pe', custom_domain_verified: false }))
      .toBe(`https://monoshop.${APEX}`)
    expect(baseDeLaTienda({ slug: 'monoshop', custom_domain: 'monoshop.pe' }))
      .toBe(`https://monoshop.${APEX}`)
  })

  it('sin nada, la plataforma', () => {
    expect(baseDeLaTienda(null)).toBe(`https://${APEX}`)
    expect(baseDeLaTienda({})).toBe(`https://${APEX}`)
  })
})
