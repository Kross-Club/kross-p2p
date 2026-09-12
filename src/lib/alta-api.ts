// ─── Hablarle a la Edge Function `alta` ──────────────────────────────────────
// Sin sesión: quien la llama todavía no tiene cuenta (§54). Lo que autoriza es
// el token de la fila de `signups`, no un JWT.

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** Dónde se guarda el token entre la landing y la vuelta del pago. Es el camino
 *  normal; el de respaldo es el `?cs=` que Stripe pone en la URL de retorno —y
 *  hacen falta los dos, porque Stripe NO sabe devolver el
 *  `client_reference_id` y el storage puede estar bloqueado. */
export const CLAVE_ALTA = 'kross-alta'

export async function llamarAlta<T = Record<string, unknown>>(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  try {
    const res = await fetch(`${BASE}/alta`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) as T & { error?: string } }
  } catch (e) {
    console.error('[alta] la función no respondió', e)
    return { ok: false, status: 0, data: {} as T & { error?: string } }
  }
}

export const guardarTokenDeAlta = (token: string) => {
  try { localStorage.setItem(CLAVE_ALTA, token) } catch { /* queda el `?cs=` */ }
}

export const tokenDeAltaGuardado = (): string | null => {
  try { return localStorage.getItem(CLAVE_ALTA) } catch { return null }
}

export const olvidarTokenDeAlta = () => {
  try { localStorage.removeItem(CLAVE_ALTA) } catch { /* nada que borrar */ }
}
