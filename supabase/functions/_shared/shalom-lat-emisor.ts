// ─── Emitir la guía por la CONTINGENCIA (Shalom LAT) ─────────────────────────
// El generador de guías (`shalom-order`) trabaja contra el titular, Shalom PE.
// Cuando el titular no responde —red caída, 5xx, o su catálogo mudo—, este
// módulo emite la MISMA guía por Shalom LAT, contra la MISMA cuenta Shalom Pro
// de la marca. El pedido no se entera: la guía que sale de acá se registra con
// `registrarGuia`, igual que la del titular y que la que copia Logística a mano.
//
// ⚠️ Lo más importante de este archivo no es emitir: es NO emitir dos veces.
// Que el titular no haya respondido no significa que no haya creado la orden
// (su doc lo dice con todas sus letras, y no hay clave de idempotencia). Como
// los dos proveedores operan la MISMA cuenta, los "envíos pendientes" de LAT
// también ven lo que emitió PE — así que antes de registrar nada se pregunta si
// la guía de este DNI ya existe. Solo si no está, se emite.

import { supabase } from './tracking.ts'
import {
  buildLatRegisterPayload, buscarPendientePorDni, instanceIdOf, sesionActiva,
  SHALOM_LAT_BASE,
} from './shalom-lat.ts'
import { esRastreable, parseOrderResponse, type GuideResult, type ShalomSize } from './shalom-orders.ts'
import { anotar, anotarSinRespuesta } from './api-eventos.ts'
import { refDelProveedor } from './integraciones.ts'

// El login de una cuenta Shalom Pro tarda de verdad (el titular declara ~90 s,
// hasta 2 min): el timeout es de ese orden, no el de una API normal.
const TIMEOUT_MS = 145_000

export interface EmisionLatInput {
  apiKey: string
  storeId: string
  storeName: string | null
  /** Credenciales de la marca en pro.shalom.pe — las MISMAS del titular. */
  email: string
  password: string
  /** La instancia ya conectada de esta marca, si existe. */
  instanceId: string | null
  originTerminalId: string
  destinyTerminalId: string
  size: ShalomSize | null
  dni: string
  phone: string
  /** Nombres y apellidos de RENIEC. LAT no tiene `person_id`: sin ellos no
   *  emite (y no se inventan partiendo un nombre por espacios). */
  reniec: { name: string; lastName: string; surName: string } | null
  pickupCode: string
  /**
   * ¿Hay que mirar los envíos pendientes ANTES de emitir? `true` cuando el
   * titular pudo haber creado la orden y se calló (timeout, 5xx): la búsqueda
   * es por DNI, así que puede confundirse con otro envío pendiente del mismo
   * comprador — por eso solo se pide donde esa ambigüedad es preferible a
   * emitir (y pagar) dos veces. `false` cuando el titular ni llegó a llamar.
   */
  reconciliarAntes?: boolean
}

export type EmisionLat =
  /** La guía existe. `yaExistia` = la encontramos en los pendientes de la
   *  cuenta, o sea que la había creado el titular antes de callarse: NO se
   *  emitió nada nuevo y no se pagó dos veces. */
  | { ok: true; guia: GuideResult; yaExistia: boolean; instanceId: string }
  /** No se emitió y el motivo es de configuración: es lo que Logística tiene
   *  que completar (`faltan`) o el aviso de que la contingencia no está lista. */
  | { ok: false; clase: 'config'; motivo: string; faltan?: string[] }
  /** Se intentó y no se pudo. `incierto` = puede haberse creado igual, así que
   *  nadie debe emitir otra sin mirar primero en pro.shalom.pe. */
  | { ok: false; clase: 'fallo'; motivo: string; incierto: boolean }

async function llamar(url: string, init: RequestInit): Promise<Response | null> {
  // La operación sale del path: `/account/register` → `account.register`. Es
  // suficiente para leer la lista y evita pasarle un rótulo a cada llamada.
  const op = (url.split(SHALOM_LAT_BASE)[1] ?? url).replace(/^\/+/, '').split('?')[0].replace(/\//g, '.')
  const ctx = { proveedor: 'SHALOM_LAT' as const, op }
  const inicio = Date.now()
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    // Sin consumir el cuerpo: quien llama lo lee después.
    if (!res.ok) {
      await anotar({
        ...ctx,
        outcome: res.status >= 500 ? 'FALLO' : 'RECHAZO',
        httpStatus: res.status,
        providerRef: refDelProveedor(h => res.headers.get(h)),
        duracionMs: Date.now() - inicio,
      })
    }
    return res
  } catch (e) {
    await anotarSinRespuesta(ctx, e, Date.now() - inicio)
    return null
  } finally {
    clearTimeout(t)
  }
}

