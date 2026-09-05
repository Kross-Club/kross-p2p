// ─── Rastreo de Shalom con DOS proveedores — el router ───────────────────────
// Shalom no tiene API oficial: las dos que usamos son de terceros que leen el
// mismo Shalom. Desde set-2026 hay titular y contingencia, y este archivo es lo
// único que sabe cuál está respondiendo:
//
//   · **Shalom PE**  (`api.shalom-api-peru.com`) — titular. Hitos explícitos,
//     batch con `custom_id`, webhook, y rastreo por `ose_id` suelto.
//   · **Shalom LAT** (`api.shalom-api.lat`) — contingencia. Rastrea por
//     `orderNumber` + `orderCode`; sin `ose_id` y sin `custom_id`.
//
// La regla es una sola: **se intenta el titular y, si no responde, la
// contingencia**. Nunca al revés y nunca los dos por gusto — cada request
// consume cupo de una key que se paga. Y lo que sale de acá es idéntico venga
// de donde venga (fase, demora, ose_id): el reflejo de `tracking.ts` no se
// entera de quién contestó, que es justo lo que hace que un proveedor caído no
// cambie ni una palabra de lo que ve el comprador.
//
// Lo que la contingencia NO cubre, y hay que tener presente:
//   · una guía registrada SOLO con `ose_id` (LAT no lo conoce) — se queda
//     esperando al titular;
//   · el `custom_id` del lote: LAT se correlaciona por número de guía, así que
//     dos pedidos con la MISMA guía reciben los dos la misma lectura (que es
//     exactamente lo que hace el webhook, así que no es un caso nuevo).

import { derivePhase as phasePE, limaDate, shalomApiKey, shalomLatApiKey } from './shalom.ts'
import { isObj, type Phase } from './tracking.ts'
import { anotar, anotarRespuesta, anotarSinRespuesta } from './api-eventos.ts'
import {
  derivePhase as phaseLAT, demoraOf, esNoEncontrado, esRastreablePorLat,
  milestonesOf, numeroDeResultado, SHALOM_LAT_BASE, trackBody,
} from './shalom-lat.ts'

const SHALOM_PE_BASE = 'https://api.shalom-api-peru.com'
const BATCH_SIZE = 50

export type Proveedor = 'PE' | 'LAT'

/** Lo mínimo que el router necesita de un pedido para poder rastrearlo. */
export interface Rastreable {
  id: string
  tracking_numero: string | null
  tracking_codigo: string | null
  tracking_ose_id: string | null
}

/** Una lectura ya normalizada, lista para `applyTracking`. */
export interface Lectura {
  id: string
  proveedor: Proveedor
  /** El proveedor contestó por este envío (aunque sea para decir que no existe). */
  ok: boolean
  /** La guía no existe para el proveedor: guía mal digitada, casi siempre. */
  notFound: boolean
  phase: Phase | null
  demoraIso: string | null
  oseId: string | null
}

export interface LoteResult {
  lecturas: Lectura[]
  /** Qué proveedores llegaron a contestar algo en esta corrida. */
  proveedores: Proveedor[]
  /** Por qué se cortó, si se cortó (para el log de la corrida). */
  corte: 'rate_limit' | 'upstream' | 'sin_llave' | null
}

