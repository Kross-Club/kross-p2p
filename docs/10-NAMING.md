# 10 · NAMING — Cómo se va a llamar el producto de e-commerce

> Kross Club desarrolla productos propios, no software por encargo. Este `.md` es la
> validación de nombre + dominio para **el producto de e-commerce COD**, que hoy vive
> como `marca.krossclub.app` y necesita nombre propio de producto hermano.
>
> Leyenda: ✅ verificado · 🟡 registrado, parqueado en venta · 🔴 registrado y en uso

## Por qué renombrar

`krossclub.app` es el nombre de **la casa**, no del producto. Kross Club es el estudio
(Knowledge · Revenue · Optimization · System · Simple) y este ecom es *uno* de sus
productos. El nombre nuevo tiene que sostenerse sin la marca madre detrás.

## Criterios (derivados del producto, no de gusto)

| Criterio | Por qué |
|---|---|
| Se pronuncia en español a la primera | El comprador y el merchant son peruanos |
| 5–8 letras, 2–3 sílabas | Tiene que caber en un ícono y en la boca |
| Lee bien como `marca.nombre.app` | El producto es white-label multi-tenant |
| Habla de **que el cliente vuelva** | El ICP se movió de adquisición a retención (ver `docs/README.md`) |
| No suena a sub-marca de Kross | Es producto hermano, no una línea |

## Hallazgo del barrido

Se evaluaron **47 nombres** contra **188 dominios** (`.app` · `.com` · `.co` · `.pe`):

- **0 de 47** palabras cortas de diccionario están libres en `.com`. Ese mercado está
  agotado — hay que **acuñar**, no elegir una palabra que ya existe.
- El TLD que importa es **`.app`**, no `.com`: el producto ya es una PWA servida en
  subdominio de marca. `.com` es nice-to-have.
- Quedaron **9 nombres con los 4 TLDs libres a la vez**.

## Finalistas — los 4 dominios libres ✅

Ordenados por qué tan bien cuentan la historia del producto (en disponibilidad empatan).

| # | Nombre | Raíz | Tesis | Riesgo |
|---|---|---|---|---|
| 1 | **Kaserio** | `casero/casera` — el cliente que siempre vuelve al mismo puesto | *Convierte compradores en caseros.* Es el resultado que vende el producto, dicho en peruano. La K lo hermana con Kross sin depender de Kross | Muy local: fuera del Perú hay que explicarlo |
| 2 | **Muyuko** | `muyu` (quechua) — girar, dar la vuelta | *La compra que da la vuelta.* El que más suena a app moderna y el único que aguanta salir del país sin cambiar | El significado no se lee solo; hay que construir la marca |
| 3 | **Vueltik** | `vuelto` (el cambio en efectivo) + `vuelta` (volver) | *Del vuelto a la vuelta.* Contraentrega y retención en una sola palabra castellana | El sufijo `-ik` se siente forzado; **Vueltro** es la alternativa |
| 4 | **Kutimun** | `kutimuy` (quechua) — «vuelve», «regresa» | La recompra dicha en el idioma del sitio, no una metáfora de ella | 7 letras, 3 sílabas |
| 5 | **Ayniko** | `ayni` (quechua) — reciprocidad andina: hoy te doy, mañana me devuelves | *Lo que das, vuelve.* La tesis exacta de un motor de lealtad | Suena japonés antes que andino |
| 6 | **Kaserita** | `casera` — «ya pues, caserita, la yapita» | Versión cálida de Kaserio; reconocimiento instantáneo | El diminutivo y el género marcado achican la marca en B2B |

**Recomendación: `Kaserio`.** Único que ya existe como concepto en la cabeza del cliente
peruano y que además describe el outcome del módulo Loyalty. Ningún software de retención
de la región lo usa.

## Segunda línea (mínimo `.app` libre)

| Nombre | Raíz | `.app` | `.com` | `.co` | `.pe` |
|---|---|:--:|:--:|:--:|:--:|
| Vueltro | como Vueltik, terminación más seca | ✅ | ✅ | ✅ | ✅ |
| Rantiko | `ranti` — comprar (quechua) | ✅ | ✅ | ✅ | ✅ |
| Muyuvo | variante de Muyuko | ✅ | ✅ | ✅ | ✅ |
| Kutimuy | forma quechua correcta de «vuelve» | ✅ | 🟡 | ✅ | ✅ |
| Elcasero | Kaserio con artículo, grafía castellana | ✅ | 🟡 | ✅ | ✅ |
| Kutiy | `kuti` — volver | ✅ | 🔴 | ✅ | ✅ |
| Muyuy | «dar vueltas», infinitivo quechua | ✅ | 🔴 | ✅ | ✅ |
| Yapero | el que da la yapa | ✅ | 🔴 | ✅ | ✅ |
| Ciklo | ciclo de recompra, grafía con K | ✅ | 🔴 | 🔴 | ✅ |
| Kaleta | «caleta», jerga peruana | ✅ | 🔴 | 🔴 | ✅ |

## Descartados — ocupados en `.app` **y** `.com`

Para que no se vuelvan a proponer. Son las opciones obvias, y por eso se las llevaron:

`chasqui` · `chaski` · `yapa` · `casero` · `caserita` · `muyu` · `kuti` · `ayni` · `ranti` ·
`katu` · `kuska` · `minka` · `tinku` · `quipu` · `wasi` · `runa` · `inti` · `killa` · `wayra` ·
`pacha` · `toque` · `altoke` · `kombi` · `kori` · `kero` · `kuna` · `kaya` · `jato` · `chamba` ·
`jarana` · `vuelto` · `rebu` · `orbi` · `loopa` · `nuvo` · `lumo` · `vendi` · `kobra` · `krevo` ·
`tokeo` · `repita` · `yapay` · `kasera`

## Método y sus límites

El proxy de la sesión bloquea `rdap.org` y los RDAP de registro, así que la verificación
fue por **DNS** contra `8.8.8.8` y `1.1.1.1`: se resolvió `NS` y `SOA` de cada dominio.
Con NS o SOA = registrado; `NXDOMAIN` limpio = casi seguro libre. Los 🟡 delegan a
Afternic / Sedo / HugeDomains / ParkingCrew, o sea el dueño los vende (típicamente
US$500–5.000). Búsqueda web de los 6 finalistas como marca: cero resultados relevantes.

**Dos cosas faltan antes de comprar:**

1. `NXDOMAIN` es señal fuerte pero **no autoritativa** — un dominio puede estar registrado
   y nunca delegado. Confirmar en el checkout del registrador.
2. Dominio libre ≠ marca libre. Falta la **búsqueda en INDECOPI** (clases 9, 35 y 42) del
   finalista que se elija.

> Barrido corrido el 2026-08-25.
