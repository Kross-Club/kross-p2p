// ─── Traducir el error de una Edge Function a algo accionable ────────────────
// El panel mapeaba los códigos conocidos y todo lo demás caía en un "no se
// pudo guardar" que no dice nada. El caso que más duele es el de una columna
// que no existe: significa que el esquema no está corrido en ese proyecto, y
// desde el panel se ve idéntico a un bug —el vendedor toca, no pasa nada, y no
// hay a dónde mirar—. Decirlo con todas sus letras ahorra la media hora de
// buscar en el lugar equivocado.

/** Mensaje para el panel a partir del `error` que devolvió la función. */
export function mensajePanel(raw: string | null | undefined, fallback: string): string {
  const code = String(raw ?? '').trim()
  if (!code) return fallback
  const columna = code.match(/column "?([\w.]+)"?.*does not exist/i)
  if (columna) {
    return `La base no tiene la columna ${columna[1]}: corre supabase/setup-kross.sql `
      + 'en el SQL Editor del proyecto y reintenta.'
  }
  // Producción por detrás del panel. Vercel despliega el frontend al mergear;
  // las Edge Functions las sube una persona. En esa ventana el panel pide algo
  // que la función desplegada todavía no sabe hacer, y responde este texto
  // plano. Sin traducirlo se ve como un botón roto — y ya costó una semana una
  // vez, con las cuentas del equipo que nacieron sin nivel.
  if (/^unknown action$/i.test(code)) {
    return 'Esa acción todavía no está en producción: la función está desplegada en una '
      + 'versión anterior al panel. Despliégala (ver docs/ESTADO-OPERATIVO.md) y reintenta.'
  }
  // Un código desconocido dice más que una frase amable: es un panel de
  // administración, no una pantalla del comprador.
  return code
}
