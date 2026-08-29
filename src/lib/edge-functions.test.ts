import { describe, it, expect } from 'vitest'
import ts from 'typescript'

// ─── Que las Edge Functions al menos SE PUEDAN LEER ──────────────────────────
//
// Nada en el repo miraba estos archivos. `tsc -b` cubre `src/` —las funciones
// son Deno y quedan fuera del proyecto de TypeScript—, los tests no las
// importan, y el build de Vite tampoco las toca. La única comprobación era
// `supabase functions deploy`, o sea el despliegue mismo.
//
// Y así se fue a `main` un `get-session` que no compilaba: una edición partió
// en dos una expresión de dos líneas y dejó huérfano un `|| req.headers…`
// después de una llave. Es JavaScript que *parece* válido —`fn || expr` lo es—
// pero un arrow function no puede ser el lado izquierdo de un `||`, así que el
// parser lo rechaza. El error apareció en el peor sitio posible: en el deploy,
// con la función anterior viva y todos creyendo que la nueva ya estaba.
//
// Esto no comprueba tipos —no hay Deno acá, ni forma de resolver `npm:` o los
// globales de Deno— y no hace falta: lo que se escapó fue SINTAXIS. Parsear
// cada archivo con el parser de TypeScript cuesta milisegundos y ataja justo
// esa clase de error, que es la que no avisa hasta el despliegue.

// Se leen con `import.meta.glob` de Vite y no con `node:fs`: el proyecto de
// TypeScript de `src/` declara `types: ["vite/client"]`, así que importar `fs`
// acá dejaría `tsc -b` en rojo — y una prueba que rompe la comprobación de
// tipos no es una red, es otro agujero.
const fuentes = import.meta.glob('../../supabase/functions/**/*.ts', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/** La ruta como se lee en el repo, para que el fallo diga dónde mirar. */
const enElRepo = (ruta: string) => ruta.replace(/^.*\/supabase\//, 'supabase/')
const archivos = Object.keys(fuentes).sort()

describe('las Edge Functions', () => {
  it('son todas parseables: nada llega roto al deploy', () => {
    const rotos: string[] = []
    for (const ruta of archivos) {
      const { diagnostics } = ts.transpileModule(fuentes[ruta], {
        fileName: enElRepo(ruta),
        reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
      })
      for (const d of diagnostics ?? []) {
        const donde = d.file && d.start !== undefined
          ? `:${d.file.getLineAndCharacterOfPosition(d.start).line + 1}`
          : ''
        rotos.push(`${enElRepo(ruta)}${donde} — ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`)
      }
    }
    expect(rotos).toEqual([])
  })

  // Si un día la carpeta cambia de sitio, esta prueba pasaría sin mirar nada y
  // nadie se enteraría. Que falle es preferible a que mienta.
  it('encuentra los archivos donde espera', () => {
    expect(archivos.length).toBeGreaterThan(20)
    expect(archivos.map(enElRepo)).toContain('supabase/functions/get-session/index.ts')
  })
})
