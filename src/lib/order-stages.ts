// ─── Etapas del pedido ───────────────────────────────────────────────────────
// Estaban copiadas en seis archivos. Cada copia era una oportunidad de que una
// pantalla mostrara un orden distinto al de otra — y con la llegada de
// `validando` eso dejó de ser hipotético.
//
// `validando` existe porque un pedido con adelanto quedaba en "Pedido" desde que
// el comprador pagaba hasta que alguien lo confirmaba: pagó y su barra no se
// movía. Sin señal de avance, el siguiente paso del comprador es escribir
// "¿llegó mi pago?" — justo el mensaje que este checkout existe para evitar.

export type OrderStage =
  | 'nuevo' | 'validando' | 'confirmado' | 'preparando' | 'en_camino' | 'entregado'
  // Terminal de FRACASO. No es un paso de la barra (stagesFor no lo incluye:
  // un punto que solo puede encenderse en la derrota no pertenece al tracker
  // que el comprador mira para tranquilizarse) — es el cierre que hace
  // computable la tasa de entrega: entregado / (entregado + no_entregado).
  // Lo marca una persona, nunca el sistema.
  | 'no_entregado'

export interface StageStep {
  key: OrderStage
  label: string
  emoji: string
}

const NUEVO: StageStep      = { key: 'nuevo',      label: 'Pedido',     emoji: '📋' }
const VALIDANDO: StageStep  = { key: 'validando',  label: 'Validando',  emoji: '🔎' }
// `preparando` SALIÓ del eje (ago-2026). No describía un hecho verificable
// —nadie marca "ya lo empaqué", y el comprador que veía ese punto encendido no
// sabía nada que no supiera antes— y el paso que de verdad importa entre cobrar
// y despachar es que exista la guía. Su sitio lo ocupa `confirmado`, que sí dice
// algo comprobable: entró plata. Las filas que la BD todavía tiene en
// `preparando` se leen como `confirmado` — ver `stageVigente`.
const RESTO: StageStep[] = [
  // 💰 y no 📞: lo que pasó acá es que entró plata. La llamada es el medio.
  { key: 'confirmado', label: 'Confirmado', emoji: '💰' },
  { key: 'en_camino',  label: 'En camino',  emoji: '🚚' },
  { key: 'entregado',  label: 'Entregado',  emoji: '✅' },
]

/**
 * Las etapas que le tocan a ESTE pedido.
 *
 * Sin adelanto (Lima, contraentrega puro) no hay nada que validar, así que el
 * paso no aparece: un punto que nunca se va a encender se lee como "algo se
 * atascó", y en la pantalla que el comprador mira para tranquilizarse eso es
 * exactamente lo contrario de lo que buscamos.
 */
export function stagesFor(advanceAmount: number | string | null | undefined): StageStep[] {
  const advance = Number(advanceAmount ?? 0)
  return advance > 0 ? [NUEVO, VALIDANDO, ...RESTO] : [NUEVO, ...RESTO]
}

/**
 * Índice de la etapa actual dentro de la lista que le toca al pedido.
 *
 * Un pedido que ya pasó por `validando` y termina en Lima —o al revés, uno que
 * quedó marcado `validando` y luego perdió el adelanto— no debe romper la barra:
 * si la etapa no está en la lista, se cae a la posición 0 en vez de a -1, que
 * pintaría la barra al revés.
 */
export function stageIndex(stage: string | null | undefined, steps: StageStep[]): number {
  const i = steps.findIndex(s => s.key === stageVigente(stage))
  return i >= 0 ? i : 0
}

/**
 * La etapa vigente de un valor de la base.
 *
 * `toStage` normaliza lo DESCONOCIDO; esto normaliza lo VIEJO. Son cosas
 * distintas: un `preparando` guardado en marzo no es basura —describe un pedido
 * real, cobrado y sin guía— y tratarlo como desconocido lo mandaría a `nuevo`,
 * o sea le pintaría la barra al revés. Peor en el selector del vendedor: con la
 * etapa fuera de la lista, "avanzar" calculaba el siguiente desde el índice -1 y
 * el pedido RETROCEDÍA a la primera etapa.
 *
 * Es la única traducción de etapas retiradas del eje. Si mañana sale otra, va
 * acá y no en cada pantalla.
 */
export function stageVigente(value: string | null | undefined): OrderStage {
  const s = toStage(value)
  return s === 'preparando' ? 'confirmado' : s
}

/** Normaliza lo que venga de la BD. Una etapa desconocida cae a `nuevo`.
 *  `preparando` sigue acá porque la BD todavía lo tiene y su CHECK lo permite:
 *  reconocerlo es lo que deja que `stageVigente` lo traduzca en vez de perderlo. */
export function toStage(value: string | null | undefined): OrderStage {
  const all: OrderStage[] = ['nuevo', 'validando', 'confirmado', 'preparando', 'en_camino', 'entregado', 'no_entregado']
  return all.includes(value as OrderStage) ? (value as OrderStage) : 'nuevo'
}
