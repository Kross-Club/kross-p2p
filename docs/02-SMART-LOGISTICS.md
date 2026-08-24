# 02 · SMART LOGISTICS — Despacho & Motorizados

> **Objetivo:** que el producto llegue a la puerta correcta sin llamadas del motorizado
> preguntando *"¿dónde queda su casa?"*. Entregar sin fallos y en tiempo récord.
>
> Leyenda: ✅ construido · 🟡 parcial · 🔮 planeado

## Componentes

### 1. Geolocalización precisa ✅ / 🔮

> El pin **no está en el checkout**: se captura después de cerrar la venta, en el chat del
> pedido. Ver §4 — la cobertura la decide el distrito, no la coordenada.

- **Hoy ✅:** captura de GPS "mejor fix" en `src/components/AddressBar.tsx` — junta varias
  lecturas por unos segundos y guarda la más precisa (como las apps de taxi), evitando el
  fix grueso del primer intento. Rechaza fixes imprecisos (típico laptop/WiFi). Hace
  reverse-geocode y persiste `address_lat/lng` + `address_verified`. El **comprador** es el
  único que fija/cambia su ubicación; el vendedor la ve read-only (abrir en Google
  Maps/Waze, copiar coordenadas).
- **Falta 🔮:** **pin arrastrable** sobre un mapa para micro-ajustar la casa (hoy es
  "un toque = GPS", sin arrastrar). Es el siguiente salto de precisión, sobre todo iOS.
- **Falta 🔮:** campo `delivery.reference` (referencia de la puerta) en el flujo.

### 2. Hoja de ruta para motorizados (Lima) 🟡
- **Hoy ✅:** rol **Motorizado** en el pipeline; el pedido se le cede en `en_camino`
  (`order-manage`, `HANDOFF`), acompañado por Soporte como co-escritor. Vista del pedido
  con dirección, GPS y teléfono.
- **Falta 🔮:** una **UI/route-sheet dedicada** para el repartidor: lista de entregas del
  día, mapa con referencia exacta, teléfono a un clic y cobranza (COD/Yape) marcada por
  parada. Hoy opera dentro del chat del pedido, no como hoja de ruta optimizada.
- Debe leer `delivery.*` con `dispatchType = 'MOTORIZADO_LIMA'`.

### 3. Gestor de envíos a provincia 🟡
- **Hoy ✅ (data + servicios, sin UI):** cobertura real del courier y listado real de
  agencias, ambos detrás de una interfaz que permite cambiar a API sin tocar componentes.
  Ver §4 y §5.
- **Falta 🔮:** generación de **etiquetas/datos formateados para agencias** (Shalom / Olva
  Courier): nombre, DNI, teléfono, destino, contenido.
- **🟡 Tracking por API + cobranza del saldo — la capa de consulta de Olva ya
  existe** (ver § *Tracking de guías Olva* abajo); falta reflejarla en el pedido
  y Shalom entero. Decisión validada
  con operadores COD reales (ver `docs/ICP Sales/VALIDACION-AGENCIA.md`):
  - Leer del **API de cada agencia** los estados del envío — **en origen → en tránsito →
    en destino** — y reflejar cada transición en el pedido (contrato en
    `MerchantCustomerSession`, `00-CORE-ARCHITECTURE.md`).
  - **El saldo no se cobra en línea.** Al pasar a *en destino* se dispara la cobranza:
    **plantilla de WhatsApp** de recojo/cobro (`send-wa-template`, ya construido) y el
    pedido entra a la **cola de llamadas** del vendedor (LiveKit, ya construido). El
    tracking decide *cuándo* cobrar; la conversación cobra.
  - Subproducto: **tasa de recojo nativa** (*en destino* vs. *entregado*) — la métrica
    que los operadores hoy siguen a mano o no tienen.
- Debe setear `delivery.dispatchType = 'AGENCIA_PROVINCIA'` y `delivery.agencyName`.

### 4. Cobertura del courier (Aliclic / Alidriver) ✅ data · 🔮 UI

Hay **dos fuentes** de cobertura y cada una tiene un rol distinto. No se mezclan.

#### 4.1 Por DISTRITO — es la que decide la venta ✅

`src/lib/checkout/services/DistrictCoverageService.ts`

- **Fuente:** tarifario oficial del courier (hoja "COBERTURA OFICIAL" de
  *COBERTURA ALIDRIVER - ALICLIK*) → `scripts/sources/aliclic-cobertura-distritos.csv` →
  `aliclic-districts.json` + `peru-districts.json` vía `npm run build:data`.
