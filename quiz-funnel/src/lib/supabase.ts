import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, anon)

// Base para invocar Edge Functions con fetch directo (útil para funciones públicas)
export const FUNCTIONS_BASE = `${url}/functions/v1`
export const ANON = anon
