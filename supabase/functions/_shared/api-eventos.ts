// ─── Anotar lo que hacen (y lo que rompen) las APIs de terceros ──────────────
// La mitad que escribe. El catálogo, el saneado y la referencia corta viven en
// `_shared/integraciones.ts` (puro, compartido con el panel); acá solo está lo
// que necesita Deno: meter el renglón en `api_events` (§42 del esquema).
//
// Tres reglas, y las tres son de las que no se negocian:
//
//   1. **Nunca tumba la llamada que estaba anotando.** Todo va en try/catch y
//      nada se propaga: si el registro falla, el pedido sigue. Un log que
//      rompe producción es peor que no tener log.
//   2. **Nunca guarda un secreto.** El detalle del proveedor pasa por
//      `sanear()` — un error de auth suele devolver de vuelta lo que le
//      mandaste, y lo que le mandaste incluye su llave.
//   3. **No anota los éxitos, uno por uno.** Se anota lo que falla, más un
//      latido `OK` por barrido o por chequeo del panel. Anotar cada request
//      exitosa llenaría la tabla de ruido y escondería justo lo que se busca.

import { supabase } from './tracking.ts'
import {
  nuevaRef, refDelProveedor, sanear,
  type Proveedor, type Resultado,
} from './integraciones.ts'

export type { Proveedor, Resultado }

export interface Contexto {
  proveedor: Proveedor
  /** Qué se estaba haciendo, en el vocabulario de Kross y no en el suyo:
   *  'guia.emitir', 'tracking.lote', 'cobro.cupon'. Es lo que se lee en la
   *  lista, así que se escribe para que se entienda sin abrir el código. */
  op: string
  storeId?: string | null
  sessionId?: string | null
}

interface Anotacion extends Contexto {
  outcome: Resultado
  httpStatus?: number | null
  errorCode?: string | null
  detail?: unknown
  providerRef?: string | null
  duracionMs?: number | null
}

/**
 * Escribe UN evento y devuelve su referencia (`KX-…`), que es lo que se le
 * enseña al proveedor. Devuelve null si no se pudo escribir — cosa que nadie
 * debe tratar como un error: anotar es best-effort por diseño.
 */
export async function anotar(a: Anotacion): Promise<string | null> {
  const ref = nuevaRef()
  try {
    const { error } = await supabase.from('api_events').insert({
      ref,
      provider: a.proveedor,
      op: a.op,
      outcome: a.outcome,
      http_status: a.httpStatus ?? null,
      error_code: a.errorCode ? sanear(a.errorCode, 80) : null,
      detail: a.detail === undefined || a.detail === null ? null : sanear(a.detail),
      provider_ref: a.providerRef ?? null,
      store_id: a.storeId ?? null,
      session_id: a.sessionId ?? null,
      duration_ms: a.duracionMs ?? null,
    })
    if (error) {
      console.error('[api-eventos] no se pudo anotar', a.proveedor, a.op, error.message)
      return null
    }
  } catch (e) {
    console.error('[api-eventos] no se pudo anotar', a.proveedor, a.op, e)
    return null
  }
  // El mismo renglón al log de la función, con su ref: quien esté mirando los
  // logs en vivo puede saltar de ahí al panel sin buscar por hora.
  if (a.outcome !== 'OK') {
    console.error(`[api-eventos] ${ref} ${a.proveedor} ${a.op} ${a.outcome}`, a.httpStatus ?? '')
  }
  return ref
}

/**
 * Anota una respuesta que no sirvió, leyendo de ella lo que hace falta: el
 * status, su id de request y su cuerpo saneado.
 *
 * `4xx` es RECHAZO (contestó: casi siempre es config o payload nuestro) y `5xx`
 * es FALLO (es de ellos). La distinción no es cosmética: es la diferencia entre
 * "arréglalo tú" y "repórtaselo al dueño de la API".
 */
export async function anotarRespuesta(
  ctx: Contexto, res: Response, duracionMs?: number, cuerpo?: string,
): Promise<string | null> {
  const detail = cuerpo ?? await res.text().catch(() => '')
  return anotar({
    ...ctx,
    outcome: res.status >= 500 ? 'FALLO' : 'RECHAZO',
    httpStatus: res.status,
    detail,
    providerRef: refDelProveedor(h => res.headers.get(h)),
    duracionMs,
  })
}

/**
 * Anota el resultado fallido de un módulo PURO —`flow.ts`, `pay360.ts`— que no
 * puede importar este archivo (lo importa `npm test`, donde no hay Deno).
 *
 * Los dos devuelven la misma forma: `{ ok:false, status, error, network }`. Se
 * anota desde la Edge Function y no desde adentro del módulo a propósito: es
 * ahí donde se sabe DE QUÉ MARCA era la llamada, y en los rieles de cobro las
 * llaves son de cada marca — un 401 sin saber de quién no sirve para nada.
 */
export const anotarResultado = (
  ctx: Contexto,
  r: { status?: number; error?: string | null; network?: boolean },
) => anotar({
  ...ctx,
  outcome: r.network ? 'SIN_RESPUESTA' : (r.status ?? 0) >= 500 ? 'FALLO' : 'RECHAZO',
  httpStatus: r.status ?? null,
  detail: r.error ?? null,
})

/** El resultado de un envío a CAPI, tal como lo devuelve `capi.ts`. */
interface EnvioCapi { ok?: boolean; status?: number; body?: string; skipped?: boolean; error?: boolean }

/**
 * Anota lo que devolvió `dispatchConversion`. Vive acá y no en `capi.ts` por lo
 * mismo que `anotarResultado`: ese módulo es puro, y además es en la Edge
 * Function donde se sabe de qué marca y de qué pedido era la conversión.
 *
 * Un `skipped` no se anota: significa que esa marca no tiene la plataforma
 * configurada, y eso no es un fallo de nadie.
 */
export async function anotarCapi(
  ctx: { storeId?: string | null; sessionId?: string | null; evento: string },
  r: { meta?: EnvioCapi; tiktok?: EnvioCapi },
): Promise<void> {
  const partes: [Proveedor, EnvioCapi | undefined][] = [['META_CAPI', r.meta], ['TIKTOK_CAPI', r.tiktok]]
  for (const [proveedor, envio] of partes) {
    if (!envio || envio.skipped || envio.ok) continue
    await anotar({
      proveedor,
      op: `conversion.${ctx.evento.toLowerCase()}`,
      outcome: envio.error ? 'SIN_RESPUESTA' : (envio.status ?? 0) >= 500 ? 'FALLO' : 'RECHAZO',
      httpStatus: envio.status ?? null,
      detail: envio.body ?? null,
      storeId: ctx.storeId ?? null,
      sessionId: ctx.sessionId ?? null,
    })
  }
}

/** Anota que no hubo respuesta: timeout, red caída, DNS. */
export const anotarSinRespuesta = (ctx: Contexto, e: unknown, duracionMs?: number) =>
  anotar({ ...ctx, outcome: 'SIN_RESPUESTA', detail: String(e), duracionMs })