- **178 distritos con cobertura a domicilio** en 28 ciudades; **483 distritos
  seleccionables** en total. Solo **9,6 KB gzip** entre ambos, en chunks aparte.
- El selector muestra **todo el país**, cubierto o no: quien vive donde el motorizado no
  llega igual compra, por agencia. Nunca hay callejón sin salida.
- El índice es la **unión** de `peru-geo.ts` y el tarifario: a `peru-geo.ts` le faltaban
  **53 de los 178** distritos cubiertos, y esos compradores habrían ido a agencia sin
  necesidad.
- Veredicto: `IN_ZONE` → domicilio · `BORDERLINE` → agencia (visita semanal, o ciudad en
  `AGENCY_ONLY_CITIES`) · `OUT_OF_ZONE` → agencia.
- Distritos homónimos (hay un Miraflores en Lima y otro en Arequipa) se desambiguan por
  `departamento|provincia|distrito`.

**Por qué distrito y no polígono.** Se comparó el veredicto de ambas fuentes usando las
487 sedes de Shalom como muestra de dónde hay gente y comercio: **coinciden en el 94,9 %**
(314/331). Cobrarle un paso de mapa al 100 % de los compradores para ganar precisión en el
5 % restante cambia conversión por exactitud, y aquí gana la conversión. Las tres ciudades
donde el distrito se queda corto (Tumbes 60 %, Cusco 67 %, Talara 67 %) las resuelve la
propia data: Tumbes no figura en el tarifario (queda no cubierto) y los 13 distritos
semanales de Cusco se degradan solos. Ese proxy es geográfico, no ponderado por demanda
real; se recalcula cuando haya pedidos con coordenadas.

#### 4.2 Por POLÍGONO — análisis post-venta, no decide la venta ✅

`src/lib/checkout/services/CoverageService.ts`

- **Fuente:** KML oficial del courier (`scripts/sources/aliclic-cobertura.kml`) →
  `aliclic-zones.json`. 29 ciudades, 148 anillos (9 agujeros = zonas excluidas dentro de
  un área cubierta), 3.682 vértices. ~27 KB gzip, chunk aparte.
- Se evalúa **cuando ya existe una coordenada**: la dirección guardada del comprador, o el
  pin que captura `AddressBar` en el chat del pedido después de cerrar la venta.
- **Los polígonos no son binarios.** Cada zona lleva un **recargo** (`ADICIONAL N` = +S/N
  sobre la tarifa base). Cotejado contra el tarifario y calza: Trujillo base S/15.50 y El
  Porvenir S/15.50–20.50 → delta 5 = capa `TRUJILLO ADICIONAL 5`. Ese recargo es **costo
  de la marca, no del comprador**, y jamás se le traslada.
- `surcharge: null` = la capa dice "ADICIONAL" sin monto (Cusco, Chiclayo, Lima). Hay
  recargo pero se desconoce cuánto; tratarlo como 0 subestimaría el costo.
- **Ciudades piloto:** en Ilo, Moquegua, Talara, Puerto Maldonado y Chincha la zona base
  viene rotulada "PRUEBA" en el mapa. **No es basura** — es la única zona base de esas
  ciudades y cae sobre su centro. Filtrarlas dejaba sin cobertura sus centros.

> **No hay mapa en el checkout.** El pin nunca fue para validar cobertura: según este
> mismo doc, es para que el motorizado llegue a la puerta correcta. Eso es valor
> operativo, no un requisito de venta — y se captura después, donde el comprador ya está
> comprometido. Sin mapa no hace falta Leaflet (~42 KB) ni proveedor de tiles.

### 5. Listado de agencias ✅ Shalom · ✅ Olva

`src/lib/checkout/services/AgencyService.ts` — **las dos agencias se resuelven con el
mismo código**.

| | Sedes | Fuente |
|---|---|---|
| **Shalom** | 487 | CSV oficial → `scripts/build-agencies.mjs` |
| **Olva** | 424 | su propio buscador → `scripts/build-olva.mjs` |

⛔ **El texto libre (`OTRO`) se eliminó** (ago-2026). Existía para la sede que no aparecía
en el listado y abría un campo abierto que dejaba el pedido en verificación manual. Con
911 puntos ordenados por distancia, quien no encuentra su sede exacta elige **la más
cercana que reconoce** — y una sede escrita a mano no se puede validar, rankear ni
rastrear. Con ella se fueron el botón "Mi agencia no está en la lista" y la rama `OTRO`
del picker.

