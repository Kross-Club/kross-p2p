// ─── El nivel de alguien en el equipo, y cómo se escribe ─────────────────────
//
// Tres niveles y dos columnas: `is_admin` dice si administra, `is_operator` si
// además tiene el límite de no destruir. Leerlos ya tenía dueño (`permisos.ts`);
// lo que faltaba era **escribirlos** en un solo sitio.
//
// Faltaba porque el nivel solo se daba AL CREAR, y ahí se armaba a mano en la
// función. Cuando esa función salió a producción una semana después que el
// panel, el alta se ejecutó igual: guardó el nombre, el correo y la contraseña,
// e ignoró en silencio los campos que su versión no conocía. Quedaron cuentas en
// la tienda de la plataforma con `is_admin = false` — que no administran nada,
// no atienden pedidos (ahí no hay) y **no se podían arreglar desde el panel**,
// porque cambiar el nivel de alguien que ya existe no estaba en ninguna
// pantalla. El único arreglo era un UPDATE a mano en la base.
//
// Así que acá viven las dos mitades del problema:
//
//   · `banderasDeNivel` — qué se escribe para cada nivel, una vez, para el alta
//     y para el cambio.
//   · `faltoAlEscribir` — qué de lo pedido NO quedó, comparando contra la fila
//     que se leyó después. Un servidor viejo responde `ok` y escribe de menos;
//     esto es lo que convierte ese silencio en un mensaje.
//
// Sin APIs de Deno: se importa también desde vitest y desde el panel.

import { TIENDA_PLATAFORMA } from './alcance.ts'

export type Nivel = 'miembro' | 'operador' | 'admin'

export interface Banderas {
  is_admin?: boolean | null
  is_operator?: boolean | null
  is_super_admin?: boolean | null
}

/** Qué es alguien, leído de sus banderas. `role_label` no entra: es texto libre
 *  y un "Operador" con dedazo se vería como miembro raso teniendo todo. */
export function nivelDe(p: Banderas | null | undefined): Nivel {
  if (!p?.is_admin) return 'miembro'
  return p.is_operator ? 'operador' : 'admin'
}

export const ES_NIVEL = (v: unknown): v is Nivel =>
  v === 'miembro' || v === 'operador' || v === 'admin'

/**
 * Qué banderas escribe cada nivel — y el alcance sale de la tienda.
 *
 * `is_super_admin` no se pide aparte: quien administra en la tienda de la
 * plataforma administra la plataforma, y punto. Pedirlo por separado fue
 * exactamente lo que dejó cuentas a medias (ver `alcance.ts`).
 */
export function banderasDeNivel(nivel: Nivel, storeId: string): Required<Banderas> {
  const administra = nivel !== 'miembro'
  return {
    is_admin: administra,
    is_operator: nivel === 'operador',
    is_super_admin: administra && storeId === TIENDA_PLATAFORMA,
  }
}

/** La etiqueta con la que se le habla a una persona de su propio nivel. */
export const NOMBRE_DE_NIVEL: Record<Nivel, string> = {
  miembro: 'Equipo',
  operador: 'Operador',
  admin: 'Admin',
}

/**
 * Qué se pidió y no quedó.
 *
 * El caso que atrapa no es un error: es un **éxito parcial**. Una Edge Function
 * desplegada en una versión anterior no falla al recibir un campo que no
 * conoce — lo ignora, escribe el resto y responde `ok`. El panel se lo cree, la
 * pantalla se cierra con normalidad, y el problema aparece días después en otra
 * pantalla y sin rastro de dónde salió.
 *
 * Por eso la comprobación es contra **la fila**, no contra la respuesta: la fila
 * es lo único que no puede mentir sobre lo que se guardó.
 *
 * Devuelve los nombres legibles de lo que falta, en orden, o vacío si todo entró.
 */
export function faltoAlEscribir(pedidas: Banderas, escritas: Banderas | null | undefined): string[] {
  if (!escritas) return ['la cuenta no aparece en el equipo']
  const nombres: Array<[keyof Banderas, string]> = [
    ['is_admin', 'administrar'],
    ['is_operator', 'el límite de operador'],
    ['is_super_admin', 'el alcance de la plataforma'],
  ]
  return nombres
    .filter(([k]) => !!pedidas[k] && !escritas[k])
    .map(([, nombre]) => nombre)
}
