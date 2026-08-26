import { createClient } from '@supabase/supabase-js'

// ─── "Mantener sesión iniciada" ──────────────────────────────────────────────
// El panel se abre en computadoras compartidas —el mostrador de la tienda, la
// laptop del despachador—. Si el vendedor desmarca la casilla del login, su
// sesión vive en `sessionStorage` y se muere al cerrar la pestaña; marcada (el
// default) se queda en `localStorage`, como siempre.
const PERSIST_KEY = 'kross-persist-session'

function recuerda(): boolean {
  try { return localStorage.getItem(PERSIST_KEY) !== '0' } catch { return true }
}

/** La llama el login ANTES de entrar: decide dónde se guarda la sesión. */
export function setPersistSession(on: boolean) {
  try {
    localStorage.setItem(PERSIST_KEY, on ? '1' : '0')
    if (!on) {
      // Que no quede una sesión vieja "recordada" de un ingreso anterior.
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('sb-') && k.endsWith('-auth-token')) localStorage.removeItem(k)
      }
    }
  } catch { /* sin storage: la sesión vive lo que dure la pestaña */ }
}

// En los tests (Node) no hay window: un mapa en memoria alcanza.
const memoria = new Map<string, string>()
const almacen = () => {
  if (typeof window === 'undefined') return null
  return recuerda() ? window.localStorage : window.sessionStorage
}

const storage = {
  getItem: (key: string) => almacen()?.getItem(key) ?? memoria.get(key) ?? null,
  setItem: (key: string, value: string) => {
    const s = almacen()
    if (s) s.setItem(key, value)
    else memoria.set(key, value)
  },
  removeItem: (key: string) => {
    memoria.delete(key)
    if (typeof window === 'undefined') return
    // Se borra de los dos lados: da igual dónde haya quedado.
    window.localStorage.removeItem(key)
    window.sessionStorage.removeItem(key)
  },
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  { auth: { storage, persistSession: true, autoRefreshToken: true } },
)