#### El comprador elige un LUGAR, no un courier ✅

`AgencyService.getNearestPoints()` devuelve los puntos más cercanos **de todas las
agencias juntas**, ordenados por distancia real al centroide del distrito. La agencia es
un atributo de la tarjeta, no una pregunta previa.

Antes eran dos decisiones —agencia y después sede— y la primera se tomaba sin el dato que
decide. La agencia por defecto era una constante global, `RECOMMENDED_AGENCY = 'SHALOM'`,
justificada en un adelanto de «S/10 contra S/20» que ya no era el vigente.

**Se borró, y el motivo es data, no estilo.** Contando las 911 sedes por departamento,
**Olva tiene más presencia que Shalom en 11 de los 25** — Shalom domina la costa (Ica
18-5, Lambayeque 21-9, Piura 30-14) y Olva la sierra centro (Huancavelica 9-1, Ayacucho
13-5, Apurímac 7-3). El caso extremo es Huancavelica: Shalom tiene **una sola sede en todo
el departamento**, así que su segunda opción más cercana está a **80 km**. La lista
unificada mantiene las cuatro primeras bajo 40 km.

El conteo completo, departamento por departamento (**Olva** marca dónde tiene más sedes):

| Departamento | Shalom | Olva | Total |
|---|---:|---:|---:|
| Lima | 154 | 128 | 282 |
| Arequipa **Olva** | 31 | 36 | 67 |
| La Libertad | 29 | 27 | 56 |
| San Martín **Olva** | 23 | 27 | 50 |
| Cajamarca **Olva** | 19 | 25 | 44 |
| Junín | 24 | 20 | 44 |
| Piura | 30 | 14 | 44 |
| Cusco | 25 | 12 | 37 |
| Áncash **Olva** | 14 | 20 | 34 |
| Lambayeque | 21 | 9 | 30 |
| Puno | 16 | 8 | 24 |
| Ica | 18 | 5 | 23 |
| Loreto **Olva** | 8 | 11 | 19 |
| Ayacucho **Olva** | 5 | 13 | 18 |
| Callao | 11 | 6 | 17 |
| Amazonas **Olva** | 6 | 10 | 16 |
| Huánuco **Olva** | 6 | 9 | 15 |
| Ucayali | 8 | 7 | 15 |
| Tacna | 9 | 4 | 13 |
| Tumbes | 9 | 4 | 13 |
| Pasco **Olva** | 4 | 7 | 11 |
| Apurímac **Olva** | 3 | 7 | 10 |
| Huancavelica **Olva** | 1 | 9 | 10 |
| Moquegua | 7 | 3 | 10 |
| Madre de Dios | 6 | 3 | 9 |
| **Total** | **487** | **424** | **911** |

> Tabla contada sobre `src/data/agencies/shalom.json` y `olva.json` (campo `department`
> de cada sede). Es una **foto, no una regla**: la recomendación no la lee — sale del
> orden por distancia. Se recalcula con los JSON regenerados
> (`node -e` sobre `branches` agrupando por departamento, o `npm run build:data` primero
> si cambió la fuente).

- Ordenar por distancia hace emerger la regionalización **sola**, y se mantiene sola
  cuando un courier abre o cierra un local. Una tabla por departamento habría que
  actualizarla a mano con cada cambio del listado.
- `LISTED_AGENCIES` se deriva de los loaders: **sumar Marvisur o Cruz del Sur es agregar
  su loader**, y entra solo a los rankings, a la búsqueda y a la UI.
- **Cuándo sumar una agencia más: cuando la tasa de recojo lo pida, no antes.** Con ambas
  agencias en los 25 departamentos no hay hueco geográfico que llenar: una agencia nueva
  agrega densidad donde ya hay cobertura, y cuesta un JSON que mantener y una fila más en
  una pantalla que vive de tener pocas opciones. La señal para sumarla es que la tasa de
  recojo caiga en una zona (y el courier local aparezca en los reclamos) — y esa métrica
  ya está en camino: `agency_selected` con `rank`/`distanceKm` hoy, tracking por API (§3)
  después.
- ⚠️ **Los ids solo son únicos dentro de cada agencia** — 197 se repiten entre las dos. En
  una lista mezclada hay que comparar por `pointKey()` (`AGENCIA:id`); comparar por id
  seleccionaría dos tarjetas a la vez.