const trozos = <T,>(xs: T[], n: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/**
 * Rastrea un lote de envíos. Empieza por Shalom PE y, si se cae a mitad de la
 * corrida, sigue con Shalom LAT lo que quedó pendiente — no reintenta lo ya
 * leído: una lectura buena es una lectura buena, no importa quién la dio.
 */
export async function rastrearLote(rows: Rastreable[], now = new Date().toISOString()): Promise<LoteResult> {
  const lecturas: Lectura[] = []
  const proveedores: Proveedor[] = []
  let corte: LoteResult['corte'] = null

  const [keyPE, keyLAT] = await Promise.all([shalomApiKey(), shalomLatApiKey()])
  // Consultables por el titular: numero+codigo juntos, o ose_id (regla de la
  // API real de Shalom PE, verificada contra su 400 vivo).
  const pendientes = rows.filter(r => (r.tracking_numero && r.tracking_codigo) || r.tracking_ose_id)

  if (keyPE) {
    for (const chunk of trozos(pendientes, BATCH_SIZE)) {
      const items = chunk.map(r => r.tracking_ose_id
        ? { custom_id: r.id, ose_id: r.tracking_ose_id }
        : { custom_id: r.id, numero: r.tracking_numero, codigo: r.tracking_codigo })

      const ctx = { proveedor: 'SHALOM_PE' as const, op: 'tracking.lote' }
      let payload: { results?: unknown[] } | null = null
      let fallo: LoteResult['corte'] = null
      const inicio = Date.now()
      try {
        const r = await fetch(`${SHALOM_PE_BASE}/v1/tracking/batch`, {
          method: 'POST',
          headers: { 'X-API-Key': keyPE, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ items }),
        })
        if (!r.ok) {
          await anotarRespuesta(ctx, r, Date.now() - inicio)
          fallo = r.status === 429 ? 'rate_limit' : 'upstream'
        } else payload = await r.json().catch(() => null)
      } catch (e) {
        await anotarSinRespuesta(ctx, e, Date.now() - inicio)
        fallo = 'upstream'
      }
      if (!fallo && (!payload || !Array.isArray(payload.results))) {
        await anotar({ ...ctx, outcome: 'FALLO', detail: 'respuesta sin lista de resultados' })
        fallo = 'upstream'
      }
      // El titular se cayó a mitad: lo que falta se lo lleva la contingencia.
      if (fallo) { corte = fallo; break }

      // Un latido por corrida, no por lote: la línea de tiempo del panel
      // necesita saber que el titular contestó, no cuántas veces.
      if (!proveedores.includes('PE')) {
        proveedores.push('PE')
        await anotar({ ...ctx, outcome: 'OK', duracionMs: Date.now() - inicio })
      }
      const byId = new Map(chunk.map(r => [r.id, r]))
      for (const raw of payload!.results as unknown[]) {
        if (!isObj(raw)) continue
        const row = byId.get(String(raw.custom_id ?? ''))
        if (!row) continue
        // Un `custom_id` repetido en la respuesta no cuenta dos veces.
        byId.delete(row.id)
        if (raw.ok !== true) {
          const code = isObj(raw.error) ? String(raw.error.code ?? '') : ''
          console.error('shalom rastreo: PE ítem falló', row.id, code)
          lecturas.push({ id: row.id, proveedor: 'PE', ok: false, notFound: code === 'not_found', phase: null, demoraIso: null, oseId: null })
          continue
        }
        const tracking = isObj(raw.tracking) ? raw.tracking : {}
        const status = isObj(tracking.status) ? tracking.status : {}
        const order = isObj(tracking.order) ? tracking.order : null
        lecturas.push({
          id: row.id,
          proveedor: 'PE',
          ok: true,
          notFound: false,
          phase: phasePE(status),
          demoraIso: isObj(status.demora) ? limaDate(status.demora.fecha) ?? now : null,
          // ose_id de vuelta (modo detallado) → abarata el próximo chequeo.
          oseId: order && order.ose_id != null ? String(order.ose_id) : null,
        })
      }
    }
  } else {
    corte = 'sin_llave'
    console.error('shalom rastreo: sin SHALOM_API_KEY (ni secret ni Vault)')
  }

  // Lo que el titular alcanzó a contestar ya no se vuelve a preguntar.
  const leidos = new Set(lecturas.map(l => l.id))
  const paraLat = pendientes.filter(r => !leidos.has(r.id) && esRastreablePorLat(
    { numero: r.tracking_numero, codigo: r.tracking_codigo }))

  if (paraLat.length && keyLAT) {
    console.log('shalom rastreo: contingencia LAT para', paraLat.length, 'envíos —', corte ?? 'titular sin cubrir')
    for (const chunk of trozos(paraLat, BATCH_SIZE)) {
      // LAT no tiene `custom_id`: la correlación es por número de guía. Se
      // arma el índice ANTES de llamar para no depender del orden del array.
      const porNumero = new Map<string, Rastreable[]>()
      for (const r of chunk) {
        const n = String(r.tracking_numero ?? '').replace(/\D/g, '')
        porNumero.set(n, [...(porNumero.get(n) ?? []), r])
      }
      // Sin valor inicial a propósito: los únicos caminos que llegan al `if`
      // de abajo son los que lo asignan (el `catch` corta la corrida).
      let resultados: unknown[] | null
      const ctxLat = { proveedor: 'SHALOM_LAT' as const, op: 'tracking.lote' }
      const inicioLat = Date.now()
      try {
        const r = await fetch(`${SHALOM_LAT_BASE}/track/batch`, {
          method: 'POST',
          headers: { 'x-api-key': keyLAT, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            orders: chunk.map(x => trackBody({ numero: x.tracking_numero, codigo: x.tracking_codigo })),
          }),
        })
        if (!r.ok) {
          await anotarRespuesta(ctxLat, r, Date.now() - inicioLat)
          corte = r.status === 429 ? 'rate_limit' : 'upstream'
          break
        }
        const body = await r.json().catch(() => null)
        // Su doc no publica la respuesta: se acepta el array pelado o el que
        // venga dentro de `results`/`orders`/`data`.
        resultados = Array.isArray(body) ? body
          : isObj(body) ? (['results', 'orders', 'data', 'tracking'] as const)
            .map(k => body[k]).find(Array.isArray) as unknown[] | undefined ?? null
          : null
      } catch (e) {
        await anotarSinRespuesta(ctxLat, e, Date.now() - inicioLat)
        corte = 'upstream'
        break
      }
      if (!resultados) {
        await anotar({ ...ctxLat, outcome: 'FALLO', detail: 'respuesta sin lista de resultados' })
        corte = 'upstream'
        break
      }

      if (!proveedores.includes('LAT')) {
        proveedores.push('LAT')
        await anotar({ ...ctxLat, outcome: 'OK', duracionMs: Date.now() - inicioLat })
      }
      for (const raw of resultados) {
        const numero = numeroDeResultado(raw)
        const filas = numero ? porNumero.get(numero) : undefined
        if (!filas?.length) continue
        const notFound = esNoEncontrado(raw)
        const demora = demoraOf(raw)
        for (const row of filas) {
          lecturas.push({
            id: row.id,
            proveedor: 'LAT',
            ok: !notFound,
            notFound,
            phase: notFound ? null : phaseLAT(raw),
            demoraIso: demora === null ? null : limaDate(demora) ?? now,
            // LAT no maneja el id interno de Shalom: no hay nada que rellenar.
            oseId: null,
          })
        }
      }
    }
  }

  return { lecturas, proveedores, corte }
}

