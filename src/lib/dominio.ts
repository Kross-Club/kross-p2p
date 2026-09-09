// ─── El dominio propio de una marca ─────────────────────────────────────────
//
// Las reglas viven en `supabase/functions/_shared/tienda-url.ts` y se
// reexportan desde acá. No es capricho: el panel valida lo que se teclea, pero
// quien ENFORZA es `manage-store`, y una copia de estas reglas que se
// desincronizara dejaría entrar por el servidor lo que el panel rechaza —o al
// revés—. Una sola definición, dos consumidores. El precedente es `alcance.ts`.

export {
  APEX, baseDeLaTienda, comoResolver, esHostDePlataforma, normalizarDominio, variantesDeDominio,
} from '../../supabase/functions/_shared/tienda-url.ts'
export type {
  Dominio, DominioInvalido, DominioValido, Resolucion, TiendaConDominio,
} from '../../supabase/functions/_shared/tienda-url.ts'