- ⛔ **La tarjeta ya no muestra adelanto.** Lo mostraba porque cambiaba por courier (S/20
  Shalom vs S/25 Olva), y eso es justo lo que la lista unificada volvió absurdo: dos sedes
  contiguas de couriers distintos pedían montos distintos **por el mismo viaje**, y el
  número saltaba al cambiar de tarjeta. Desde ago-2026 el adelanto es la mitad del pedido
  (o el total) y **no depende del punto elegido**, así que cambiar de sede ya no puede
  reescribir el monto que el comprador vio. Con esto se fue `ADVANCE_AGENCY_FROM_PEN`, el
  «desde» que se pintaba antes de elegir. Ver `01-SALES-ENGINE.md`.
- `agency_selected` ahora lleva `rank` y `distanceKm`: es la métrica que valida el cambio
  —si el comprador casi siempre toma el primero, ordenar por distancia recomienda bien— y
  la primera versión de la tasa de aceptación por courier y zona.
- ⚠️ **El CSV de Shalom traía las coordenadas corruptas** (locale español: el punto
  decimal leído como separador de miles, 487 de 488 filas). El generador las reconstruye
  y desambigua con el centroide del departamento.
- ⚠️ **En Olva, 5 sedes traen lat y lng intercambiadas** (Ayacucho, San Sebastián,
  Pangoa…). Se detectan y corrigen solas: los rangos de latitud y longitud de Perú no se
  solapan, así que el intercambio es inequívoco.
- **9 sedes de Olva no traen coordenadas.** No se descartan: siguen apareciendo en el
  listado buscable para que alguien de ese distrito pueda elegirlas. Lo único que no
  pueden es ordenarse por cercanía.
- El teléfono del CSV de Shalom es el call center (7 valores para 488 sedes), no el de
  cada sede: se omite a propósito. Olva sí trae **horarios por día**, todavía sin usar.
- ⚠️ **La data de Olva no viene de un acuerdo con ellos**, sino de su buscador público.
  Puede cambiar de forma sin aviso y el generador se rompería. Lo sólido a mediano plazo
  es pedirles el listado oficial, como se hizo con Shalom. Mientras tanto, la misma data
  existe como API (`GET /v1/agencias` de Olva API Perú, con `ubigeo`, coordenadas y
  horario por sede — ver § *Tracking de guías Olva*): candidata a reemplazar el scraping
  de `build-olva.mjs`, con la misma reserva de que tampoco es un acuerdo oficial.

### 6. Centroides para ordenar agencias ✅

`scripts/build-centroids.mjs` → `src/data/coverage/district-centroids.json`

Promedia las **911 sedes de ambas agencias** para obtener un punto por distrito (378),
provincia (165) y departamento (25). Sirve para ordenar las agencias por cercanía **sin
pedirle al comprador su ubicación**.

`getDistrictCenter` **degrada distrito → provincia → departamento**. Sin eso, alguien en
un distrito sin sedes se quedaba sin punto de referencia: se detectó en Poroy (Cusco), a
quien el checkout le ofrecía sedes de **Amazonas**. Corregido y con test.

Corre **después** de los generadores de agencias, porque lee sus JSON ya construidos.

## Datos que consume/produce (estado central)
- Lee: `customer.phone`, `delivery.lat/lng/addressText`.
- Escribe: `delivery.reference` 🔮, `delivery.dispatchType` 🔮, `delivery.agencyName` 🔮.

## Estándares
- El comprador es la única fuente de verdad de su ubicación; el motorizado NO la edita.
- No re-pedir dirección si ya está `address_verified` (heredar del `buyers`).
- Coordenadas siempre con precisión validada antes de guardar (ver AddressBar).

## Pendientes priorizados
1. 🔮 Pin arrastrable + campo referencia, en el chat del pedido (post-venta), no en el
   checkout.
2. 🔮 Route-sheet del motorizado (Lima) con cobranza por parada.
3. 🔮 Generador de envíos a provincia (Shalom/Olva).
4. 🔮 Tracking por API de Shalom/Olva (origen → tránsito → destino) con disparo de
   cobranza del saldo (plantilla WhatsApp + llamada) al llegar a destino. Ver §3.
5. 🔮 Persistir `courier_surcharge` y `coverage_result` en `order_sessions` — es la data
   con la que se negocia cobertura con Aliclic y se mide venta perdida por zona.

## Regenerar la data

```
npm run build:data     # KML + CSV + JSON de scripts/sources → src/data/
npm test               # valida geo, cobertura y agencias contra la data real
```

Las fuentes crudas viven versionadas en `scripts/sources/` para que los generadores sean
reproducibles y auditables. Los JSON de `src/data/` son **generados**: no se editan a mano.