const leerJson = async (r: Response): Promise<unknown> => {
  const raw = await r.text().catch(() => '')
  try { return JSON.parse(raw || 'null') } catch { return null }
}

/**
 * Emite (o recupera) la guía de este pedido por Shalom LAT.
 *
 * El orden importa y es el que evita pagar dos veces:
 *   1. instancia — se crea una vez por marca y se guarda su id;
 *   2. sesión — login solo si la instancia no la tiene;
 *   3. **pendientes** — ¿ya hay una guía para este DNI? Entonces esa, y listo;
 *   4. recién ahí, `POST /account/register`;
 *   5. si el register no responde, se vuelve a mirar los pendientes antes de
 *      dar nada por perdido.
 */
/** Lo que hace falta para hablar con la cuenta Shalom Pro de una marca por LAT. */
export interface SesionLatInput {
  apiKey: string
  storeId: string
  storeName: string | null
  email: string
  password: string
  /** La instancia ya conectada de esta marca, si existe. */
  instanceId: string | null
}

export type SesionLat =
  | { ok: true; instanceId: string }
  /** Shalom Pro dijo que no: el usuario y la contraseña de la marca están mal. */
  | { ok: false; clase: 'credenciales' }
  /** No se pudo saber: la contingencia no respondió o falló por su cuenta. */
  | { ok: false; clase: 'fallo'; motivo: string }

/**
 * Deja la instancia de la marca lista y con sesión en Shalom Pro.
 *
 * LAT no manda las credenciales en cada request como el titular: mantiene una
 * instancia con la sesión persistida. Se crea una vez por marca y se loguea
 * cuando hace falta. Vive aparte de `emitirGuiaLat` porque también lo usa el
 * panel: cuando el titular está caído, ESTA es la forma de verificar que las
 * credenciales de la marca sirven —si no, conectar una marca nueva durante una
 * caída dejaría el estado en UNVERIFIED y la guía automática apagada, que es
 * justo lo que la contingencia existe para evitar.
 */
export async function asegurarSesionLat(input: SesionLatInput): Promise<SesionLat> {
  const auth = { 'x-api-key': input.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' }

  // ─── La instancia de la marca ─────────────────────────────────────────────
  let instanceId = String(input.instanceId ?? '').trim()
  if (!instanceId) {
    const r = await llamar(`${SHALOM_LAT_BASE}/instances`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: input.storeName || 'Kross' }),
    })
    instanceId = r?.ok ? instanceIdOf(await leerJson(r)) ?? '' : ''
    if (!instanceId) {
      console.error('[shalom-lat] no se pudo crear la instancia', input.storeId, r?.status ?? 'sin respuesta')
      return { ok: false, clase: 'fallo', motivo: 'la contingencia no pudo abrir la instancia de la marca' }
    }
    // Se guarda al toque: crear instancias de más ensucia la cuenta del cliente.
    const { error } = await supabase.from('store_secrets')
      .update({ shalom_lat_instance_id: instanceId }).eq('store_id', input.storeId)
    if (error) console.error('[shalom-lat] no se pudo guardar el instance_id', error.message)
  }

  // ─── La sesión en Shalom Pro ──────────────────────────────────────────────
  const estado = await llamar(`${SHALOM_LAT_BASE}/instances/status`, {
    method: 'POST', headers: auth, body: JSON.stringify({ instanceId }),
  })
  if (estado?.ok && sesionActiva(await leerJson(estado))) return { ok: true, instanceId }

  const login = await llamar(`${SHALOM_LAT_BASE}/instances/login`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ instanceId, username: input.email, password: input.password }),
  })
  if (!login) return { ok: false, clase: 'fallo', motivo: 'la contingencia no respondió al iniciar sesión' }
  if (login.status === 401 || login.status === 403) return { ok: false, clase: 'credenciales' }
  if (!login.ok) {
    console.error('[shalom-lat] login falló', input.storeId, login.status)
    return { ok: false, clase: 'fallo', motivo: `la contingencia no pudo iniciar sesión (${login.status})` }
  }
  return { ok: true, instanceId }
}

