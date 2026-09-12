import { describe, it, expect } from 'vitest'
import {
  TOLERANCIA_SEG, leerCabeceraDeFirma, firmaValida,
  fechaDeStripe, idDe, storeIdDe, suscripcionDelEvento, tramoDeFactura,
  valeReintentar, VENTANA_DE_REINTENTO_SEG,
} from '../../supabase/functions/_shared/stripe.ts'

const SECRETO = 'whsec_pruebaquenoesreal'

/** La misma firma que manda Stripe: HMAC-SHA256 de `t.cuerpo`. */
async function firmar(cuerpo: string, t: number, secreto = SECRETO): Promise<string> {
  const llave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const buf = await crypto.subtle.sign('HMAC', llave, new TextEncoder().encode(`${t}.${cuerpo}`))
  const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
  return `t=${t},v1=${hex}`
}

describe('la firma del webhook', () => {
  const cuerpo = '{"id":"evt_1","type":"invoice.paid"}'
  const ahora = 1_760_000_000

  it('acepta lo que firmó Stripe', async () => {
    const h = await firmar(cuerpo, ahora)
    expect(await firmaValida(cuerpo, h, SECRETO, ahora)).toBe(true)
  })

  it('rechaza el cuerpo cambiado aunque la cabecera sea buena', async () => {
    const h = await firmar(cuerpo, ahora)
    expect(await firmaValida('{"id":"evt_1","type":"invoice.voided"}', h, SECRETO, ahora)).toBe(false)
  })

  it('rechaza otro secreto', async () => {
    const h = await firmar(cuerpo, ahora, 'whsec_otro')
    expect(await firmaValida(cuerpo, h, SECRETO, ahora)).toBe(false)
  })

  it('cierra la ventana de replay a los cinco minutos', async () => {
    // Sin esto, una petición firmada capturada hoy vale para siempre: quien la
    // reenvíe vuelve a marcar el mes como pagado.
    const h = await firmar(cuerpo, ahora)
    expect(await firmaValida(cuerpo, h, SECRETO, ahora + TOLERANCIA_SEG - 1)).toBe(true)
    expect(await firmaValida(cuerpo, h, SECRETO, ahora + TOLERANCIA_SEG + 1)).toBe(false)
    // Y es simétrica: un reloj adelantado de nuestro lado también rechaza.
    expect(await firmaValida(cuerpo, h, SECRETO, ahora - TOLERANCIA_SEG - 1)).toBe(false)
  })

  it('sin secreto no valida nada, en vez de dejar pasar todo', async () => {
    const h = await firmar(cuerpo, ahora)
    expect(await firmaValida(cuerpo, h, '', ahora)).toBe(false)
  })

  it('tolera varias v1 (rotación de secreto)', () => {
    const c = leerCabeceraDeFirma('t=1,v1=aa,v1=bb,v0=cc')
    expect(c).toEqual({ t: 1, v1: ['aa', 'bb'] })
  })

  it('una cabecera rota es «no válida», no una excepción', async () => {
    expect(leerCabeceraDeFirma(null)).toBe(null)
    expect(leerCabeceraDeFirma('basura')).toBe(null)
    expect(leerCabeceraDeFirma('t=1')).toBe(null)          // sin v1
    expect(await firmaValida('x', 'basura', SECRETO, 1)).toBe(false)
  })
})

describe('leer los campos que importan', () => {
  it('las fechas de Stripe son SEGUNDOS, no milisegundos', () => {
    // Sin multiplicar por mil, todo cae en 1970 y una suscripción figura
    // vencida desde hace 56 años sin que nadie lo note.
    expect(fechaDeStripe(1_760_000_000)).toBe('2025-10-09T08:53:20.000Z')
    expect(fechaDeStripe(0)).toBe(null)
    expect(fechaDeStripe('ayer')).toBe(null)
    expect(fechaDeStripe(undefined)).toBe(null)
  })

  it('lee un id venga expandido o plano', () => {
    expect(idDe('cus_1')).toBe('cus_1')
    expect(idDe({ id: 'cus_1', object: 'customer' })).toBe('cus_1')
    expect(idDe(null)).toBe(null)
  })

  it('encuentra la tienda por los tres caminos', () => {
    expect(storeIdDe({ metadata: { store_id: 'marca' } })).toBe('marca')
    expect(storeIdDe({ client_reference_id: 'marca' })).toBe('marca')
    // Donde Stripe copia el metadata de la suscripción en las FACTURAS.
    expect(storeIdDe({ subscription_details: { metadata: { store_id: 'marca' } } })).toBe('marca')
    // Y donde lo mudó `2025-04-30.basil`: dentro de `parent`. Una cuenta creada
    // hoy manda ESTA forma, así que leer solo la vieja dejaría sin resolver
    // todas las facturas — en silencio, que es lo peor.
    expect(storeIdDe({ parent: { subscription_details: { metadata: { store_id: 'marca' } } } })).toBe('marca')
    // Sin ninguno: no es un error, es «resuélvelo por el customer».
    expect(storeIdDe({ id: 'in_1' })).toBe(null)
  })
})