## En agencia no se pide GPS

El chat mostraba "DIRECCIÓN DE ENTREGA · SIN VERIFICAR" con botón **Verificar
GPS** en TODOS los pedidos, también en los de recojo en agencia. Ahí el paquete
va a un mostrador, no a una puerta: pedir GPS no solo no aporta, sino que le
estampa al pedido **la coordenada de la casa del comprador**, y Logística
termina viendo un domicilio con botones de Maps y Waze para una entrega que es
de counter. Pasó de verdad — un pedido a Shalom en La Peca quedó con
`address_verified = true` y un pin de vivienda.

La máquina del checkout ya decidía bien (`needsLocationConfirmation` es false en
agencia, ver `01-SALES-ENGINE.md`); lo que faltaba era que el chat se enterara.
Ahora `get-session` devuelve `dispatch_type` / `agency_name` y `AddressBar`:

- rotula **"Recojo en agencia · SHALOM"** en vez de "Dirección de entrega";
- no muestra el botón de GPS ni el "sin verificar" naranja —el pedido está
  completo, no hay nada pendiente que reclamarle a nadie;
- no ofrece Maps/Waze sobre una coordenada que no corresponde al destino.

**Regla general:** todo lo que el checkout decide sobre la entrega tiene que
viajar al chat. Si el chat no conoce `dispatch_type`, vuelve a inventar
pendientes que el checkout ya había resuelto.

## Antes de despachar: el adelanto

Un pedido de provincia no se despacha por estar "confirmado": se despacha cuando el
adelanto está verificado **y sin advertencias pendientes**.

- `advance.verification = 'MATCHED'` y `reason` vacío → listo.
- `MATCHED` **con** `reason` → lo mira una persona. El pedido avanza igual en la barra del
  comprador —el dinero entró, la duda es nuestra— pero el `AdvancePanel` del chat de
  Ventas muestra la advertencia.
- `PENDING` → el adelanto no está cobrado. No se despacha. Si la marca no tiene 360pay
  conectado, ese es su estado normal y el cobro lo coordina Ventas por el chat.

Contrato y reglas completas en `00-CORE-ARCHITECTURE.md`.

## El saldo de agencia se cobra por la app, nunca en el mostrador

Regla de negocio que TODO copy (chat, checkout, closer de voz) tiene que respetar:

- El saldo de un pedido con recojo en agencia **no se paga a la agencia**: se nos paga a
  nosotros, **por la misma app/chat del pedido**.
- El cobro procede recién cuando el envío está registrado y **tenemos la guía** (que se le
  envía por el chat: es el canal principal). El comprador elige el momento: pagar apenas
  recibe la guía, o esperar a que el pedido llegue a la agencia y pagar antes de retirarlo.
- La **clave de recojo se entrega contra el saldo pagado**. Quien pagó el total la recibe
  junto con la guía, sin condición.
- Corolario: nunca escribir "el saldo lo pagas al recoger" ni "pagas el resto ahí" para
  agencia — ese copy arma el reclamo del día del recojo. "Al recibir" sigue siendo
  correcto solo para entrega a domicilio.

## El catálogo de distritos sale del padrón del INEI ✅

`src/data/peru-geo.ts` se escribía **a mano** y tenía **483 de los 1 874
distritos** del país. No fallaba parejo: Áncash tenía 14 de 166, Cajamarca 11 de
127, faltaba Paramonga y **el Callao entero no existía**.

Para el comprador eso no se lee como "falta un dato": **su distrito no aparece,
así que no puede terminar la compra**. Y es una venta perdida invisible — no deja
rastro en ninguna métrica, porque el pedido nunca llega a crearse.

Ahora se genera con `scripts/build-peru-geo.mjs` desde el padrón UBIGEO del INEI,
copiado a `scripts/sources/ubigeo-*.json` para que el build no dependa de un repo
ajeno. Va primero en `npm run build:data`.

| | Antes | Ahora |
|---|---|---|
| Distritos seleccionables | 483 | **1 874** |
| Con cobertura a domicilio | 178 | 176 |
| Departamento de Áncash | 14 | 166 |
| Callao | 0 | 7 |

### Por qué la cobertura bajó de 178 a 176

No se perdió ninguna: **el tarifario nombra los distritos a su manera** y dos
filas apuntaban al mismo distrito oficial (`Caleta San José` y
`San José - Ciudad de Dios` son ambos **San José**, Lambayeque). Antes entraban
como dos entradas distintas; ahora se funden en la real.