export async function emitirGuiaLat(input: EmisionLatInput): Promise<EmisionLat> {
  const auth = { 'x-api-key': input.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' }

  // ─── 1 y 2. La instancia de la marca, con su sesión en Shalom Pro ─────────
  const sesion = await asegurarSesionLat(input)
  if (!sesion.ok) {
    return sesion.clase === 'credenciales'
      ? { ok: false, clase: 'config', motivo: 'Shalom Pro rechazó las credenciales de la marca' }
      : { ok: false, clase: 'fallo', motivo: sesion.motivo, incierto: false }
  }
  const instanceId = sesion.instanceId

  // ─── 3. ¿La guía ya existe? (la defensa contra la doble emisión) ──────────
  const pendientes = async (): Promise<{ numero: string | null; codigo: string | null } | null> => {
    const r = await llamar(`${SHALOM_LAT_BASE}/account/pending-shipments`, {
      method: 'POST', headers: auth, body: JSON.stringify({ instanceId }),
    })
    return r?.ok ? buscarPendientePorDni(await leerJson(r), input.dni) : null
  }

  const yaEstaba = input.reconciliarAntes === false ? null : await pendientes()
  if (yaEstaba?.numero) {
    console.log('[shalom-lat] la guía ya existía en la cuenta', input.dni, yaEstaba.numero)
    return {
      ok: true,
      yaExistia: true,
      instanceId,
      guia: { numero: yaEstaba.numero, codigo: yaEstaba.codigo, oseId: null, serie: null, pdfUrl: null },
    }
  }

  // ─── 4. La llamada que cuesta plata ───────────────────────────────────────
  const armado = buildLatRegisterPayload({
    instanceId,
    originTerminalId: input.originTerminalId,
    destinyTerminalId: input.destinyTerminalId,
    size: input.size,
    pickupCode: input.pickupCode,
    receiver: {
      dni: input.dni,
      name: input.reniec?.name ?? null,
      lastName: input.reniec?.lastName ?? null,
      surName: input.reniec?.surName ?? null,
      phone: input.phone,
    },
  })
  if (!armado.ok) return { ok: false, clase: 'config', motivo: 'faltan datos para emitir por la contingencia', faltan: armado.faltan }

  const res = await llamar(`${SHALOM_LAT_BASE}/account/register`, {
    method: 'POST', headers: auth, body: JSON.stringify(armado.body),
  })

  // ─── 5. Sin respuesta: preguntar si igual se creó ─────────────────────────
  if (!res) {
    const reconciliada = await pendientes()
    if (reconciliada?.numero) {
      console.log('[shalom-lat] reconciliada tras timeout', input.dni, reconciliada.numero)
      return {
        ok: true,
        yaExistia: true,
        instanceId,
        guia: { numero: reconciliada.numero, codigo: reconciliada.codigo, oseId: null, serie: null, pdfUrl: null },
      }
    }
    return { ok: false, clase: 'fallo', motivo: 'la contingencia no respondió al emitir', incierto: true }
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, clase: 'config', motivo: 'Shalom Pro rechazó las credenciales de la marca' }
  }
  if (!res.ok) {
    // El texto crudo del proveedor va SOLO a los logs (regla de la casa).
    const detalle = await res.text().catch(() => '')
    console.error('[shalom-lat] rechazo del proveedor', input.storeId, res.status, detalle.slice(0, 500))
    // Un 5xx pudo crear la orden igual: se mira antes de decir que no hay nada.
    if (res.status >= 500) {
      const quizas = await pendientes()
      if (quizas?.numero) {
        return {
          ok: true,
          yaExistia: true,
          instanceId,
          guia: { numero: quizas.numero, codigo: quizas.codigo, oseId: null, serie: null, pdfUrl: null },
        }
      }
    }
    return {
      ok: false,
      clase: 'fallo',
      motivo: `la contingencia rechazó el envío (${res.status})`,
      incierto: res.status >= 500,
    }
  }

  const guia = parseOrderResponse(await leerJson(res))
  if (!esRastreable(guia)) {
    // La guía SE CREÓ; lo que falló fue leerla. Se busca en los pendientes —
    // que es exactamente para lo que sirven— antes de dar el dato por perdido.
    const recuperada = await pendientes()
    if (recuperada?.numero) {
      return {
        ok: true,
        yaExistia: false,
        instanceId,
        guia: { numero: recuperada.numero, codigo: recuperada.codigo, oseId: null, serie: null, pdfUrl: null },
      }
    }
    console.error('[shalom-lat] respuesta sin guía rastreable', input.storeId)
    return { ok: false, clase: 'fallo', motivo: 'la contingencia emitió pero no devolvió la guía', incierto: true }
  }

  return { ok: true, guia, yaExistia: false, instanceId }
}