/** Cómo le fue a una consulta puntual (el proxy del chat). */
export type LecturaUna =
  | {
      ok: true
      proveedor: Proveedor
      phase: Phase | null
      /** Hitos crudos, cuando el proveedor los da (Shalom PE siempre; LAT si
       *  los trae). El front sigue pudiendo derivar la fase por su cuenta. */
      status: Record<string, unknown>
      order: Record<string, unknown> | null
    }
  | { ok: false; stage: 'config' | 'not_found' | 'rate_limit' | 'upstream' }

/**
 * Rastrea UN envío. Mismo orden que el lote: titular primero, contingencia si
 * no responde. `not_found` del titular NO cae a la contingencia — una guía que
 * no existe tampoco existe en el otro, y preguntarlo dos veces solo gasta cupo.
 */
export async function rastrearUno(
  t: { numero: string; codigo: string; oseId: string },
): Promise<LecturaUna> {
  const [keyPE, keyLAT] = await Promise.all([shalomApiKey(), shalomLatApiKey()])
  const puedeLat = esRastreablePorLat({ numero: t.numero, codigo: t.codigo })

  const ctxPE = { proveedor: 'SHALOM_PE' as const, op: 'tracking.consulta' }
  if (keyPE) {
    const params = new URLSearchParams()
    if (t.numero) params.set('numero', t.numero)
    if (t.oseId) params.set('ose_id', t.oseId)
    if (t.codigo) params.set('codigo', t.codigo)
    const inicio = Date.now()
    try {
      const r = await fetch(`${SHALOM_PE_BASE}/v1/tracking?${params}`, {
        headers: { 'X-API-Key': keyPE, Accept: 'application/json' },
      })
      if (r.ok) {
        const data = await r.json().catch(() => null) as
          { status?: unknown; order?: unknown } | null
        if (data && isObj(data.status)) {
          return {
            ok: true,
            proveedor: 'PE',
            phase: phasePE(data.status),
            status: data.status,
            order: isObj(data.order) ? data.order : null,
          }
        }
        await anotar({ ...ctxPE, outcome: 'FALLO', detail: 'respuesta sin status', httpStatus: r.status })
      } else {
        // El detalle crudo del proveedor NO va al chat (regla del repo: ningún
        // texto de terceros frente a compradores/vendedores). Va al registro,
        // que es de la plataforma y existe justamente para reclamárselo.
        // Guía inexistente SÍ es 404 acá, y eso es una respuesta, no una caída:
        // se anota igual, pero como rechazo.
        await anotarRespuesta(ctxPE, r, Date.now() - inicio)
        if (r.status === 404) return { ok: false, stage: 'not_found' }
      }
    } catch (e) {
      await anotarSinRespuesta(ctxPE, e, Date.now() - inicio)
    }
  } else {
    console.error('shalom rastreo: sin SHALOM_API_KEY (ni secret ni Vault)')
  }

  if (!puedeLat || !keyLAT) return { ok: false, stage: keyPE || keyLAT ? 'upstream' : 'config' }

  const ctxLat = { proveedor: 'SHALOM_LAT' as const, op: 'tracking.consulta' }
  const inicioLat = Date.now()
  try {
    const r = await fetch(`${SHALOM_LAT_BASE}/track`, {
      method: 'POST',
      headers: { 'x-api-key': keyLAT, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(trackBody({ numero: t.numero, codigo: t.codigo })),
    })
    if (!r.ok) {
      await anotarRespuesta(ctxLat, r, Date.now() - inicioLat)
      if (r.status === 404) return { ok: false, stage: 'not_found' }
      return { ok: false, stage: r.status === 429 ? 'rate_limit' : 'upstream' }
    }
    const body = await r.json().catch(() => null)
    if (esNoEncontrado(body)) return { ok: false, stage: 'not_found' }
    return {
      ok: true,
      proveedor: 'LAT',
      phase: phaseLAT(body),
      // Los hitos que LAT dé, con la misma forma que espera el chat; si no da
      // ninguno, `phase` (que ya viene resuelta) es lo que se muestra.
      status: milestonesOf(body),
      order: null,
    }
  } catch (e) {
    await anotarSinRespuesta(ctxLat, e, Date.now() - inicioLat)
    return { ok: false, stage: 'upstream' }
  }
}