### El mapa de equivalencias

El courier llama `Pucallpa` a **Callería**, `Cercado de Lima` a **Lima**, y trata
al Callao como provincia de Lima cuando el padrón lo tiene como departamento
propio. Sin cruzar esos nombres, el **mismo distrito entraba dos veces** al
selector: una con cobertura (nombre del courier) y otra sin (nombre oficial). El
comprador veía "Ventanilla" repetido, elegía el equivocado y terminaba yendo a
agencia **teniendo entrega a domicilio disponible**.

`DISTRICT_ALIAS` en `scripts/build-districts.mjs` resuelve las 22 equivalencias,
en los dos sentidos: del courier al padrón para construir el índice, y del padrón
al courier para encontrar la cobertura.

> Las claves van **ya normalizadas** —sin tildes, en mayúsculas—. Escribir
> `PIÑIPAMPA` en vez de `PINIPAMPA` hace que el alias no calce nunca, y en
> silencio: el distrito reaparece duplicado sin que nada falle.

### Peso

El índice pesa 232 KB, pero se carga **bajo demanda** (import dinámico) y va en
su propio chunk: **15.9 KB gzip**, solo cuando el comprador abre el selector.

### Los centroides siguen sirviendo

Ordenar agencias por cercanía no se degradó con los 1 400 distritos nuevos:
`district-centroids.json` cae distrito → provincia → departamento, y los 25
departamentos están cubiertos. Todos tienen un punto de referencia razonable.

## El selector ordena por relevancia, no por dataset ✅

Con el padrón completo, el filtro plano (`includes` en el orden del dataset,
alfabético por departamento) enterraba al distrito probable: tecleando
**"santiago"** salían 24 coincidencias con **Santiago de Surco en el puesto 23**,
detrás de 22 homónimos rurales. Y era sensible a tildes: "ancash" no encontraba
Áncash, "canete" no encontraba Cañete — cero resultados, venta en riesgo.

Se corrigió en dos capas, las dos sin añadir campos ni pasos (se evaluó y
descartó preguntar provincia antes del distrito: cobra fricción a todos, nadie
piensa en "provincia", y una provincia mal elegida esconde el distrito real):

1. **Ranking** (`src/components/checkout/fields/rank.ts`): pliega tildes y
   ordena por cómo coincide — empieza-con > palabra del nombre > subcadena >
   provincia/departamento. El sort es estable: entre iguales gana el que venía
   primero en la lista.
2. **Prior de orden**: quién va primero entre iguales lo decide el orden de
   entrada de la lista, que `Step2Delivery` arma así:
   - con **pista de geo-IP** (`api/geo.js` re-expone los headers
     `x-vercel-ip-*` de Vercel; `GeoHintService` la trae con cache y timeout),
     por cercanía vía `DistrictCoverageService.sortByProximity`, con la misma
     degradación de centroides;
   - sin ella, **Lima metro → cubiertos → resto** — donde vive el grueso de
     los pedidos.

> La geo-IP **solo reordena, jamás filtra ni preselecciona**: los datos móviles
> peruanos salen por CGNAT del operador y geolocalizan a Lima esté donde esté el
> comprador. Como prior, un fallo cuesta cero (el comprador teclea y encuentra
> su distrito igual); como filtro costaría la venta. Por lo mismo, nada de
> prompt de GPS en el checkout. Fuera del Perú la función devuelve `null`.

La métrica que valida el prior es `rank` en el evento `location_selected`:
posición del distrito elegido en la lista antes de teclear, con `geoHint`
diciendo qué prior estaba activo.

## Las dos ramas dejaban 128 distritos sin puerta ✅

El selector de Lima filtraba `department === 'Lima' && province ∈ {Lima, Callao}`
y el de provincia `department !== 'Lima'`. Dos filtros que **tienen** que ser
complementarios, escritos por separado en archivos distintos.

Entre los dos se perdían **los 128 distritos del departamento de Lima que no son
Lima metropolitana**: Barranca, Paramonga, Huacho, Cañete, Huaral, Chancay,
Matucana… Para esa gente el distrito no aparecía en ninguna rama, y no había
forma de comprar.

Se notaba poco porque el catálogo hecho a mano casi no los listaba. Al traer el
padrón completo el agujero pasó a ser de 128 distritos reales.

Ahora la definición vive **una sola vez**, en `DistrictCoverageService`:

```ts
isLimaMetro(d) // Callao, o provincia de Lima
districtsFor('LIMA' | 'PROVINCIA')
```

