// ─── La llave de Olva API Perú ───────────────────────────────────────────────
// Estaba copiada igual en `olva-tracking` y `olva-tracking-sync`, y ahora la
// pide también la consola de Conexiones (para saber si la integración está
// montada). Tres copias de la misma resolución de llave es una que se olvida de
// actualizar; vive acá por lo mismo que `shalomApiKey` vive en `shalom.ts`.
//
// La key JAMÁS va en el repo ni en el frontend: sale del secret de entorno
// OLVA_API_KEY y, si no está, del Vault por el RPC `olva_api_key()` (sección 21
// de `setup-kross.sql`, solo `service_role`).

import { supabase } from './tracking.ts'

let cached: string | null = null
export async function olvaApiKey(): Promise<string | null> {
  if (cached) return cached
  const fromEnv = Deno.env.get('OLVA_API_KEY')
  if (fromEnv) return (cached = fromEnv)
  const { data, error } = await supabase.rpc('olva_api_key')
  if (error || typeof data !== 'string' || !data) return null
  return (cached = data)
}
