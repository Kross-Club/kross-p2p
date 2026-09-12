// ─── Hablarle a la Edge Function `afiliados` ─────────────────────────────────
// Una sola puerta para las dos pantallas —la del afiliado y la del admin—
// porque la función es una sola. Lo que cambia es la ACCIÓN, no el camino.
//
// Va con el JWT real de la sesión: quién es quien llama lo decide el servidor
// contra Auth (`quienLlama`), nunca un id que mande el navegador.

import { supabase } from './supabase'
import type { AporteDeTienda, EstadoSuscripcion } from '../../supabase/functions/_shared/afiliados.ts'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export interface Respuesta<T> {
  ok: boolean
  status: number
  data: T & { error?: string }
}

export async function llamarAfiliados<T = Record<string, unknown>>(
  payload: Record<string, unknown>,
): Promise<Respuesta<T>> {
  const { data } = await supabase.auth.getSession()
  const jwt = data.session?.access_token ?? ANON
  try {
    const res = await fetch(`${BASE}/afiliados`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) as T & { error?: string } }
  } catch (e) {
    console.error('[afiliados] la función no respondió', e)
    return { ok: false, status: 0, data: {} as T & { error?: string } }
  }
}

/** Por qué no se pudo, dicho para que se pueda accionar. El precedente es
 *  `ConexionesPage`: un error mudo deja al usuario recargando sin saber qué. */
export function porQueNoSePudo(status: number, error?: string): string {
  if (status === 404) {
    return 'La función `afiliados` todavía no está desplegada '
      + '(`supabase functions deploy afiliados --project-ref ofdjghntvmrdfjhazfvz`).'
  }
  if (status === 401) return 'Tu sesión venció. Vuelve a entrar.'
  if (status === 403) return error || 'Tu cuenta no tiene acceso a esta pantalla.'
  if (status === 0) return 'No hubo respuesta del servidor: revisa tu conexión.'
  return error || `El servidor respondió ${status}.`
}

// ─── Las formas que devuelve la función ──────────────────────────────────────

export interface TiendaReferida {
  id: string
  nombre: string
  slug: string | null
  active: boolean | null
  affiliate_at: string | null
}

export interface MesDelAfiliado {
  periodo: string
  transacciones: number
  /** No contaron porque LA REFERIDA no tenía plan. */
  sin_plan: number
  /** No contaron porque el afiliado-tienda no tenía el SUYO (§52). */
  sin_mi_plan: number
  monto: number
  tiendas: AporteDeTienda[]
}

export interface PagoAlAfiliado {
  id?: string
  affiliate_id?: string
  periodo: string
  transacciones: number
  monto_pen: number
  estado: 'CALCULADO' | 'PAGADO' | 'ANULADO'
  paid_at: string | null
  referencia: string | null
  detalle?: AporteDeTienda[]
}

export interface MiPanel {
  /** `store_id` distingue al afiliado-tienda (§52) del de fuera. */
  yo: { id: string; codigo: string; nombre: string; enlace: string; store_id: string | null }
  tarifa: number
  precio_plan_usd: number
  /** Su PROPIO plan, cuando es una tienda. `null` = afiliado de fuera, que no
   *  tiene plan que vencer — distinto de `'sin_suscripcion'`, que es una tienda
   *  que no está pagando. */
  mi_plan: EstadoSuscripcion | null
  mes: MesDelAfiliado & { tiendas: AporteDeTienda[] }
  pagos: PagoAlAfiliado[]
  equipo: { id: string; codigo: string; nombre: string; nivel: number; active: boolean }[]
}

export interface FilaDeAfiliado {
  id: string
  codigo: string
  nombre: string
  /** De qué tienda es este afiliado, si es una (§52). */
  store_id?: string | null
  email: string | null
  phone: string | null
  referred_by: string | null
  active: boolean
  nota: string | null
  auth_user_id: string | null
  created_at: string
  nivel: number
  enlace: string
  tiendas: number
  transacciones: number
  sin_plan: number
  sin_mi_plan: number
  monto: number
  detalle: AporteDeTienda[]
}

export type { AporteDeTienda, EstadoSuscripcion }