Las dos ramas la comparten, así que **son complementarias por construcción**: hay
un test que verifica que `lima + provincia === todos` y que no se solapan. Si
alguien cambia la definición, no puede abrir un agujero sin que falle.

> **El Callao es su propio departamento** en el padrón del INEI, no una provincia
> de Lima. `isLimaMetro` lo trata como Lima porque para el motorizado lo es —
> pero el filtro viejo lo buscaba como provincia y lo dejaba fuera de ambas.

| | Distritos |
|---|---|
| Lima metropolitana (motorizado propio) | 50 |
| Resto del país (courier o agencia) | 1 824 |
## Cuatro formas de entregar: región × método

`dispatch_type` tenía solo `MOTORIZADO_LIMA` y `AGENCIA_PROVINCIA`, y el reparto
**a domicilio en provincia** no era ninguna de las dos. Caía en la rama de Lima
por descarte —"no es agencia, entonces es motorizado"— y entraba al tablero como
pedido limeño: otro courier, otros plazos y otro costo, contados donde no van.

Después se sumó el cuarto: **recoger en agencia también en Lima**. "No es agencia"
dejó de significar Lima, y "agencia" dejó de significar provincia.

| Valor | Qué es |
|---|---|
| `MOTORIZADO_LIMA` | Motorizado propio, Lima metropolitana |
| `MOTORIZADO_PROVINCIA` | Courier a la puerta, fuera de Lima |
| `AGENCIA_PROVINCIA` | Mostrador de Shalom u Olva, fuera de Lima |
| `AGENCIA_LIMA` | Mostrador de Shalom u Olva, en Lima |

> La columna "Adelanto" que tenía esta tabla se eliminó: el monto ya no depende
> del despacho sino del precio del pack. Ver `01-SALES-ENGINE.md`.

`MOTORIZADO_PROVINCIA` antes casi no pasaba: la cobertura rara vez elegía
domicilio fuera de Lima. Con el **checkout B** es una opción que el comprador
marca a propósito, así que pasó de rareza a caso frecuente.

⚠️ **La lista blanca de `register-buyer` es obligatoria.** Aplasta contra
`MOTORIZADO_LIMA` todo valor que no reconoce, **sin error**: sumar una combinación
al front sin agregarla ahí manda un motorizado a una casa por un paquete que está
en el mostrador, y nada avisa.

