// ─── ¿Este aviso cae a WhatsApp? ─────────────────────────────────────────────
// La regla, pura y aparte, para poder probarla sin Deno. La usa `notificar.ts`.
//
// Desde el 14-set-2026 el respaldo automático por WhatsApp lo decide CADA
// TIENDA (`stores.wa_fallback_enabled`, §57), no un env global: cuesta
// centavos de USD por aviso y lo paga la marca. Y solo si ningún push llegó —
// el comprador que sí tiene push no necesita dos avisos por lo mismo.

export interface TiendaParaRespaldo {
  wa_enabled?: boolean | null
  wa_phone_number_id?: string | null
  wa_fallback_enabled?: boolean | null
}

export function debeCaerAWhatsApp(pushOk: number, tienda: TiendaParaRespaldo | null | undefined): boolean {
  if (pushOk > 0) return false
  if (!tienda) return false
  return tienda.wa_fallback_enabled === true
    && tienda.wa_enabled === true
    && typeof tienda.wa_phone_number_id === 'string'
    && tienda.wa_phone_number_id.trim().length > 0
}
