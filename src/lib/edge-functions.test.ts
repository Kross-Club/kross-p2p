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

/** Todo lo que tiene cuerpo propio y por tanto su propio alcance. */
const esFuncion = (n: ts.Node) =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) || ts.isMethodDeclaration(n)

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

  // ─── Que todo import con nombre EXISTA en su módulo ───────────────────────
  //
  // La sintaxis correcta no alcanza: `import { anotarConversion } from
  // '../_shared/api-eventos.ts'` parsea perfecto aunque ese módulo exporte
  // `anotarCapi`. Deno lo rechaza recién al ENLAZAR («The requested module …
  // does not provide an export named …») y la función entera no arranca. Así
  // se cayó `pay360-webhook` el 06-set-2026: el import roto entró tres días
  // antes con la consola de Conexiones, nadie redesplegó, y cuando se
  // desplegó, el webhook de 360pay devolvió 500 cuatro veces y un cobro real
  // quedó sin cruzar. `register-buyer` y `flow-confirm` tenían el mismo.
  //
  // Esto es la mitad del enlace de Deno que sí se puede hacer sin Deno: por
  // cada `import { a, b } from './x.ts'` relativo, que `x.ts` exista y exporte
  // `a` y `b`. Con el AST de TypeScript y no con regex, para que `export { a as
  // b }`, `import type` y las listas de varias líneas cuenten como lo que son.
  it('todo import con nombre existe en el módulo que lo exporta', () => {
    const modulos = new Map(archivos.map(ruta => [enElRepo(ruta), analizar(enElRepo(ruta), fuentes[ruta])]))
    const rotos: string[] = []
    for (const [ruta, mod] of modulos) {
      for (const imp of mod.imports) {
        const destino = resolverRelativa(ruta, imp.desde)
        const objetivo = modulos.get(destino)
        if (!objetivo) { rotos.push(`${ruta} importa '${imp.desde}', que no existe`); continue }
        // `export * from` no deja saber qué nombres salen: no se puede afirmar
        // que falte ninguno.
        if (objetivo.reexportaTodo) continue
        for (const nombre of imp.nombres) {
          if (!objetivo.exports.has(nombre)) rotos.push(`${ruta} importa '${nombre}' de '${imp.desde}', que no lo exporta`)
        }
      }
    }
    expect(rotos).toEqual([])
  })

  // ─── Que ningún alcance redeclare un `const`/`let` ────────────────────────
  //
  // `transpileModule` de arriba NO atrapa esto: redeclarar es un error del
  // BINDER (TS2451), no de la gramática, así que el archivo "parsea" perfecto.
  // Deno no: al cargar el módulo lanza «Identifier 'x' has already been
  // declared» y la función devuelve **BOOT_ERROR** — una respuesta del gateway
  // de Supabase SIN las cabeceras CORS de la función, que el navegador reporta
  // como «Failed to fetch», sin status y sin logs. Indistinguible de un fallo
  // de red, y en el panel, de una tienda sin pedidos.
  //
  // Pasó con `get-store-sessions` (07-set-2026): dos bloques que llegaron por
  // su lado —el del DNI el 28-ago, el de los cobros el 31-ago— declararon
  // `const filas` en el mismo alcance. Estuvo una semana en `main` sin que se
  // notara porque nadie redesplegó esa función; se desplegó y el tablero se
  // apagó.
  //
  // Se cuenta por ALCANCE de bloque, que es como lo cuenta JavaScript: el mismo
  // nombre en dos bloques distintos es correcto y no se marca.
  it('ningún alcance declara dos veces el mismo const o let', () => {
    const abreAlcance = new Set<ts.SyntaxKind>([
      ts.SyntaxKind.Block, ts.SyntaxKind.ModuleBlock, ts.SyntaxKind.CaseBlock,
      ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForInStatement, ts.SyntaxKind.ForOfStatement,
    ])
    // Un `const {a, b: c}` o un `const [x]` declaran varios nombres.
    const nombresDe = (n: ts.BindingName, out: string[]) => {
      if (ts.isIdentifier(n)) { out.push(n.text); return }
      for (const el of n.elements) if (ts.isBindingElement(el)) nombresDe(el.name, out)
    }

    const choques: string[] = []
    for (const ruta of archivos) {
      const sf = ts.createSourceFile(enElRepo(ruta), fuentes[ruta], ts.ScriptTarget.ESNext, true)
      const linea = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1

      const recorrer = (nodo: ts.Node, alcance: Map<string, number>) => {
        ts.forEachChild(nodo, hijo => {
          if (ts.isVariableStatement(hijo)) {
            const f = hijo.declarationList.flags
            if (f & (ts.NodeFlags.Let | ts.NodeFlags.Const)) {
              for (const d of hijo.declarationList.declarations) {
                const nombres: string[] = []
                nombresDe(d.name, nombres)
                for (const nombre of nombres) {
                  const antes = alcance.get(nombre)
                  if (antes !== undefined) {
                    choques.push(`${enElRepo(ruta)}:${linea(d)} — '${nombre}' ya estaba declarado en la línea ${antes}`)
                  } else {
                    alcance.set(nombre, linea(d))
                  }
                }
              }
            }
          }
          recorrer(hijo, abreAlcance.has(hijo.kind) ? new Map() : alcance)
        })
      }
      recorrer(sf, new Map())
    }
    expect(choques).toEqual([])
  })

  // ─── Que nada corra ANTES de que exista lo que usa (zona muerta) ──────────
  //
  // Una `function` anidada se puede llamar desde arriba de donde está escrita
  // —se iza y queda lista al entrar al alcance—, pero los `const`/`let` que su
  // cuerpo lee NO: hasta su línea están en la ZONA MUERTA TEMPORAL y leerlos
  // lanza «Cannot access 'x' before initialization». Ni el parser ni el binder
  // lo ven: es de ejecución, y solo en el camino que llega ahí.
  //
  // Costó las dos primeras guías reales de Shalom (07-set-2026, Mono Shop). El
  // ayudante del PDF era un `const` arrow declarado DESPUÉS de todos los
  // `return await guardar(...)`, así que TODA emisión buena moría justo después
  // de que el proveedor cobrara la guía: Shalom con la orden creada
  // (`95027848 / KPK3`, `95026737 / NTTM`) y el pedido sin nada. El expediente
  // decía «error inesperado» y la guía automática, que parecía construida,
  // nunca había funcionado de punta a punta ni una vez.
  //
  // Lo que se mira, por alcance: para cada `function` anidada se busca la
  // primera sentencia del cuerpo que la puede disparar (propagando por quién
  // llama a quién) y se compara contra dónde se declara cada `const`/`let` que
  // esa función lee. Si puede correr antes, se marca. No cuentan los nombres
  // que la función declara ella misma (los tapa) ni los que solo NOMBRA sin
  // leer (`{ auth: x }`, `x.auth`). Es conservador a propósito: prefiere callar
  // a inventar, y aun así ataja la forma exacta que ya se escapó dos veces.
  it('ninguna función anidada usa un const declarado después de poder correr', () => {
    const hallazgos: string[] = []
    for (const ruta of archivos) {
      const sf = ts.createSourceFile(enElRepo(ruta), fuentes[ruta], ts.ScriptTarget.ESNext, true)
      const linea = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1

      const analizar = (cuerpo: ts.NodeArray<ts.Statement>) => {
        const funcs = new Map<string, ts.FunctionDeclaration>()
        const bindings = new Map<string, number>()   // const/let → índice de sentencia
        const lineaDe = new Map<string, number>()
        cuerpo.forEach((st, i) => {
          if (ts.isFunctionDeclaration(st) && st.name) funcs.set(st.name.text, st)
          if (ts.isVariableStatement(st) && (st.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))) {
            for (const d of st.declarationList.declarations) {
              if (ts.isIdentifier(d.name)) { bindings.set(d.name.text, i); lineaDe.set(d.name.text, linea(d)) }
            }
          }
        })
        if (!funcs.size || !bindings.size) return

        // Un identificador es una REFERENCIA solo si no es el nombre de algo:
        // `{ auth: cabeceras }` menciona `auth` sin leerlo, y `x.auth` tampoco.
        const esReferencia = (id: ts.Identifier): boolean => {
          const p = id.parent
          if (!p) return true
          if (ts.isPropertyAccessExpression(p) && p.name === id) return false
          if (ts.isPropertyAssignment(p) && p.name === id) return false
          if (ts.isBindingElement(p) && p.propertyName === id) return false
          if (ts.isQualifiedName(p) && p.right === id) return false
          if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return false
          if (ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodSignature(p)) return p.name !== id
          if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p)) && p.name === id) return false
          return true
        }
        // Nombres que la propia función declara: parámetros, const/let/var,
        // funciones anidadas. Un nombre así NO es el de afuera — lo tapa.
        const propios = (f: ts.FunctionDeclaration): Set<string> => {
          const out = new Set<string>()
          const nombres = (b: ts.BindingName) => {
            if (ts.isIdentifier(b)) { out.add(b.text); return }
            for (const el of b.elements) if (ts.isBindingElement(el)) nombres(el.name)
          }
          for (const par of f.parameters) nombres(par.name)
          const baja = (n: ts.Node) => {
            if (ts.isVariableDeclaration(n)) nombres(n.name)
            if (ts.isFunctionDeclaration(n) && n.name) out.add(n.name.text)
            if (ts.isParameter(n)) nombres(n.name)
            if (ts.isCatchClause(n) && n.variableDeclaration) nombres(n.variableDeclaration.name)
            ts.forEachChild(n, baja)
          }
          if (f.body) baja(f.body)
          return out
        }
        // Identificadores que una sentencia usa AHORA (sin entrar a closures:
        // lo que está dentro de un arrow corre después, no en esta línea).
        const usaAhora = (n: ts.Node, out: Set<string>) => {
          ts.forEachChild(n, h => {
            if (esFuncion(h)) return
            if (ts.isIdentifier(h)) { if (esReferencia(h)) out.add(h.text); return }
            usaAhora(h, out)
          })
        }
        // Todo lo que el cuerpo de una función toca al correr (closures dentro).
        const usaAlCorrer = (n: ts.Node, out: Set<string>) => {
          ts.forEachChild(n, h => {
            if (ts.isIdentifier(h)) { if (esReferencia(h)) out.add(h.text); return }
            usaAlCorrer(h, out)
          })
        }

        const primerUso = new Map<string, number>()
        cuerpo.forEach((st, i) => {
          if (ts.isFunctionDeclaration(st)) return
          const usa = new Set<string>()
          usaAhora(st, usa)
          for (const f of funcs.keys()) if (usa.has(f) && !primerUso.has(f)) primerUso.set(f, i)
        })

        const tocan = new Map<string, Set<string>>()
        for (const [n, f] of funcs) {
          const s = new Set<string>()
          if (f.body) usaAlCorrer(f.body, s)
          for (const propio of propios(f)) s.delete(propio)
          tocan.set(n, s)
        }

        for (let vuelta = 0; vuelta < funcs.size + 1; vuelta++) {
          for (const [n, s] of tocan) {
            const u = primerUso.get(n); if (u === undefined) continue
            for (const otra of s) {
              if (!funcs.has(otra)) continue
              const v = primerUso.get(otra)
              if (v === undefined || u < v) primerUso.set(otra, u)
            }
          }
        }

        for (const [n, s] of tocan) {
          const u = primerUso.get(n); if (u === undefined) continue
          for (const name of s) {
            const d = bindings.get(name)
            if (d !== undefined && u < d) {
              hallazgos.push(`${enElRepo(ruta)}:${linea(funcs.get(n)!)} — '${n}' puede correr desde la sentencia ${u} y usa '${name}', declarado recién en la línea ${lineaDe.get(name)}`)
            }
          }
        }
      }

      const recorrer = (n: ts.Node) => {
        if (esFuncion(n) && n.body && ts.isBlock(n.body)) analizar(n.body.statements)
        ts.forEachChild(n, recorrer)
      }
      analizar(sf.statements)
      recorrer(sf)
    }
    expect(hallazgos).toEqual([])
  })

  // ─── Que toda cabecera propia que el panel manda esté PERMITIDA por CORS ──
  //
  // El navegador pregunta antes de mandar una cabecera `x-…` (preflight), y si
  // la función no la lista en `Access-Control-Allow-Headers` la llamada muere
  // ANTES de llegar: `fetch` lanza «Failed to fetch», sin status ni cuerpo, y
  // los logs de la función no ven nada. Así estuvo el tablero de Pedidos desde
  // el 27-ago hasta el 07-set-2026: el panel mandaba `x-include-cancelled` y
  // `get-store-sessions` permitía `x-store-id, x-seller-id` y nada más. En cero
  // con pedidos reales en la base, y el demo —que no consulta— tapándolo.
  // (Ese caso ya no aplica: los cancelados se piden por la URL. La prueba se
  // queda porque la clase de error sigue viva con cada cabecera nueva.)
  //
  // La regla: toda cabecera `x-…` que una función LEE (`req.headers.get`) y que
  // el front ENVÍA (aparece como literal en `src/`) tiene que estar en su lista.
  // Las que lee y nadie manda desde el navegador (`x-forwarded-for` lo pone el
  // proxy; `x-viewer-role` no lo usa ninguna pantalla) no cuentan.
  it('toda cabecera x-… que el front manda está en el Allow-Headers de la función que la lee', () => {
    const front = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const enviadas = new Set<string>()
    for (const [ruta, src] of Object.entries(front)) {
      if (/\.test\.tsx?$/.test(ruta)) continue
      for (const m of src.matchAll(/'(x-[a-z-]+)'/g)) enviadas.add(m[1])
    }
    // Guardarraíl: si el barrido dejara de encontrar cabeceras, la prueba
    // pasaría sin mirar nada. `x-store-id` es la que no se va a ir.
    expect(enviadas).toContain('x-store-id')

    const faltan: string[] = []
    for (const ruta of archivos) {
      if (!/\/functions\/[^/]+\/index\.ts$/.test(ruta)) continue
      const src = fuentes[ruta]
      const permite = /'Access-Control-Allow-Headers':\s*'([^']*)'/.exec(src)
      if (!permite) continue
      const permitidas = new Set(permite[1].toLowerCase().split(',').map(h => h.trim()))
      for (const m of src.matchAll(/req\.headers\.get\('(x-[a-z-]+)'\)/g)) {
        const h = m[1].toLowerCase()
        if (enviadas.has(h) && !permitidas.has(h)) faltan.push(`${enElRepo(ruta)} lee ${h} y no lo permite`)
      }
    }
    expect(faltan).toEqual([])
  })

  // Si un día la carpeta cambia de sitio, esta prueba pasaría sin mirar nada y
  // nadie se enteraría. Que falle es preferible a que mienta.
  it('encuentra los archivos donde espera', () => {
    expect(archivos.length).toBeGreaterThan(20)
    expect(archivos.map(enElRepo)).toContain('supabase/functions/get-session/index.ts')
  })
})