**Lo que sigue igual:** todo lo que pregunta `=== 'AGENCIA_PROVINCIA'` ("¿es
recojo?") no cambió — el pin GPS se sigue pidiendo salvo en agencia, y ahora eso
incluye correctamente al domicilio de provincia, que sí lo necesita.

No hizo falta migración: la columna nunca tuvo `CHECK`, solo un default.

## Deuda conocida · el catálogo de distritos está incompleto 🟡

`src/data/peru-geo.ts` se escribió a mano y tiene **483 distritos de los ~1 895
del país**. Faltan unos 1 400.

No falla parejo, y ahí está el problema:

| Departamento | Tenemos | Reales |
|---|---|---|
| Áncash | 14 | 166 |
| Cajamarca | 11 | 127 |
| Junín | 13 | 124 |
| Ayacucho | 22 | 119 |
| Cusco | 23 | 112 |
| **Callao** | **0** | 7 |
| Lima | 63 | 171 |

Barranca sí está; **Paramonga no**. Y **Callao no existe en el selector**, que no
es un pueblo perdido: es el segundo puerto del país pegado a Lima.

Para el comprador esto no se lee como "falta un dato": su distrito **no existe**,
así que no puede terminar la compra. Es una venta perdida silenciosa — no deja
rastro en ninguna métrica, porque el pedido nunca llega a crearse.

**El arreglo no es agregar Paramonga a mano.** Hay que regenerar el catálogo
desde el padrón de UBIGEO del INEI (los 1 895 distritos con su código oficial) y
cruzarlo contra la cobertura del courier, igual que hoy hace
`scripts/build-districts.mjs`. Los distritos sin veredicto de cobertura entran
como "sin cobertura a domicilio" — que ya es un camino válido: se entrega por
agencia.

## Tracking de guías Olva 🟡 · la capa de consulta

Primer tramo del pendiente #4 (§3): **consultar** el estado de una guía de Olva.
Reflejarlo en el pedido y disparar la cobranza siguen 🔮.

### Quién es el proveedor (y quién no es)

**Olva API Perú** (`https://olva-api-peru.com/docs/`) — un proveedor
**independiente**, no la API oficial de Olva Courier; su propio pie de página lo
declara. Misma fragilidad que ya asumimos con `olva.json` (§5, sale de su
buscador público): puede cambiar o morir sin aviso. La capa está aislada
justamente para eso — si mañana hay API oficial, cambia el proxy y nada más.

| | |
|---|---|
| Base | `https://api.olva-api-peru.com` |
| Auth | header `X-API-Key` (key `sk_…`) |
| Límite | 60 requests/min por key → `429` |
| Tracking | `GET /v1/tracking/{track}/{year}` — año de emisión en 2 dígitos, solo últimos 4 años |
| Agencias | `GET /v1/agencias` — filtros `cod_dep`, `departamento`, `tipo`, `partner`, `nombres`; paginado `page`/`limit` (máx 100) |
| Health | `GET /healthz`, sin auth |

⚠️ **Una guía inexistente NO devuelve 404: devuelve `502` "Error consultando
Olva"**, indistinguible de Olva caído (verificado contra la API real). Por eso
el fallo se reporta como `upstream`, nunca como "guía no existe" — decirle al
vendedor que la guía no existe cuando lo caído es Olva arma un reclamo falso.

### Las piezas

- **`supabase/functions/olva-tracking`** — proxy con las convenciones de la
  casa: CORS + validación + key solo en el servidor, y el error crudo del
  proveedor **solo** a los logs (misma regla que 360pay: ningún texto de
  terceros frente a compradores o vendedores).
- **`src/lib/checkout/services/OlvaTrackingService.ts`** — cliente que nunca
  lanza (mismo contrato que `Pay360Service`): cada fallo dice su etapa
  (`validation` / `config` / `rate_limit` / `upstream` / `network`).
- **`derivePhase()`** — mapea los eventos crudos a la fase canónica del módulo:
  `EN_ORIGEN → EN_TRANSITO → EN_DESTINO → ENTREGADO`. Gana la fase más avanzada
  que aparezca, sin asumir orden ni forma de los eventos. ⚠️ **Heurística
  provisional**: el proveedor elide los `details` en su doc y no hubo guía real
  que mirar; calibrarla con las primeras guías vivas antes de colgarle la
  cobranza automática.

### La key

1. La Edge Function lee el secret **`OLVA_API_KEY`** (`supabase secrets set`);
2. si no está, cae al **Vault** del proyecto vía el RPC `olva_api_key()`
   (sección 21 de `setup-kross.sql`, ejecutable solo por `service_role`). La key
   de prueba ya está cargada ahí: la función anda sin pasos manuales.

La key **jamás** va en el repo ni al frontend. La de prueba viajó por chat al
recibirse → rotarla al pasar a producción (se pide por el WhatsApp del
proveedor, en su web).

### Lo que sigue (el resto del pendiente #4)

1. Persistir guía + año en `order_sessions` cuando Logistics registre el envío.
2. Un job (pg_cron) que consulte las guías activas —60/min alcanza de sobra— y
   refleje la transición en el pedido vía el contrato `MerchantCustomerSession`.
3. Al pasar a `EN_DESTINO`: plantilla WhatsApp de recojo/cobro
   (`send-wa-template`, ya construido) + cola de llamadas del vendedor.
4. La tasa de recojo nativa (`EN_DESTINO` vs `ENTREGADO`) sale gratis de ahí.

## Tracking de envíos Shalom 🟡 · en preparación

Cierra la otra mitad del pendiente #4: la misma capa de consulta que ya existe
para Olva, contra **Shalom API Perú** (`https://shalom-api-peru.com/docs`) — misma
familia de proveedor que Olva API Perú: **independiente, no la API oficial de
Shalom**, con la misma fragilidad y el mismo aislamiento (si aparece API oficial,
cambia el proxy y nada más).

- **Hecho ✅:** plomería de la key, calcada de Olva. La Edge Function leerá el
  secret **`SHALOM_API_KEY`** (`supabase secrets set`) y, si no está, el Vault
  vía el RPC `shalom_api_key()` (sección 22 de `setup-kross.sql`, solo
  `service_role`). La key **jamás** va en el repo, el frontend ni el chat.
- **Falta 🟡:** Edge Function `shalom-tracking` + `ShalomTrackingService` con la
  misma superficie que Olva (`derivePhase` hacia las fases canónicas del §3).
  Bloqueado en confirmar contra la doc del proveedor: base URL, header de auth,
  forma del endpoint de tracking (Shalom identifica el envío por orden de
  servicio + código, no por guía+año como Olva) y forma de la respuesta.
