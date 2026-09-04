# 02 · SMART LOGISTICS — Despacho & Motorizados

> **Objetivo:** que el producto llegue a la puerta correcta sin llamadas del motorizado
> preguntando *"¿dónde queda su casa?"*. Entregar sin fallos y en tiempo récord.
>
> Leyenda: ✅ construido · 🟡 parcial · 🔮 planeado

## La línea de vida del pedido (26-ago-2026)

Un pedido tiene **dos relojes** y hasta ahora se miraban por separado: el interno (`stage`,
que mueve una persona del equipo) y el del courier (`tracking_phase`, que mueven Shalom y
Olva desde su API). El vendedor no piensa en dos relojes: piensa "¿dónde está el pedido?".

`src/lib/order-tracking.ts` los funde en una sola línea y arma los pasos según **cómo se
entrega**:

| Entrega | Pasos |
|---|---|
| Domicilio | Pedido → *Validando pago* → Confirmado → Preparando → En camino → Entregado |
| Agencia | Pedido → *Validando pago* → Confirmado → Preparando → **Registrado en {courier}** → **En tránsito** → **En agencia de destino** → Entregado |

- *Validando pago* solo aparece si hubo adelanto (misma regla que la barra del comprador).
- Si los dos relojes discrepan **gana el que va más adelante**: que el courier diga
  `EN_TRANSITO` cuando nadie marcó "despachado" significa que el paquete salió.
- `no_entregado` no es un paso más: cierra la línea donde haya quedado.

Está cubierto con tests (`src/lib/order-tracking.test.ts`).

### Pedidos en vivo — el país entero en una pantalla (`/vendedor/mapa`)

Todos los pedidos por agencia de la tienda, moviéndose sobre el Perú. Es la pantalla que se
comparte: un dueño de tienda mirando sus cajas cruzar el país.

Qué dibuja, y de dónde sale cada cosa — **todo del repo, sin proveedor de mapas**:

| Capa | Fuente |
|---|---|
| Silueta del país | `src/data/coverage/peru-outline.json` — Natural Earth 1:50m, dominio público, simplificado a ~2 km (`scripts/build-peru-outline.mjs`) |
| Líneas de provincia y departamento | `src/data/coverage/region-cells.json` — Voronoi sobre los centroides (`scripts/build-regions.mjs`). **Aproximadas**: no son los límites del INEI |
| Red de sedes | Las 902 sedes con coordenadas de Shalom y Olva |
| Línea de cada pedido | Sede de origen (`products.shalom_origin_branch_id`) → sede de destino (`agency_branch_id`) |
| La cajita | Posición = las tres paradas que el courier sí reporta (salió / en camino / llegó). Relleno = cómo va el dinero |

**El relleno de la caja** (`src/lib/live-map.ts`, con tests): lima = pagado completo; mitad
lima / mitad gris = adelanto **cruzado** y saldo contraentrega; gris = todavía sin pago
verificado. "Verificado" es `payment_verification === 'MATCHED'`: un adelanto declarado que
360pay no cruzó no es plata que entró, y pintarlo de lima sería mentirle al vendedor sobre
su propia caja.

**Lo que NO es:** posiciones GPS. Los couriers no dan la ubicación del camión — dan tres
estados. La caja se mueve entre esos tres puntos, no simula un recorrido.

**Pendiente de la marca:** los logos de los couriers. Hoy cada sede lleva la inicial; cuando
existan `public/courier-shalom.svg` y `public/courier-olva.svg` se enchufan ahí.

### El mapa del pedido — retirado del chat (27-ago-2026)

`OrderTrackingMap` dibujaba el destino sobre coordenadas reales —la sede de recojo (Shalom y
Olva traen lat/lng de sus 911 locales) o el punto de entrega— con las sedes vecinas alrededor
para dar escala, sin tiles ni llave de proveedor.

**Se borró de la columna del pedido y del repo.** Sin callejero debajo, una cuadrícula con un
punto y *"7 sedes cerca"* no responde ninguna pregunta del vendedor: la dirección exacta de la
agencia ya está escrita dos tarjetas más abajo, y en qué fase va el envío lo dice
`TrackingBar` con texto. Ocupaba el sitio más caro de la columna —lo primero que se ve al
abrir un pedido— para no decir nada.

Lo que se conserva es lo que valía: los **datos**. `AgencyService` tiene lat/lng de las 911
sedes y `address_lat/lng` sigue capturándose. Si algún día entra un proveedor de mapas
(Mapbox, Google, Carto) con su llave y su costo por carga, el basemap tendrá dónde apoyarse —
pero entonces será un mapa que sirve, no una cuadrícula. El componente vive en el historial de
git si hace falta recuperar la proyección.

**En vivo** (`?modo=mapa` en Pedidos) es otra cosa y sigue en pie: ahí el mapa SÍ responde algo
—dónde está la plata que ya salió, todos los pedidos a la vez— y por eso es un modo propio.

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
- **🟡 Generación de guías por API — Shalom y Olva construidos, en ensayo**
  (`shalom-order` · `olva-order`; los dos arrancan apagados por marca, ver sus
  secciones). Reemplaza al pendiente de "etiquetas formateadas" de arriba: la
  guía formal la emite el courier, no la imprimimos nosotros.
- **✅ Tracking por API + cobranza del saldo — Shalom y Olva enteros** (consulta,
  reflejo y disparo de cobranza, con el reflejo compartido en
  `_shared/tracking.ts`; ver § *Tracking de envíos Shalom* y § *Tracking de
  guías Olva*). Decisión validada
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
3. Generador de envíos — **Shalom 🟡** (construido; el payload espera la doc del
   proveedor y cada marca arranca en modo ensayo — ver § *Generador de guías
   Shalom*) · **Olva 🟡** (construido sobre Olva LAT y apagado por decisión:
   la guía nacería en la cuenta del proveedor, no en una de la marca — ver
   § *Registro de envíos Olva*).
4. Tracking por API con disparo de cobranza al llegar a destino — **Shalom ✅**
   (ciclo completo, ver § *Tracking de envíos Shalom*; y con **dos proveedores
   por si uno cae** desde set-2026 — § *Los dos proveedores de Shalom*) ·
   **Olva ✅** (mismo ciclo, también con **dos proveedores** y —a diferencia de
   antes— con webhook, ver § *Tracking de guías Olva*). Ver §3.
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

- rotula **"Recojo en agencia · SHALOM"** en vez de "Dirección de entrega" y
  muestra **la sede elegida** —nombre, dirección y distrito, resueltos contra el
  mismo catálogo que usó el comprador— en vez del `address` del pedido, que es
  el distrito del COMPRADOR: un pedido de Chaclacayo que se recoge en Huaycán se
  leía como "Chaclacayo, Lima" y mandaba a Logística a la ciudad equivocada. Ese
  dato ya se ve en la ficha del cliente; acá lo que importa es a qué mostrador
  va el paquete (`pickupBranchIdOf`, §27.b);
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

## Tracking de guías Olva ✅ · ciclo completo, con DOS rieles (3-set-2026)

El pendiente #4 (§3) para Olva: registrar la guía, consultarla contra la API,
reflejar la fase en el pedido y disparar la cobranza al llegar a destino. Es el
**mismo ciclo de Shalom** — el reflejo compartido vive en `_shared/tracking.ts`
y ambos couriers lo atraviesan idéntico.

