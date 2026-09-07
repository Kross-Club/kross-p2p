// ─── La cascada de recojo · la regla de los días — PURA ─────────────────────
//
// Cuándo toca cada aviso y qué fecha se le promete al comprador. Sin red y sin
// Deno, para que la parte que decide se pueda probar (`src/lib/recojo.test.ts`);
// el envío vive en la Edge Function `pickup-reminders`.
//
// El problema, medido con operadores reales (`ICP Sales/VALIDACION-AGENCIA.md`):
// entre el 27 % y el 35 % de los compradores NO recoge su paquete si nadie
// insiste, y el 100 % necesita al menos una llamada. La agencia devuelve el
// paquete a los ~7 días, y ahí se pierde el flete de ida, el de vuelta y la
// venta. Perseguir eso a mano es exactamente el techo operativo que este
// producto existe para mover.
//
// La cadencia completa (doc 08), y quién manda cada paso:
//
//   Paso 1 · día 0 · LLEGADA          → `_shared/tracking.ts`, en `EN_DESTINO`
//   Paso 2 · día 2 · RECORDATORIO     → esta cascada
//   Paso 3 · día 4 · ÚLTIMO AVISO     → esta cascada (con la fecha real)
//   Paso 4 · día 5 · AVISO AL VENDEDOR→ esta cascada (una persona, al final)
//
// `pickup_reminder_step` cuenta lo que ESTA cascada mandó: 0 nada, 1 el
// recordatorio, 2 el último aviso, 3 el vendedor avisado. El paso 1 no entra en
// la cuenta porque no lo manda el cron: lo dispara el tracking al llegar.

/** Día en que sale cada paso, contado desde que el paquete llegó a la agencia. */
export const DIA_RECORDATORIO = 2
export const DIA_ULTIMO_AVISO = 4
export const DIA_AVISO_VENDEDOR = 5

/** Cuánto guarda la agencia el paquete antes de devolverlo, si la marca no lo
 *  configuró. Shalom y Olva rondan la semana. */
export const DIAS_EN_AGENCIA_DEFAULT = 7

export type PasoRecojo = 0 | 1 | 2 | 3

/**
 * Qué paso corresponde a un pedido que lleva `dias` esperando en la agencia.
 *
 * Devuelve el paso MÁS ALTO que ya venció, no el siguiente: si el cron estuvo
 * caído tres días, un pedido de día 6 recibe el aviso al vendedor y no un
 * recordatorio de hace cuatro días. Un aviso viejo no solo no sirve: enseña que
 * los mensajes de esta marca llegan tarde.
 */
export function pasoDebido(dias: number): PasoRecojo {
  if (dias >= DIA_AVISO_VENDEDOR) return 3
  if (dias >= DIA_ULTIMO_AVISO) return 2
  if (dias >= DIA_RECORDATORIO) return 1
  return 0
}

/** Días enteros transcurridos entre dos instantes. */
export function diasDesde(desdeIso: string | null | undefined, ahora: Date = new Date()): number | null {
  if (!desdeIso) return null
  const t = Date.parse(desdeIso)
  if (Number.isNaN(t)) return null
  return Math.floor((ahora.getTime() - t) / 86_400_000)
}

/** El día en que la agencia devuelve el paquete. Es el único plazo verificable
 *  que tenemos, y por eso es lo que se le dice al comprador en el último aviso:
 *  una fecha real presiona más que un "no te olvides". */
export function fechaDeDevolucion(llegadaIso: string, diasEnAgencia: number): Date {
  return new Date(Date.parse(llegadaIso) + diasEnAgencia * 86_400_000)
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre',
]

/**
 * La fecha como la diría una persona: "el sabado 12 de setiembre".
 *
 * En hora de **Lima** (UTC-5 fijo, Perú no mueve el reloj): una fecha calculada
 * en UTC cae en el día siguiente para todo lo que pase después de las 7 p. m.,
 * y prometerle al comprador un día que no es sería peor que no dar fecha. Sin
 * tildes porque viaja por SMS (ver `sms-texto.ts`).
 */
export function fechaEnPalabras(d: Date): string {
  const lima = new Date(d.getTime() - 5 * 3_600_000)
  return `${DIAS_SEMANA[lima.getUTCDay()]} ${lima.getUTCDate()} de ${MESES[lima.getUTCMonth()]}`
}
