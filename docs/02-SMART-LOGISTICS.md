# 02 · SMART LOGISTICS — Despacho & Motorizados

> **Objetivo:** que el producto llegue a la puerta correcta sin llamadas del motorizado
> preguntando *"¿dónde queda su casa?"*. Entregar sin fallos y en tiempo récord.
>
> Leyenda: ✅ construido · 🟡 parcial · 🔮 planeado

## Componentes

### 1. Geolocalización precisa ✅ / 🔮
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
- Debe setear `delivery.dispatchType = 'AGENCIA_PROVINCIA'` y `delivery.agencyName`.

### 4. Cobertura del courier (Aliclic / Alidriver) ✅ data · 🔮 UI

`src/lib/checkout/services/CoverageService.ts` — única puerta de entrada a la cobertura.

- **Fuente:** KML oficial del courier (`scripts/sources/aliclic-cobertura.kml`) →
  `src/data/coverage/aliclic-zones.json` vía `npm run build:data`.
- **29 ciudades**, 148 anillos (9 de ellos agujeros = zonas excluidas dentro de un área
  cubierta), 3.682 vértices. ~27 KB gzip, en **chunk aparte** (`import()` dinámico).
- **Los polígonos no son binarios.** Cada zona lleva un **recargo** (`ADICIONAL N` = +S/N
  sobre la tarifa base). Se cotejó contra el tarifario oficial y calza: Trujillo base
  S/15.50 y El Porvenir S/15.50–20.50 → delta 5 = capa `TRUJILLO ADICIONAL 5`.
  Ese recargo es **costo de la marca, no del comprador**: se guarda en el pedido para
  medir margen por zona, no se le traslada al cliente.
- `surcharge: null` = la capa dice "ADICIONAL" sin monto (Cusco, Chiclayo, Lima). Hay
  recargo pero se desconoce cuánto; tratarlo como 0 subestimaría el costo.
- **Restricciones operativas** que sí afectan la promesa al comprador: 17 zonas de Cusco y
  7 de Chiclayo son de visita **1 vez por semana** → se degradan a `BORDERLINE` (se ofrece
  agencia). Sullana no entrega después de las 2 pm; Paita tiene horario por volumen.
- **Ciudades piloto:** en Ilo, Moquegua, Talara, Puerto Maldonado y Chincha la zona base
  viene rotulada "PRUEBA" en el mapa. **No es basura** — es la única zona base de esas
  ciudades y cae sobre su centro. Filtrarlas dejaba sin cobertura sus centros.
- **Lima va en modo `DISTRICT`, no `POLYGON`,** aunque el courier tenga polígonos para
  Lima. Es COD sin adelanto: una zona mal estimada la absorbe la marca y no tumba la
  venta. Un mapa obligatorio en el segmento de mayor volumen cambia conversión por
  precisión. El mapa queda disponible pero opcional (`checkout.config.ts → COVERAGE_MODE`).

### 5. Listado de agencias ✅ Shalom · 🔮 Olva

`src/lib/checkout/services/AgencyService.ts` — misma interfaz para ambas agencias.

- **Shalom:** 487 sedes con `lat`/`lng`, distrito, provincia y dirección
  (`src/data/agencies/shalom.json`, ~35 KB gzip en chunk aparte). `getNearest()` ordena
  por haversine. Es la agencia **recomendada por defecto**: menos fricción y menos error
  de datos.
- **Olva:** sin listado. `getNearest()` devuelve `null` — señal explícita de que la UI
  cae a texto libre y marca el pedido para verificación manual. Cuando llegue el listado,
  el cambio es de datos, no de código.
- ⚠️ El CSV original traía las **coordenadas corruptas** (locale español: el punto decimal
  leído como separador de miles, 487 de 488 filas). `scripts/build-agencies.mjs` las
  reconstruye y desambigua con el centroide del departamento. **No editar el JSON a mano:**
  regenerar con `npm run build:data`.
- El teléfono del CSV es el call center (7 valores para 488 sedes), no el de cada sede:
  se omite a propósito.

## Datos que consume/produce (estado central)
- Lee: `customer.phone`, `delivery.lat/lng/addressText`.
- Escribe: `delivery.reference` 🔮, `delivery.dispatchType` 🔮, `delivery.agencyName` 🔮.

## Estándares
- El comprador es la única fuente de verdad de su ubicación; el motorizado NO la edita.
- No re-pedir dirección si ya está `address_verified` (heredar del `buyers`).
- Coordenadas siempre con precisión validada antes de guardar (ver AddressBar).

## Pendientes priorizados
1. 🔮 Pin arrastrable + campo referencia (Fase 2 del refactor de checkout).
2. 🔮 Route-sheet del motorizado (Lima) con cobranza por parada.
3. 🔮 Generador de envíos a provincia (Shalom/Olva).
4. 🔮 Persistir `courier_surcharge` y `coverage_result` en `order_sessions` — es la data
   con la que se negocia cobertura con Aliclic y se mide venta perdida por zona.

## Regenerar la data

```
npm run build:data     # KML + CSV de scripts/sources → JSON en src/data/
npm test               # valida geo, cobertura y agencias contra la data real
```

Las fuentes crudas viven versionadas en `scripts/sources/` para que los generadores sean
reproducibles y auditables. Los JSON de `src/data/` son **generados**: no se editan a mano.
