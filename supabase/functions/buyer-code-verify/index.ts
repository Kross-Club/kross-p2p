// ─── Verificar el código y abrir la sesión ──────────────────────────────────
//
// El segundo paso de `/acceso`. Compara el código contra el HMAC guardado, y
// solo si cuadra devuelve lo que antes devolvía un DNI a secas: la ficha del
// comprador y sus pedidos con sus tokens.
//
// Cada intento fallido SUMA, y al quinto el código se quema (`INTENTOS_MAX`).
// Sin ese tope, seis dígitos se rompen probando; con él, quien no tiene el
// código tiene cinco tiros entre un millón.
//
// El error es siempre el mismo, venga de un código vencido, gastado o
// equivocado: distinguirlos le diría al que está probando si va bien.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { esDniValido, estadoDeCodigo, normalizarCodigo } from '../_shared/acceso-comprador.ts'
import { CAMPOS_COMPRADOR, crearSesion, hashDeCodigo, payloadDeComprador } from '../_shared/sesion-comprador.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '7200',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

/** Comparación en tiempo constante: salir en la primera letra distinta filtra,
 *  por lo que tarda, cuántos dígitos iban bien. */
function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { document_number, store_id, code } = await req.json().catch(() => ({})) as {
    document_number?: string; store_id?: string; code?: string
  }
  const codigo = normalizarCodigo(code)
  if (!esDniValido(document_number) || !store_id || !codigo) return json({ error: 'datos_incompletos' }, 400)

  const malo = json({ error: 'codigo_invalido' }, 401)

  const { data: buyer } = await supabase
    .from('buyers').select(CAMPOS_COMPRADOR)
    .eq('store_id', store_id).eq('document_number', String(document_number).trim()).maybeSingle()
  if (!buyer) return malo

  const { data: fila } = await supabase
    .from('buyer_login_codes')
    .select('id, code_hash, expires_at, attempts, used_at')
    .eq('buyer_id', buyer.id).eq('store_id', store_id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (estadoDeCodigo(fila, new Date()) !== 'usable') return malo

  // El intento se cuenta ANTES de comparar: si se contara después, cortar la
  // conexión a mitad de camino daría intentos gratis.
  await supabase.from('buyer_login_codes')
    .update({ attempts: Number(fila!.attempts ?? 0) + 1 }).eq('id', fila!.id)

  if (!igual(await hashDeCodigo(codigo, fila!.id as string), String(fila!.code_hash))) return malo

  await supabase.from('buyer_login_codes')
    .update({ used_at: new Date().toISOString() }).eq('id', fila!.id)

  const session_token = await crearSesion(buyer.id as string, store_id)
  const payload = await payloadDeComprador(buyer as Record<string, unknown>, store_id)
  return json({ session_token, ...payload })
})