interface Modulo {
  exports: Set<string>
  reexportaTodo: boolean
  imports: { desde: string; nombres: string[] }[]
}

/** Qué exporta y qué importa (relativo, con nombre) un archivo, leyendo su AST. */
function analizar(ruta: string, src: string): Modulo {
  const sf = ts.createSourceFile(ruta, src, ts.ScriptTarget.ESNext, true)
  const mod: Modulo = { exports: new Set(), reexportaTodo: false, imports: [] }

  const nombresDe = (n: ts.BindingName): string[] =>
    ts.isIdentifier(n) ? [n.text] : n.elements.flatMap(e => ts.isBindingElement(e) ? nombresDe(e.name) : [])

  for (const st of sf.statements) {
    const exportado = ts.canHaveModifiers(st)
      && (ts.getModifiers(st) ?? []).some(m => m.kind === ts.SyntaxKind.ExportKeyword)

    if (exportado) {
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) for (const n of nombresDe(d.name)) mod.exports.add(n)
      } else if (
        (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st)
          || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) && st.name
      ) {
        mod.exports.add(st.name.text)
      }
    }

    if (ts.isExportDeclaration(st)) {
      if (!st.exportClause) mod.reexportaTodo = true
      else if (ts.isNamedExports(st.exportClause)) for (const e of st.exportClause.elements) mod.exports.add(e.name.text)
    }

    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const desde = st.moduleSpecifier.text
      const nb = st.importClause?.namedBindings
      if (desde.startsWith('.') && nb && ts.isNamedImports(nb)) {
        mod.imports.push({ desde, nombres: nb.elements.map(e => (e.propertyName ?? e.name).text) })
      }
    }
  }
  return mod
}

/** `supabase/functions/a/index.ts` + `../_shared/x.ts` → `supabase/functions/_shared/x.ts`. */
function resolverRelativa(desdeArchivo: string, relativa: string): string {
  const partes = desdeArchivo.split('/').slice(0, -1)
  for (const p of relativa.split('/')) {
    if (p === '..') partes.pop()
    else if (p !== '.' && p !== '') partes.push(p)
  }
  return partes.join('/')
}