describe('el estado de la suscripción', () => {
  it('lee lo que hace falta y pasa los centavos a dólares', () => {
    expect(suscripcionDelEvento({
      id: 'sub_1', customer: 'cus_1', status: 'active',
      current_period_end: 1_760_000_000, cancel_at_period_end: false,
      items: { data: [{ price: { unit_amount: 6700 } }] },
    })).toEqual({
      stripe_subscription_id: 'sub_1',
      stripe_customer_id: 'cus_1',
      status: 'active',
      current_period_end: '2025-10-09T08:53:20.000Z',
      cancel_at_period_end: false,
      price_usd: 67,
    })
  })

  it('encuentra el periodo cuando vive en el item y no en la suscripción', () => {
    // Las APIs nuevas de Stripe lo mudaron ahí. Leer solo uno de los dos deja
    // la columna vacía sin que nada falle.
    const s = suscripcionDelEvento({
      id: 'sub_1', customer: 'cus_1', status: 'active',
      items: { data: [{ current_period_end: 1_760_000_000, price: { unit_amount: 6700 } }] },
    })
    expect(s.current_period_end).toBe('2025-10-09T08:53:20.000Z')
  })

  it('un objeto incompleto degrada a nulos, no revienta', () => {
    expect(suscripcionDelEvento({})).toEqual({
      stripe_subscription_id: null, stripe_customer_id: null, status: null,
      current_period_end: null, cancel_at_period_end: false, price_usd: null,
    })
    expect(suscripcionDelEvento(null).status).toBe(null)
  })
})

describe('el tramo que cubre una factura', () => {
  const factura = (extra: Record<string, unknown> = {}) => ({
    id: 'in_1', customer: 'cus_1', subscription: 'sub_1', amount_paid: 6700,
    created: 1_760_000_000,
    status_transitions: { paid_at: 1_760_000_100 },
    lines: { data: [{ period: { start: 1_760_000_000, end: 1_762_678_400 } }] },
    ...extra,
  })

  it('saca el rango de las líneas', () => {
    expect(tramoDeFactura(factura())).toEqual({
      stripe_invoice_id: 'in_1',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      inicio: '2025-10-09T08:53:20.000Z',
      fin: '2025-11-09T08:53:20.000Z',
      monto_usd: 67,
      paid_at: '2025-10-09T08:55:00.000Z',
    })
  })

  it('con varias líneas toma el rango envolvente', () => {
    // Un cambio de plan a mitad de mes factura dos líneas: el prorrateo de la
    // que se va y la nueva. El mes cubierto es el de los dos extremos.
    const t = tramoDeFactura(factura({
      lines: { data: [
        { period: { start: 1_760_000_000, end: 1_761_000_000 } },
        { period: { start: 1_761_000_000, end: 1_762_678_400 } },
      ] },
    }))
    expect(t?.inicio).toBe('2025-10-09T08:53:20.000Z')
    expect(t?.fin).toBe('2025-11-09T08:53:20.000Z')
  })

  it('una factura que NO cobró nada no da tramo', () => {
    // Un cupón del 100 % o un ajuste saldado con crédito. El comercio no pagó,
    // así que ese mes no puede comisionar.
    expect(tramoDeFactura(factura({ amount_paid: 0 }))).toBe(null)
  })

  it('una factura sin periodo utilizable no da tramo', () => {
    expect(tramoDeFactura(factura({ lines: { data: [] } }))).toBe(null)
    // Rango invertido o vacío: se ignora esa línea, y sin ninguna válida no hay tramo.
    expect(tramoDeFactura(factura({ lines: { data: [{ period: { start: 100, end: 100 } }] } }))).toBe(null)
  })

  it('sin id no hay nada que deduplicar, así que no hay tramo', () => {
    expect(tramoDeFactura(factura({ id: undefined }))).toBe(null)
    expect(tramoDeFactura(null)).toBe(null)
  })
})

describe('la factura que llega antes de saber de quién es', () => {
  const ahora = 1_760_000_000
  const hace = (seg: number) => new Date((ahora - seg) * 1000).toISOString()

  it('se reintenta mientras el evento sea reciente', () => {
    // Stripe no garantiza el orden: `invoice.paid` suele llegar ANTES que
    // `checkout.session.completed`, que es el que enlaza la tienda. Descartarla
    // sería perder el PRIMER MES de todas las tiendas, en silencio.
    expect(valeReintentar(hace(5), ahora)).toBe(true)
    expect(valeReintentar(hace(VENTANA_DE_REINTENTO_SEG - 10), ahora)).toBe(true)
  })

  it('se deja ir pasada la ventana: eso ya no es una carrera, es de otro', () => {
    // Una suscripción de la misma cuenta de Stripe que no sea de Kross tampoco
    // se va a poder resolver nunca, y reintentarla tres días llena el registro
    // de fallos que no son fallos.
    expect(valeReintentar(hace(VENTANA_DE_REINTENTO_SEG + 10), ahora)).toBe(false)
  })

  it('sin fecha legible NO se insiste', () => {
    // Sin saber cuándo pasó, insistir es apostar a que Stripe deje de
    // reintentar antes que nosotros de fallar.
    expect(valeReintentar(null, ahora)).toBe(false)
    expect(valeReintentar('ayer', ahora)).toBe(false)
  })

  it('la ventana es de una hora', () => {
    expect(VENTANA_DE_REINTENTO_SEG).toBe(3600)
  })
})