Desde el 3-set-2026 Olva tiene **dos proveedores**, no uno. Ninguno es oficial:
son dos terceros que leen el mismo courier, y por eso fallan en momentos
distintos. Esa es toda la tesis de la contingencia.

| | Riel 1 · Olva API Perú | Riel 2 · **Olva LAT** |
|---|---|---|
| Base | `api.olva-api-peru.com` | `api.olva-api.lat` |
| Auth | `X-API-Key` (`sk_…`) | `x-api-key` (`olva_…`) |
| Costo | 60 req/**min** | cuota **mensual** por plan |
| Tracking | `GET /v1/tracking/{guía}/{año}` | `POST /track` (número a secas) |
| Guía inexistente | `502`, **indistinguible** de Olva caído | **`404` de verdad** |
| Webhook | ❌ no existe | ✅ HMAC, y **suscribirse es gratis** |
| Estado | TEXTOS → heurística provisional | **enum cerrado** de 8 estados |
| Registrar envíos | ❌ | ✅ `POST /account/register` (ver § siguiente) |

**Cómo se reparten el trabajo**, que es lo que decide el costo:

1. **El webhook manda** (`olva-lat-webhook`). Es lo más rápido *y* lo más
   barato: el push llega al instante y ni el webhook ni las suscripciones
   consumen cuota. Cada guía Olva se suscribe al registrarse (`_shared/guia.ts`)
   y el barrido va suscribiendo las que quedaron de antes, 25 por corrida.
   Antes de esto, Olva era el único courier sin push.
2. **El barrido consulta el riel 1** (`olva-tracking-sync`, pg_cron `:15/:45`),
   guía por guía, hasta 50 por corrida, los menos chequeados primero. Su límite
   es por minuto: se pasa solo.
3. **El riel 2 rescata solo lo que el 1 no pudo**, y con tope de 10 por corrida.
   Su cuota es mensual: barrer con él a lo ancho quema el plan en días. Si el
   riel 1 se cae de verdad, lo que sostiene el tracking es el webhook, no la
   consulta.

Y el botón **Actualizar** de la `TrackingBar` recorre los dos en orden
(`olva-tracking`): el riel 1 primero y, si no contesta, el 2. Con eso el chat
**por fin puede decir "esa guía no existe"** cuando de verdad no existe — antes
no podía, porque el `502` del riel 1 significa las dos cosas a la vez.

Lo que **no** cambia: la guía sigue viviendo en el pedido como numero + año de
emisión (YY, `tracking_year`, 23.a) — y **los dos rieles lo usan**. El 1 lo exige
en la ruta; el 2 lo acepta como `orderCode` y, si no se lo mandas, asume el año
en curso: una guía de diciembre consultada en enero volvería como inexistente.

### Quién es el proveedor (y quién no es)

**Ninguno de los dos es Olva.** El riel 1 es **Olva API Perú**
(`https://olva-api-peru.com/docs/`) y el riel 2 es **Olva LAT**
(`https://olva-api.lat`, de Wazend): los dos son proveedores **independientes**,
no la API oficial de Olva Courier, y los dos lo declaran en su propio pie de
página. Misma fragilidad que ya asumimos con `olva.json` (§5, sale de su
buscador público): cualquiera puede cambiar o morir sin aviso.

Eso no es un defecto del diseño: es el diseño. Tener dos terceros leyendo el
mismo courier es lo más parecido a un acuerdo oficial que hay hoy, y la capa
sigue aislada — si mañana existe API oficial de Olva, se enchufa como riel y el
resto del sistema no se entera.

> ⚠️ **Olva LAT y Shalom LAT son del MISMO proveedor** (Wazend): misma forma de
> auth (`x-api-key`), mismos endpoints (`/track`, `/validate`, `/webhooks`,
> `/tracking/subscriptions`, `/account/register`) y dominios hermanos
> (`olva-api.lat` · `shalom-api.lat`). Dos consecuencias que hay que tener
> presentes y que **nadie ha verificado todavía**:
>
> 1. **La cuota podría ser una sola.** Si las dos keys cuelgan de la misma
>    cuenta, el presupuesto de rescate de Olva (10 consultas/corrida) y el de
>    Shalom se comen el mismo plan. Los topes de este repo se calcularon
>    asumiendo cuotas separadas — confirmarlo con el proveedor antes de subir
>    ninguno.
> 2. **La contingencia de los dos couriers cae junta.** Si Wazend se cae, Olva
>    pierde su webhook y su riel 2, y Shalom su contingencia, a la vez. Sigue
>    siendo mejor que antes —los titulares son proveedores distintos y aguantan—
>    pero no son cuatro fallos independientes: son tres.

**Riel 1 · Olva API Perú**

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
su fallo se reporta como `upstream`, nunca como "guía no existe" — decirle al
vendedor que la guía no existe cuando lo caído es Olva arma un reclamo falso.
La última palabra sobre eso la tiene el riel 2, que sí distingue.

**Riel 2 · Olva LAT**

| | |
|---|---|
| Base | `https://api.olva-api.lat` |
| Auth | header `x-api-key` (key `olva_…`) |
| Límite | **cuota mensual** por plan (p. ej. 5.000 consultas) → `429` |
| Gratis (no consumen cuota) | `GET /validate`, `PUT /webhooks`, `POST /tracking/subscriptions` |
| Tracking | `POST /track` `{orderNumber, orderCode}` — `orderCode` es el **año de emisión (YY)**, opcional pero necesario: sin él asume el año en curso · lote: `POST /track/batch`, hasta 50 guías |
| Estados | enum: `REGISTERED · IN_TRANSIT · OUT_FOR_DELIVERY · READY_FOR_PICKUP · DELIVERED · RETURNED · REJECTED · UNKNOWN` |
| Agencias | `GET /agencies` (`department`, `q`) — devuelve `code` PROPIO (`LIM-MIR-01`), horarios y coordenadas |
| Ubicaciones | `GET /locations/departments(/…/provinces/…/districts)` |
| Cuenta | `POST /account/quote` (cotizar) · `GET /account/dni/:dni` · `POST /account/register(-bulk)` |
| Webhook | `X-Olva-Signature: t=…,v1=HMAC-SHA256("<t>.<body>")`, evento `shipment.updated` |

**Cómo se traduce su enum a nuestra fase** (`_shared/olva-lat.ts`), que es lo
que decide cuándo se cobra el saldo:

| Estado | Fase | Por qué |
|---|---|---|
| `REGISTERED` | — | Emitir la guía no es haberla dejado en la agencia. Misma regla que Shalom y que el riel 1: ese hueco es donde se pierde la plata en contraentrega |
| `IN_TRANSIT` | `EN_TRANSITO` | |
| `OUT_FOR_DELIVERY` · `READY_FOR_PICKUP` | `EN_DESTINO` | El paquete ya está en la ciudad destino. Dispara la cobranza |
| `DELIVERED` | `ENTREGADO` | |
| `RETURNED` · `REJECTED` | — | Son finales **malos**, no fases. La fase solo avanza; meterlos ahí sería contar un envío devuelto con el vocabulario de uno que va bien. Salen aparte, como aviso al equipo (una sola vez por pedido) |

`EN_ORIGEN` es el único que **no sale del enum**: el proveedor no tiene un
estado para "el paquete ya está en la agencia de origen" —salta de `REGISTERED`
a `IN_TRANSIT`—, pero sus `detail` en español sí lo dicen. Se lee con la
heurística de textos del riel 1, y **solo para esa fase**: del texto no se
acepta nada más alto, porque para eso ya habló el enum. Una frase como *"en
tránsito hacia la agencia de destino"* no puede poder más que el `IN_TRANSIT`
que el propio proveedor puso — si pudiera, cobraría el saldo con el paquete
todavía viajando.

### Las piezas

- **`supabase/functions/_shared/olva.ts`** — lo específico del courier, PURO
  (sin Deno): la heurística de fase, la validación de guía y el año. Lo
  importan las Edge Functions Y el front (`OlvaTrackingService` re-exporta),
  igual que `pay360.ts`: servidor y chat leen los mismos eventos con las
  mismas reglas.
- **`supabase/functions/olva-tracking`** — proxy con las convenciones de la
  casa: CORS + validación + key solo en el servidor, y el error crudo del
  proveedor **solo** a los logs (misma regla que 360pay: ningún texto de
  terceros frente a compradores o vendedores). Con `session_id`, refleja la
  lectura en el pedido vía `applyTracking` — solo si la guía consultada es la
  registrada ahí.
- **`supabase/functions/olva-tracking-sync`** — el barrido (23.e). Como el 502
  del proveedor no distingue guía inexistente de Olva caído, aquí NO se acusa
  a la guía en el chat (a diferencia del `not_found` explícito de Shalom):
  solo se audita el chequeo y el detalle va a los logs.
- **`order-manage` · `set_tracking` con `courier: 'OLVA'`** — numero (6–15
  dígitos, típicamente 8) + año automático. La guía viaja al comprador por el
  chat con el mismo copy de saldo derivado de Shalom.
- **`src/lib/checkout/services/OlvaTrackingService.ts`** — cliente que nunca
  lanza (mismo contrato que `Pay360Service`): cada fallo dice su etapa
  (`validation` / `config` / `rate_limit` / `upstream` / `network`).
- **`supabase/functions/_shared/olva-lat.ts`** — el riel 2, PURO: su enum de
  estados, la traducción a fase, el parseo del payload y la firma del webhook.
  Lo importan las Edge Functions y `npm test`.
- **`supabase/functions/_shared/olva-lat-api.ts`** — lo que toca red y llaves
  del riel 2: key, `fetch` con etapas, suscripción, `/validate` y el bootstrap
  autónomo del webhook (`ensureLatWebhook`, gemelo del de Shalom).
- **`supabase/functions/olva-lat-webhook`** — el push firmado, con ventana
  anti-replay de 5 min. Deploy con `--no-verify-jwt`. No necesita tabla de
  dedupe: el reflejo es solo-hacia-adelante, así que el mismo evento aplicado
  dos veces no re-avisa ni retrocede (misma razón que `shalom-webhook`).
- **Semáforo en el panel** (`manage-store` · `olva_status` y `olva_lat_status`
  → tarjeta *Rastreo de guías (Olva)* en Marca) — **dos chips, uno por riel**:
  que uno esté vivo no dice nada del otro, y tenerlos separados es el punto de
  la contingencia. El plan B manual solo aparece cuando caen **los dos**. El
  chip del riel 2 sale de `GET /validate`, que es gratis, y por eso el panel
  puede además avisar cuando queda poca cuota — una cuota agotada se ve igual
  que una API caída desde el pedido, pero se arregla en otro sitio. A
  diferencia de Shalom Pro, la tarjeta **no pide credenciales** para rastrear:
  las keys son de la plataforma (Vault, §21 y §37) y no existe cuenta del
  cliente en Olva.
- **`derivePhase()`** — mapea los TEXTOS de los eventos a la fase canónica
  (`EN_ORIGEN → EN_TRANSITO → EN_DESTINO → ENTREGADO`); gana la más avanzada,
  sin asumir orden ni forma. Un texto que solo diga `REGISTRAD` **no** cuenta
  como `EN_ORIGEN`, igual que en Shalom: registrar la guía no es haberla
  entregado. A diferencia de Shalom (hitos explícitos,
  deterministas), Olva da textos. ⚠️ **Heurística provisional**: el proveedor
  elide los `details` en su doc y no hubo guía real que mirar. La cascada ya
  está VIVA sobre ella — vigilar las primeras guías Olva de cerca y calibrar
  contra sus textos reales (deuda anotada en ESTADO-OPERATIVO).

### Las keys

Misma escalera para los dos rieles, y para el secret del webhook:

1. la Edge Function lee el secret de entorno (`OLVA_API_KEY`,
   **`OLVA_LAT_API_KEY`**, `OLVA_LAT_WEBHOOK_SECRET`) — `supabase secrets set`;
2. si no está, cae al **Vault** del proyecto por su RPC (`olva_api_key()`,
   `olva_lat_api_key()`, `olva_lat_webhook_secret()` — secciones 21 y 37 de
   `setup-kross.sql`, ejecutables solo por `service_role`).

Ninguna va en el repo ni al frontend. El secret del webhook del riel 2 **nunca
lo escribe una persona**: lo emite `PUT /webhooks` una sola vez y el bootstrap
lo guarda directo en Vault (`store_olva_lat_webhook_secret`), sin pasar por
ningún chat.

⚠️ La key de prueba del riel 2 **viajó por chat al recibirse** → rotarla antes
de producción y recargar Vault, igual que pasó con la del riel 1. Deuda anotada
en `ESTADO-OPERATIVO.md`.

### Lo que queda

- **Calibrar `derivePhase` del riel 1** con las primeras guías vivas (la deuda
  de arriba). El riel 2 la alivia pero no la cierra: mientras el riel 1 sea el
  que se consulta primero, su heurística sigue decidiendo.
- La **tasa de recojo nativa** (`EN_DESTINO` vs `ENTREGADO`) sale gratis del
  reflejo, para ambos couriers.
- 🔮 **Cotizar el envío** (`POST /account/quote` del riel 2, por ubigeo y peso).
  Es el costo real del flete por pedido, que hoy la marca estima. No se
  construyó todavía porque el costo del envío no entra en ninguna pantalla:
  cuando entre, el endpoint ya está identificado.
- 🔮 **Reemplazar el scraping de `build-olva.mjs`** con `GET /agencies` del riel
  2, que trae código, coordenadas y horario por sede. Misma candidata que ya
  anotaba §5 para el riel 1, ahora con dos fuentes para cotejarla.

## Registro de envíos Olva 🟡 · construido, apagado por decisión (3-set-2026)

**Sí: Olva LAT puede registrar guías, igual que Shalom.** `POST /account/register`
crea el envío y devuelve su número; existe también `register-bulk` para lotes.
El generador está construido entero —`supabase/functions/olva-order`, gemelo de
`shalom-order`— y arranca **apagado por marca**, no por precaución genérica sino
por una razón concreta que se explica abajo.

### Lo que es igual que en Shalom

Lo llama `pay360-webhook` (y `flow-confirm`) apenas el adelanto cuadra,
fire-and-forget: cobrar nunca se cuelga de despachar. Descarta solo los pedidos
que no le tocan, **reclama el pedido con un UPDATE condicional** antes de llamar
a nadie —dos webhooks del mismo pago no registran dos envíos para un paquete— y
al terminar pasa por `_shared/guia.ts`, el mismo camino que la guía escrita a
mano: mensaje al comprador, broadcast, suscripción al webhook. El expediente
vive en `olva_order_status` (`PENDING · CREATED · SIMULADO · SKIPPED · FAILED`),
y `order-manage · retry_olva` reabre un FAILED desde el panel.

### Las tres diferencias, que no son de estilo

**1. La guía nace en la cuenta del PROVEEDOR, no en una de la marca.**
En Shalom cada marca conecta su propio Shalom Pro (§25) y la guía sale a su
nombre. Acá los endpoints de «cuenta» corren sobre el **OAuth2 global de Olva
LAT**: no hay credenciales por cliente, y el remitente es un dato que Kross
manda (`sender`), no una identidad verificada. Quién factura el flete es una
**conversación comercial abierta**, no un campo del payload — y hasta que se
cierre, encender esto para una marca sería tomar esa decisión por ella. Por eso
`stores.olva_auto_guide_enabled` arranca en `false`: con el interruptor apagado
la función corre entera, arma el payload completo y lo deja en el chat de
vendedores **sin registrar nada** (`SIMULADO`). Es el ensayo con un pedido real,
gratis.

**2. No se puede reconciliar, así que NO se reintenta nunca.**
La defensa central de `shalom-order` es preguntar `GET /v1/orders` cuando la
llamada no responde: un timeout no significa que la orden no se creó. Olva LAT
**no publica un endpoint para listar envíos** y tampoco tiene clave de
idempotencia (`esReconciliable === false`, con su test). Sin esa pregunta, un
reintento —incluso de un `5xx`— es una apuesta a pagar dos veces el mismo flete
o a mandar dos paquetes. Así que acá **una llamada y punto**: sin respuesta, el
expediente cierra en `FAILED` y el aviso a Logística pide **verificar en Olva
antes** de registrar otro. Es peor servicio y es a propósito.

**3. No hay clave de retiro.**
Shalom deja elegir el `pickup_code`; en Olva ese campo no existe. El pedido
queda como una guía Olva registrada a mano: el chat entrega la guía y la clave
la coordina una persona.

### El código de agencia: por qué hizo falta una columna nueva

`POST /account/register` pide `agencyCode` de **su** catálogo (`LIM-MIR-01`).
Nuestro `olva.json` guarda el id interno del buscador de Olva (`"579"`): son
llaves distintas del mismo mundo, y no hay forma de convertir una en la otra.

Resolverlo exige saber **dónde queda** la sede — y eso el servidor no lo tenía:
las 911 sedes viven en el front, cargadas diferidas (por eso `delivery-map`
agrupa por id crudo y deja que el panel lo convierta en distrito). Así que el
pedido ahora se lleva la sede **en palabras**: `agency_branch_label` (37.d),
`"NOMBRE · DISTRITO, PROVINCIA, DEPARTAMENTO"`, escrita por el checkout al
registrar. Con eso `olva-order` resuelve el código contra `GET /agencies` — y
**ante duda devuelve `null`**: dos sedes en el mismo distrito sin nombre que las
separe no se adivinan, porque mandar un paquete a la agencia equivocada de la
ciudad correcta es un pedido perdido con tracking normal, que es la peor forma
de perderlo.

Los pedidos anteriores a esa columna no la tienen: esos caen en `SKIPPED` con el
motivo y se despachan a mano, igual que antes.

### Lo que la marca configura

| Dónde | Qué | Por qué |
|---|---|---|
| Productos → el producto → *Envío por agencia (Olva)* | `olva_origin_agency_code` (código de Olva) y `package_weight_kg` | Lo decide la mercadería, no la marca. En Olva la tarifa sale del **peso**, no de un tamaño de catálogo como en Shalom |
| Productos → *Envío por agencia (Shalom)* | `declared_content` | **Se comparte** entre los dos couriers: es el mismo dato, y pedirlo dos veces sería pedir que se contradigan |
| Mi marca → *Rastreo de guías (Olva)* | remitente (nombre, RUC/DNI, celular) e interruptor | El remitente es quien figura impreso en la guía; el interruptor exige JWT verificado, como todo lo que cuesta plata |

## Los dos proveedores de Shalom ✅ · titular y contingencia (03-set-2026)

**Shalom no tiene API oficial.** Nunca la tuvo: las dos que usamos son de
terceros que leen el mismo Shalom —su web pública para rastrear, la cuenta
Shalom Pro de la marca para emitir—. Eso significa que ninguna es "la
verdadera" y que cualquiera puede caerse, cambiar un campo o quedarse sin cupo
sin avisarle a nadie. Con una sola, un proveedor caído era un día sin guías
automáticas y sin fases; con dos, es una línea en los logs.

Desde el 03-set-2026 hay dos, y tienen nombre propio para no volver a
confundirlas:

| | Shalom **PE** — titular | Shalom **LAT** — contingencia |
|---|---|---|
| Base | `https://api.shalom-api-peru.com` | `https://api.shalom-api.lat` |
| Auth | `X-API-Key` | `x-api-key` |
| Rastrear | `GET /v1/tracking?numero=&codigo=` · lote `POST /v1/tracking/batch` con `custom_id` | `POST /track` · lote `POST /track/batch` (**sin** `custom_id`) |
| Emitir | `POST /v1/orders` con las credenciales Shalom Pro en cada request | `POST /account/register` sobre una **instancia** con la sesión persistida |
| Suscribir | `POST /v1/tracking/subscriptions` | `POST /tracking/subscriptions` |
| Webhook | `PUT /v1/webhooks`, firma `t=…,v1=…` | `PUT /webhooks`, firma HMAC (formato **no publicado**) |
| Salud | `GET /healthz`, público | `GET /validate`, con key |
| Guía formal en PDF | ✅ `GET /v1/orders/{ose_id}/voucher` | ❌ no lo expone |
| `ose_id` (id interno de Shalom) | ✅ lo conoce y rastrea con él solo | ❌ no lo maneja |

> **El courier sigue siendo UNO.** `agency_name` y `tracking_courier` valen
> `SHALOM` venga la lectura de donde venga. Qué proveedor contestó es plomería:
> queda en los logs y —cuando emitió una guía— en
> `order_sessions.shalom_order_provider`. El comprador y el vendedor nunca ven
> la diferencia, que es exactamente el punto.

### La regla: titular primero, contingencia si no responde

Se intenta Shalom PE y, **solo si no responde**, Shalom LAT. Nunca al revés y
nunca los dos por gusto: cada request gasta cupo de una key que se paga.

- **No responde** = red caída, timeout, `5xx`, `429`, o llave sin configurar.
- **Responde** = también un `404` (esa guía no existe) o un `4xx` (el payload
  está mal). Ahí **no** se cae a la contingencia: preguntar lo mismo en el otro
  proveedor no cambia la respuesta, solo gasta.

Dónde vive cada pieza:

| Pieza | Archivo |
|---|---|
| Lo específico de LAT, **puro y probado** (fase, payloads, firma, instancias) | `_shared/shalom-lat.ts` · tests en `src/lib/checkout/shalom-lat.test.ts` |
| El router de rastreo (a quién se le pregunta, y el fallback a mitad de corrida) | `_shared/shalom-rastreo.ts` |
| Emitir por la contingencia | `_shared/shalom-lat-emisor.ts` |
| Llaves y bootstrap de webhook de LAT | `_shared/shalom.ts` |

Y lo que **no** cambió, a propósito: el reflejo en el pedido sigue siendo el de
`_shared/tracking.ts`, uno solo para todos los couriers y todos los
proveedores. Si una transición se reflejara distinto según quién la trajo, el
mismo pedido hablaría dos idiomas.

### Qué cubre la contingencia y qué no

- **Rastreo puntual** (el chat) ✅ — `shalom-tracking` prueba PE y cae a LAT.
- **Barrido** (pg_cron, cada 30 min) ✅ — si PE se cae a mitad de la corrida, lo
  que quedaba pendiente se lo lleva LAT. Una corrida puede terminar con lecturas
  de los dos y el pedido no nota nada. Lo que ya leyó el titular **no** se
  vuelve a preguntar.
- **Webhook** ✅ — los dos empujan a la MISMA función `shalom-webhook`. Quién
  firmó lo dice el **secret que valida**, no un campo del cuerpo (que cualquiera
  podría escribir). Un evento sin firma válida rebota.
- **Suscribir la guía** ✅ — `registrarGuia` intenta con PE y, si no pudo, con LAT.
- **Emitir la guía** ✅ — ver abajo.
- **Guías con solo `ose_id`** ❌ — LAT no conoce ese identificador: esas esperan
  al titular. Por eso la emisión guarda siempre `numero`+`codigo` cuando los hay.
- **El PDF de la guía formal** ❌ — lo sirve solo el titular (por `ose_id`). Una
  guía emitida por la contingencia llega al chat **sin el botón** *"Ver mi guía
  de Shalom"*; el mensaje sale igual y la hoja de guía de la app es el respaldo
  de siempre.
- **La fase, cuando LAT no da hitos** 🟡 — el titular marca hitos explícitos
  (`origen/transito/destino/entregado/reparto`) y su mapeo es determinista. LAT
  a veces solo da textos, y ahí se lee como en Olva: por palabras, quedándose
  con la fase más avanzada. Dos reglas que **no** se relajan ni ahí: `registrado`
  nunca es una fase (la guía existe, el paquete puede seguir en el almacén) y
  solo se miran los **valores** de texto, nunca los nombres de campo —un
  `{"entregado": null}` es un hito que NO ocurrió, y leer su clave cerraría el
  pedido solo—. Por eso `shalom-tracking` ahora devuelve también `phase` ya
  resuelta y el front la prefiere.

### Emitir por la contingencia sin pagar dos veces

Es la parte delicada: que el titular no responda **no significa** que no haya
creado la orden (su propia doc lo dice, y no hay clave de idempotencia). La
defensa es que **los dos proveedores operan la MISMA cuenta Shalom Pro**, así
que los envíos pendientes de LAT (`POST /account/pending-shipments`) también ven
lo que emitió PE. El orden de `emitirGuiaLat` sale de ahí:

1. **instancia** — se crea una vez por marca (`POST /instances`) y su id queda
   en `store_secrets.shalom_lat_instance_id`;
2. **sesión** — `POST /instances/status`, y login solo si hace falta (ante la
   duda, login: cuesta menos que una emisión rechazada);
3. **¿ya existe?** — pendientes por DNI. Si está, se registra **esa** y no se
   emite nada;
4. recién ahí `POST /account/register`;
5. si no responde, **se vuelve a mirar los pendientes** antes de dar nada por
   perdido.

> ⚠️ La búsqueda en pendientes es **por DNI** —lo único que los dos proveedores
> nombran igual—, así que un comprador con otro envío pendiente en la cuenta
> puede confundirla. Por eso el paso 3 solo corre cuando el titular pudo haber
> emitido (timeout o `5xx`); cuando ni llegó a llamar (sin llave, catálogo mudo)
> se salta. Y cuando encuentra una, el aviso a Logística lo dice con esas
> palabras: *verifica en pro.shalom.pe que la guía corresponda a este pedido*.

Diferencias del payload que importan al leer el código:

- **El tamaño viaja como TEXTO** (`"PAQUETE XS"`), no como el `product_id` del
  catálogo de la cuenta. Por eso la contingencia puede emitir **aunque
  `GET /v1/products` del titular no responda** — que es uno de los casos de
  caída que cubre.
- **No hay `person_id`**: LAT siempre quiere nombres y apellidos, así que sin
  RENIEC no emite. No se parte `buyer_name` por espacios: registrar mal a
  alguien en la cuenta del cliente no se deshace desde acá.
- **La clave de retiro (`clave`) es la misma** que elige el titular, y se elige
  **antes** de saber quién va a emitir: si el titular alcanzó a crear la guía,
  la clave impresa es esa.
- El **interruptor** manda igual: con `shalom_auto_guide_enabled` apagado no se
  emite por ningún proveedor (el ensayo sale al chat con `SIMULADO`).

### Las llaves y el semáforo

Misma plomería de siempre, duplicada: secret de entorno **`SHALOM_LAT_API_KEY`**
y, si no está, el Vault por el RPC `shalom_lat_api_key()` (sección 22.b de
`setup-kross.sql`, solo `service_role`). El webhook, igual:
`SHALOM_LAT_WEBHOOK_SECRET` / `shalom_lat_webhook_secret()` (24.b), con el
mismo bootstrap autónomo que el titular. **Sin la key, la contingencia
simplemente no existe y todo se comporta como antes** — no hay ninguna ruta que
la exija.

El semáforo del panel (`manage-store` · `shalom_status`) ahora devuelve los dos
por separado y *Marca → Envíos* tiene tres estados en vez de dos:

| Chip | Qué pasó | Qué tiene que hacer el vendedor |
|---|---|---|
| 🟢 **API operativa** | el titular responde | nada |
| 🟡 **API operativa (contingencia)** | el titular está caído, el de repuesto responde | **nada** — las guías se emiten y el rastreo avanza igual |
| 🔴 **API caída** | los dos caídos | el plan B manual de siempre: registrar la guía igual (el barrido la vigila cuando vuelvan), consultar el estado en shalom.pe → Rastrea y avisar por el chat |

## Tracking de envíos Shalom ✅ · ciclo completo

El pendiente #4 **construido entero para Shalom**: consulta, reflejo en el
pedido y disparo de la cobranza. Contra **Shalom API Perú** —de acá en adelante
**Shalom PE**, el titular— (`https://shalom-api-peru.com/docs`), misma familia
de proveedor que Olva API Perú: **independiente, no la API oficial de Shalom**,
con la misma fragilidad y el mismo aislamiento (si aparece API oficial, cambia
el proxy y nada más). Desde set-2026 tiene un suplente: ver
§ *Los dos proveedores de Shalom* — todo lo de esta sección sigue siendo cierto,
y cuando el titular no contesta lo hace el otro con las mismas reglas.

| | |
|---|---|
| Base | `https://api.shalom-api-peru.com` |
| Auth | header `X-API-Key` en todas las rutas |
| Límite | 60 requests/min por key → `429` |
| Tracking | `GET /v1/tracking?numero=…&codigo=…` — por guía exige `numero` (8–10 dígitos) **y** `codigo` (4 alfanuméricos) juntos, o solo `ose_id` (id interno de Shalom). ⚠️ Verificado contra la API real: su doc dice que basta el `numero`, pero el 400 vivo pide ambos. Los tres vienen impresos en el comprobante físico |
| No existe | **`404` de verdad** — a diferencia de Olva API Perú, aquí `not_found` sí es distinguible de proveedor caído |

**Dos niveles de auth, usamos solo el primero.** El "modo estado" (solo
`X-API-Key`) devuelve la línea de tiempo completa del envío — suficiente para
la fase canónica. El "modo detallado" agrega la orden (montos, contenido) pero
exige además credenciales de la cuenta **Shalom Pro** (`X-Shalom-Email/Password`
o sesión efímera `ssk_`), y su **primera llamada hace un login real contra
Shalom (~90 s, hasta 2 min)**. No mandamos credenciales: el modo estado no paga
esa latencia y no obliga a custodiar un password de terceros.

### Las piezas

- **`supabase/functions/shalom-tracking`** — proxy de consulta puntual con las
  convenciones de la casa: CORS + validación + key solo en el servidor, error
  crudo del proveedor solo a los logs.
- **`src/lib/checkout/services/ShalomTrackingService.ts`** — cliente que nunca
  lanza (mismo contrato que Olva/360pay); comparte el tipo `TrackingPhase`.
- **`derivePhase()` es determinista, no heurística.** El proveedor marca hitos
  explícitos (`registrado/origen/transito/destino/entregado/reparto`: objeto
  con fecha, o `null` si no ocurrió); gana el más avanzado. `reparto` (salió a
  puerta) y `destino` (en agencia) son ambos `EN_DESTINO`. **`demora` no es una
  fase**: es una alerta que convive con cualquiera y se expone aparte. Nada que
  calibrar con guías vivas — el contraste que Olva sí necesita.
- **`registrado` tampoco es una fase** (26-ago-2026). El hito existe y se
  ignora a propósito: que la guía esté emitida no dice nada sobre dónde está el
  paquete, que puede seguir en nuestro almacén. Mapearlo a `EN_ORIGEN` —como se
  hacía— borraba el hueco entre *"emití la guía"* y *"la dejé en la agencia"*,
  que es donde se pierde la plata en contraentrega. Sin fase, el pedido espera
  en la columna **Registrado** del tablero (la abre `tracking_numero`, no el
  courier) hasta que llegue `origen`. Ver [`11-RELACIONES.md`](./11-RELACIONES.md).

### El ciclo: registrar → barrer → reflejar → cobrar ✅

1. **Registrar la guía** — acción `set_tracking` de `order-manage`, con UI en
   `TrackingBar` (chat del vendedor, solo pedidos de recojo). Valida como la
   API real: `numero`+`codigo` juntos, o `ose_id`. Al registrarla, la guía le
   llega al comprador por el chat con el saldo **derivado** (a quien pagó el
   total no se le habla de saldo) — con la guía en mano ya puede pagar por la
   app, como manda § *El saldo de agencia*.
2. **Barrer** — `shalom-tracking-sync`, invocada por **pg_cron cada 30 min**
   (sección 23.d de `setup-kross.sql`, vía pg_net con la key anon pública: la
   función no recibe parámetros ni expone datos, solo conteos). Consulta los
   envíos vivos **en lote** (`POST /v1/tracking/batch`, hasta 50 por request,
   errores por ítem con `custom_id` = id de la sesión): una corrida cubre 500
   envíos con 10 requests de los 60/min.
3. **Reflejar** — fase nueva solo **hacia adelante** (un hito que desaparece en
   el proveedor no retrocede el pedido). Cada transición escribe
   `tracking_phase/phase_at`, avisa por broadcast (`tracking_update`) y por
   mensaje del sistema. `demora` avisa solo-vendedores una vez; una guía que el
   courier no encuentra (`not_found` real) avisa solo-vendedores en el primer
   chequeo. **La fase jamás mueve `stage`**: el pipeline lo avanza una persona
   (misma regla que `no_entregado`).
4. **Cobrar** — y la cobranza empieza en `EN_ORIGEN` (01-set-2026): al entrar el
   paquete a la agencia de origen sale el aviso del momento (`mensajeDeOrigen`
   — la pre-guía de Shalom volviéndose oficial, con las palabras que la guía
   prometió) y, si el pedido debe su saldo, **la tarjeta de pago sola**
   (`type: 'cobro'`, la MISMA copy que la del vendedor —
   `_shared/cobro-por-chat.ts`): el saldo se paga por la app mientras el
   paquete viaja, no con el paquete en el mostrador. Condiciones: adelanto
   cruzado, saldo sin cruzar (`saldoOf` cuenta el saldo MATCHED como pagado),
   tienda en `360PAY`, y que nadie haya mandado ya una tarjeta del saldo (el
   vendedor pudo adelantarse a mano). En `EN_DESTINO`: mensaje al comprador con
   el saldo derivado ("por esta misma app, nunca en la agencia; la clave de
   recojo contra el saldo pagado"), aviso solo-vendedores para la llamada (la
   "cola de llamadas" v1 🔮 es este aviso; la cola formal sigue pendiente) y
   **plantilla WhatsApp automática** si la tienda configuró
   `stores.wa_recojo_template` (usa `send-wa-template`; NULL = sin auto-envío).
   En `ENTREGADO`: cierre al comprador + recordatorio de confirmar la entrega
   en el pipeline — de ahí sale la tasa de recojo (`EN_DESTINO` vs
   `ENTREGADO`).

Verificado contra el proveedor real: el batch responde por ítem (guía
inexistente → `not_found` en ese ítem, el resto sigue) y el ciclo entero se
probó con un pedido de prueba (creado y borrado): barrida → `not_found` →
aviso al vendedor → `tracking_checked_at`.

### La key

Misma plomería que Olva: la Edge Function lee el secret **`SHALOM_API_KEY`**
(`supabase secrets set`, ya cargado) y, si no está, el Vault vía el RPC
`shalom_api_key()` (sección 22 de `setup-kross.sql`, solo `service_role`). La
key **jamás** va en el repo, el frontend ni el chat.

### Webhooks del proveedor ✅ · el reflejo instantáneo

El proveedor **empuja** cada transición en vez de esperarla: al registrar la
guía, `set_tracking` suscribe el envío (`POST /v1/tracking/subscriptions`,
best-effort) y `supabase/functions/shalom-webhook` recibe el POST firmado y
aplica el **mismo reflejo** que el barrido — la lógica vive en
`_shared/shalom.ts`, compartida a propósito para que el pedido no hable dos
idiomas según por dónde llegó la noticia. El barrido de 23.d queda de
**respaldo**: cubre cupo lleno (50 suscripciones activas, se liberan solas al
entregar), eventos perdidos y suscripciones expiradas (~21 días → aviso
solo-vendedores: un envío tan viejo sin cerrar es para mirarlo).

- **Auth = firma HMAC del proveedor** (`X-Shalom-Signature: t=…,v1=…`,
  SHA-256 sobre `t + "." + cuerpo crudo`), verificada en tiempo constante con
  ventana anti-replay de 5 min. La función va con `--no-verify-jwt` (como
  `livekit-webhook`). Entrega at-least-once: no hace falta tabla de dedupe —
  el reflejo solo-hacia-adelante vuelve idempotente cualquier reintento.
- **El `signing_secret` jamás pasó por un chat.** El bootstrap es autónomo
  (`ensureWebhook`): el sync detecta que falta, registra la URL en el
  proveedor, el ping de verificación lo responde `shalom-webhook` solo (eco
  del challenge) y el secret viaja del proveedor **directo al Vault** vía el
  RPC `store_shalom_webhook_secret` (sección 24). Verificado en vivo:
  `verified = true` y un evento sin firma rebota con `400`.
- Si el proveedor ya tuviera un webhook de otra URL, el bootstrap **no lo
  pisa**: avisa en logs y se rota a mano (`POST /v1/webhooks/rotate`).

De la familia de **crear pedido** usamos `POST /v1/orders` (ver § *Generador de
guías Shalom*) y **`GET /v1/orders/{ose_id}/voucher`** (01-set-2026): la guía
formal de Shalom en PDF binario, que `shalom-order` descarga al emitir y sube
al bucket `shalom-guias` (§38 del esquema) para el botón *"Ver mi guía de
Shalom"* del chat; si falla, intenta el rótulo (`/label`, mismo contrato).
⚠️ No confundir con `GET /v1/tracking/{ose_id}/voucher`, que su doc declara
**fuera de servicio** (404 para toda orden). Siguen sin usar:
`GET /v1/tracking/{ose_id}/events`, el GRT (exige credenciales Shalom Pro +
`cap_id` del carguero) y la cotización de tarifas.

### Cuenta Shalom Pro por marca + semáforo de la API ✅

Panel → Mi marca → **Envíos de la marca (Shalom Pro)**. Dos cosas viven ahí:

- **Credenciales del cliente** (email + password de pro.shalom.pe), la llave
  de la familia de crear pedido de arriba. Mismo trato que los campos de
  cobro: `manage-store` las acepta **solo por JWT verificado**, van a
  `store_secrets` — también el email, porque `stores` es de SELECT público y
  RLS es por fila — y el password **jamás vuelve al panel**. Al guardar se
  validan **contra pro.shalom.pe de verdad** (`POST /v1/shalom/sessions`), en
  segundo plano porque el primer login tarda ~90 s: el veredicto queda en
  `shalom_pro_status` (`PENDING → CONNECTED / FAILED / UNVERIFIED`, sección
  25 de `setup-kross.sql`) y el panel lo refresca. **El rastreo de fases no
  las necesita** — funciona solo con la API key de la plataforma.
- **Semáforo verde/rojo de la API** (`manage-store` acción `shalom_status`,
  sobre el `/healthz` público del proveedor). En rojo, el panel muestra el
  **plan de contingencia manual**: registrar la guía igual (el barrido la
  vigila solo apenas la API vuelva — el tracking degrada, no se rompe),
  consultar el estado a mano en shalom.pe → Rastrea, y avisar al comprador
  por el chat del pedido.

## Generador de guías Shalom ✅ · el pendiente #3

Un pedido de recojo en agencia **SHALOM** con el adelanto **verificado** pide su
propia guía a la cuenta Shalom Pro de la marca. Antes de esto la guía nacía en
el mostrador y alguien la copiaba a mano en el pedido; ese camino **no se fue**
—es el plan B de todo lo que sigue.

```
register-buyer ──► pay360-webhook ──► shalom-order ──► registrarGuia ──► el ciclo de siempre
  cierra el       adelanto MATCHED     POST /v1/orders   guía al chat      webhook → fases → cobranza
  pedido          (fire-and-forget)    (o ensayo)        (ya suscrita)
```

### Las cuatro defensas (por qué no es un fetch y ya)

Cada llamada exitosa **emite una guía real y cobrable**: el proveedor no tiene
sandbox ni idempotencia. De ahí que el diseño sea casi todo protección:

1. **Candado.** `shalom-order` reclama el pedido con un UPDATE condicional
   (`shalom_order_status IS NULL`) **antes** de llamar a nadie. Dos webhooks del
   mismo pago —360pay emite otro `PAYMENT_PAID` si se corrige el código
   bancario— no pueden emitir dos guías para un paquete.
2. **Interruptor por marca**, apagado por defecto
   (`stores.shalom_auto_guide_enabled`, §27.d). Apagado, la función corre
   entera, arma el envío completo y lo deja en los logs y en el chat de
   vendedores (`status = SIMULADO`) **sin llamar al proveedor**. Es el ensayo
   con un pedido real antes de gastar. Se prende en Panel → Mi marca → Envíos.
3. **Reconciliar antes que reintentar.** Si la llamada no responde, la guía
   **puede haberse creado igual** — la doc del proveedor lo advierte con todas
   sus letras. Antes de dar nada por perdido se le pregunta a `GET /v1/orders`
   si ya existe una guía para ese DNI, y si está, se registra ESA. Es la
   diferencia entre recuperar un envío y cobrarle dos al cliente.
4. **Nunca reintenta a ciegas.** Si ni con eso se resuelve, el pedido queda en
   un estado que el código no vuelve a tomar solo. Reintentar es decisión de una
   persona, con pro.shalom.pe a la vista. El aviso a Logística lo dice con esas
   palabras.

Un caso más, que no es defensa sino cortesía con el cliente: si el destinatario
**ya existe** en la cuenta Shalom Pro, Shalom responde `409`. No se fuerza nada
— se busca su `person_id` (`GET /v1/persons/search`) y se reintenta con él. Ese
reintento sí es seguro: un 409 significa que la orden **no** se creó.

**Y una quinta defensa desde el 03-set-2026: la contingencia.** Cuando el
titular no responde —red caída, `5xx` tras los reintentos, catálogo mudo o
llave sin configurar— la guía se emite por **Shalom LAT** contra la MISMA cuenta
Shalom Pro, mirando primero sus envíos pendientes para no pagar dos veces lo que
el titular quizá alcanzó a crear. Un rechazo `4xx` NO pasa a la contingencia: el
titular respondió, y repetir lo inválido en el otro proveedor no lo vuelve
válido. Detalle completo en § *Los dos proveedores de Shalom*; el expediente
guarda quién emitió en `shalom_order_provider`.

### Lo que hace falta configurar

| Dónde | Qué | Sin eso |
|---|---|---|
| Panel → Mi marca → Envíos | Cuenta Shalom Pro **verificada** (`CONNECTED`) | `SKIPPED` + aviso a Logística |
| Panel → Mi marca → Envíos | Interruptor de guía automática | `SIMULADO` (ensayo, no emite) |
| Panel → Productos → el producto → Envío | **Agencia de origen**, **tamaño** (Sobre · Caja XXS…L · Otra medida) y **contenido declarado** (Artículos / Ropa / Documentos / Electrodomésticos) | `SKIPPED` diciendo qué falta |
| Automático | Sede de recojo del pedido (`agency_branch_id`, §27.b) | `SKIPPED` |
| Plataforma (opcional) | `SHALOM_LAT_API_KEY` — la llave del proveedor de **contingencia** | Nada raro: sin ella el titular caído vuelve a ser una guía a mano, como antes de set-2026 |

La agencia de origen sale del **mismo listado** que ve el comprador
(`src/data/agencies/shalom.json`): un solo catálogo para las dos puntas del
envío. La config es **por producto** y no por marca porque lo decide la
mercadería — dos productos de la misma tienda pueden salir de almacenes
distintos y en cajas de otro tamaño.

### Las piezas

- **`supabase/functions/shalom-order`** — la que orquesta: guardas, candado,
  llamada y cierre del expediente (`shalom_order_status/_id/_at/_reason`, §27.c).
  Es interna **y lo exige**: rechaza con 401 cualquier llamada que no traiga la
  service role key. El gateway de Supabase acepta cualquier JWT del proyecto y
  la anon key es uno —vive en el bundle de la PWA, o sea en el navegador de
  cualquiera—, así que sin esa comprobación un tercero podría disparar la
  emisión de guías, que cuestan plata. La invoca `pay360-webhook`; para
  probarla a mano, el mismo header con la service role key.
- **`_shared/shalom-orders.ts`** — puro, sin Deno ni red: valida, **traduce** a
  los campos del proveedor, genera la clave de retiro, resuelve el `product_id`
  contra el catálogo de la cuenta y lee la respuesta. Único punto que conoce esa
  forma. Se prueba gratis en `npm test` (`src/lib/checkout/shalom-order.test.ts`,
  21 pruebas), que es todo lo que se puede verificar sin emitir una guía.
- **Nombres del destinatario**: si la persona no existe todavía en la cuenta,
  Shalom la registra con lo que le mandemos, así que los apellidos salen de
  **RENIEC** (Decolecta, el mismo proveedor del DNI del checkout) y no de partir
  `buyer_name` por espacios — "Juan Pérez de la Cruz" no se separa en dos, y
  registrar mal a alguien en la cuenta del cliente no se deshace desde acá. Sin
  RENIEC disponible, el pedido queda `SKIPPED` y la guía se hace a mano.
- **`_shared/guia.ts`** — registrar la guía en el pedido, **compartido** con el
  camino manual (`order-manage` · `set_tracking`). Mismo mensaje al comprador y
  misma suscripción al webhook venga de una persona o de la API: si el pedido
  hablara dos idiomas según de dónde salió la guía, la mitad de los envíos
  quedaría fuera de la cascada. Misma razón por la que el reflejo de fases vive
  en `tracking.ts`.

### El contrato, verificado ✅

`POST /v1/orders` con `X-API-Key` (plataforma) **+** las credenciales Shalom Pro
de la marca (`X-Shalom-Email` / `X-Shalom-Password`). Lo que conviene saber sin
abrir el código:

- **El remitente no va en el body.** Shalom lo toma de la cuenta autenticada; un
  `sender` suelto se ignora. Para que la guía salga a nombre de la empresa hace
  falta `shipment_type: "empresarial"` + RUC aprobado en la cuenta — es otro
  producto, con otra tarifa. Hoy no lo usamos.
- **`origin_terminal_id` / `destiny_terminal_id`** son ids de agencia. Son el
  **mismo `ter_id`** que ya guarda `src/data/agencies/shalom.json`: su fuente es
  el CSV de sedes de Shalom, cuya primera columna es literalmente `ter_id` (el
  ejemplo de la doc, `404` → `7`, es Salas Ica → Av. Parra Arequipa en nuestro
  catálogo). Un solo catálogo para las dos puntas del envío.
- **`product_id` no es un tamaño en texto**: es el id del producto *dentro de la
  cuenta del cliente* (Sobre · Caja Paquete XXS…L · Otra Medida) y cambia de
  cuenta en cuenta. Por eso el producto guarda el **tamaño** y el id se resuelve
  al emitir contra `GET /v1/products`.
- **`declaracion_jurada` es obligatorio** (`docs` · `ropa` · `art` · `electro`) y
  Shalom lo imprime en la guía. Sin él: 400.
- **`payer: "sender"`** — paga la marca al despachar. Nunca `receiver`: el saldo
  se cobra por la app, y una guía contra entrega pondría a Shalom a cobrar lo que
  Kross ya cobró.
- **`track: true`** deja la guía suscrita al webhook en la misma llamada, así que
  `registrarGuia` no gasta otra request en suscribirla.
- Respuesta: `{ guia, serie, codigo, ose_id }` — los mismos identificadores con
  los que ya rastrea todo lo demás.

### ⚠️ La clave de retiro (`pickup_code`)

La orden **la elige Kross**, y con ella el destinatario se lleva el paquete de la
agencia: quien la tiene, tiene el pedido. Vive en
`order_sessions.shalom_pickup_code` y sale de ahí por **exactamente dos puertas**
(01-set-2026):

- **Al equipo**, por `get-session`, detrás del candado FUERTE (`puedeLeerInterno`,
  el mismo de los comentarios internos: JWT verificado contra `sellers`). Nunca
  por el `viewer=seller` a secas —se escribe con el token del comprador— y
  **nunca en un mensaje `visibility: 'sellers'`**, que con ese token se lee
  igual. El panel la pinta en la barra del envío, con la advertencia de que al
  cliente le llega sola.
- **Al comprador**, como mensaje del chat (`mensajeDeClave`,
  `_shared/mensaje-de-guia.ts`), **contra el saldo pagado** (§ *El saldo de
  agencia*) — que es justo lo que el checkout viene prometiendo. La sueltan dos:
  `pay360-webhook` cuando cruza el saldo, y `registrarGuia` junto con la guía
  cuando el pedido ya no debía nada (pagó el total, o el saldo cruzó antes que
  una guía manual). La guía registrada **a mano** también entra al circuito
  (01-set-2026): el formulario del panel pide sus TRES datos del comprobante
  físico —nro. de orden, código y clave— y `set_tracking` guarda la clave en el
  pedido; sin ella no hay entrega automática y la manda una persona, como antes.

Shalom rechaza claves repetidas (`1111`…`9999`) y consecutivas (`1234`…`6789`);
el generador también descarta las descendentes — no están en la doc, cuestan 8
códigos de 9000 y una guía rechazada cuesta bastante más.

**Lo que falta para prenderlo** ya no es el contrato: es configurar los productos
de la marca y mirar uno o dos ensayos (`SIMULADO`) antes de mover el interruptor.

### Ensayar un pedido concreto

```
npm run guia:ensayo -- <session_id>
```

`scripts/ensayo-guia.mjs` invoca `shalom-order` contra un pedido real y muestra
el envío armado campo por campo. Con el interruptor de la marca apagado **no
emite nada** — es la forma de ver el payload que recibiría Shalom antes de
gastar una guía, y de saber exactamente qué falta cuando un pedido no aplica.
La llave (`service_role`) va por variable de entorno, nunca por argumento.

Para repetir el ensayo sobre el mismo pedido hay que soltar el candado
(`shalom_order_status = null`): existe justamente para que un pedido no pueda
emitir dos veces.

**Comprobar el estado del pipeline en 3 segundos:**

```
npm run sim:shalom
```

`scripts/sim-shalom-guia.mjs` recorre el pipeline real archivo por archivo,
reporta con `archivo:línea` qué le pide cada paso a Shalom y clasifica cada
llamada (rastrear ≠ crear). Audita el código en vez de repetir esta sección:
detectó solo el día que el generador entró y cambió su veredicto.
