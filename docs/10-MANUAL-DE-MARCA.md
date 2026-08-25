# Kross — Manual de marca
**Versión 2.0 — agosto 2026**

Reemplaza por completo al manual anterior (sistema "taller / sello estampado / naranja
quemado"). Ese sistema queda deprecado: no se usa en producto, web, redes ni material
impreso a partir de esta versión.

---

## 1. Por qué cambia

El manual anterior se construyó para una agencia de automatización con estética de taller:
sello, naranja quemado, lenguaje de oficio. El producto cambió. Kross hoy es un software que
conecta pasarelas de pago y couriers en una sola pantalla, y se vende contra Shopify.

Un comprador que evalúa dónde va a mover su plata y su mercadería necesita leer precisión,
no artesanía. El sistema nuevo es modular, oscuro y sobrio: se parece a una herramienta de
trabajo seria, no a una marca de merch.

Lo único que sobrevive del manual anterior es el nombre.

---

## 2. Posicionamiento

**Qué es:** una app donde una tienda ecommerce peruana gestiona productos, cobros y entregas
en un solo lugar.

**Promesa:** vende, cobra y despacha desde un solo lugar. Hecho para Perú.

**Diferencial:** Shopify opera en Perú pero no conecta Yape, Plin, Izipay, Shalom ni Olva, y
no entiende contraentrega. Kross sí. El diferencial no es ser mejor software, es ser el
software que habla el idioma operativo del mercado peruano.

**Contra qué NO competimos:** no somos una marca de tecnología genérica. Nada de morado neón,
gradientes, ilustraciones 3D ni lenguaje de "revolucionar" o "potenciar".

---

## 3. Marca gráfica

### 3.1 Construcción

La K se construye sobre una grilla de 5×5 módulos. El módulo (`M`) es la unidad de todo el
sistema.

- **Astil:** columna 1 completa, de fila 1 a fila 5.
- **Vértice (la junta):** módulo en columna 2, fila 3.
- **Brazo superior:** módulos en (columna 3, fila 2) y (columna 4, fila 1).
- **Brazo inferior:** módulos en (columna 3, fila 4) y (columna 4, fila 5).

Dimensiones del símbolo: **4M de ancho × 5M de alto.**

La junta es el único módulo en color. Marca el punto exacto donde se cruzan el brazo del pago
y el brazo de la entrega. Ese es el significado de la marca y no se negocia: el color no está
ahí para decorar, está para señalar el cruce.

### 3.2 Código del símbolo

```svg
<svg viewBox="0 0 112 140" xmlns="http://www.w3.org/2000/svg">
  <g fill="#F2F2F0">
    <rect x="0"  y="0"   width="28" height="140"/>
    <rect x="56" y="28"  width="28" height="28"/>
    <rect x="84" y="0"   width="28" height="28"/>
    <rect x="56" y="84"  width="28" height="28"/>
    <rect x="84" y="112" width="28" height="28"/>
  </g>
  <rect x="28" y="56" width="28" height="28" fill="#D4FF4F"/>
</svg>
```

Base: módulo de 28 unidades. Escalar siempre proporcionalmente, nunca deformar.

### 3.3 Variantes autorizadas

| Variante | Fondo | Módulos | Junta | Uso |
|---|---|---|---|---|
| Principal | `#0F1115` | `#F2F2F0` | `#D4FF4F` | App, web, presentaciones, todo lo digital |
| Clara | `#F2F2F0` | `#0F1115` | `#7BA512` | Documentos impresos, facturas, fondos claros |
| Una tinta | Cualquiera | Un solo color | Sin junta | Bordado, sellos, serigrafía, grabado |
| Simplificada | `#0F1115` | `#F2F2F0` | Sin junta | Favicon y cualquier uso bajo 32 px |

**Regla del lima sobre fondo claro:** `#D4FF4F` desaparece sobre blanco. Sobre fondos claros
la junta va en `#7BA512`. Nunca el lima brillante sobre claro.

### 3.4 Lockup horizontal

Símbolo + palabra `KROSS` en mayúsculas.

- Separación entre símbolo y palabra: **1M**.
- Altura de la palabra: igual a **3M** (alineada al centro óptico del símbolo).
- Bajada opcional bajo la palabra, en lima, cuerpo pequeño: `VENDE, COBRA Y DESPACHA`.
- La bajada nunca se usa sin la palabra, ni en tamaños menores a 11 px.

### 3.5 Área de resguardo

Mínimo **1M libre** en los cuatro lados del símbolo o del lockup completo. Nada entra en esa
zona: ni texto, ni bordes, ni otras marcas.

### 3.6 Tamaños mínimos

| Contexto | Mínimo | Versión |
|---|---|---|
| Símbolo en pantalla | 24 px de alto | Simplificada |
| Símbolo impreso | 8 mm de alto | Principal o una tinta |
| Lockup en pantalla | 90 px de ancho | Sin bajada bajo 130 px |

Bajo 32 px la junta se reduce a menos de 3 px y se lee como suciedad. Ahí va la versión
simplificada, sin excepción.

### 3.7 Usos incorrectos

- Rotar, inclinar o deformar el símbolo.
- Cambiar el color de la junta por cualquiera que no sea `#D4FF4F` o `#7BA512`.
- Colorear más de un módulo.
- Poner el símbolo sobre foto sin una superficie sólida u oscura de fondo.
- Aplicar sombra, brillo, degradado o contorno.
- Redondear las esquinas de los módulos.
- Escribir el nombre como "KROSS Club", "Kross Club" o "kross." — el nombre es **Kross**, y
  la palabra en el lockup va en mayúsculas: `KROSS`.

---

## 4. Color

### 4.1 Paleta

| Rol | Hex | Uso |
|---|---|---|
| Ink | `#0F1115` | Fondo base de toda la interfaz |
| Superficie 1 | `#171A1F` | Cards, paneles, filas activas |
| Superficie 2 | `#23262B` | Pills de estado neutro, separadores gruesos |
| Hueso | `#F2F2F0` | Texto principal, módulos del símbolo |
| Texto secundario | `#C7CDD4` | Contenido de tablas, texto de apoyo |
| Texto terciario | `#9BA1A9` | Etiquetas, metadatos, unidades |
| Gris estructural | `#3D444C` | Pines inactivos, bordes, estados vacíos |
| **Lima** | `#D4FF4F` | Acento único (ver reglas abajo) |
| Lima sobre claro | `#7BA512` | Junta y acentos en fondos claros |
| Lima apagado | `#5C6B33` | Tramos pendientes, rutas no recorridas |
| Texto sobre lima | `#2C3A00` | Único color de texto válido sobre `#D4FF4F` |
| Alerta fondo | `#3A2424` | Fondo de estados rechazados |
| Alerta texto | `#F0B2B2` | Texto de estados rechazados |

### 4.2 Reglas del lima

El lima es el activo más frágil de la marca. Se quema si se usa de más.

- **Máximo tres apariciones por pantalla.** Típicamente: la junta del logo, el indicador de
  navegación activa, y un dato de dinero o estado entregado.
- **Significado fijo:** dinero que entró, o entrega completada. Nunca se usa para decorar,
  para botones genéricos ni para títulos.
- **Nunca en superficies grandes.** No fondos, no barras completas, no headers. Bloques
  pequeños.
- **Nunca dos tonos de lima juntos** salvo el par ruta recorrida (`#D4FF4F`) / ruta pendiente
  (`#5C6B33`).

### 4.3 Contraste

Todo texto bajo 13 px va como mínimo en `#9BA1A9` sobre `#0F1115`. Grises más oscuros que ese
no pasan contraste accesible en cuerpos chicos.

---

## 5. Tipografía

**Familia:** Inter (o Inter Tight para titulares). Gratuita, con números tabulares, y su
construcción geométrica calza con la grilla modular del símbolo.

| Uso | Peso | Cuerpo | Tracking |
|---|---|---|---|
| Palabra del lockup | Medium (500) | Variable | +8% |
| Bajada del lockup | Regular (400) | 11–13 px | +12% |
| Titular de pantalla | Medium (500) | 20–28 px | 0 |
| Título de card | Medium (500) | 13–15 px | 0 |
| Cuerpo y tablas | Regular (400) | 12–13 px | 0 |
| Etiquetas y metadatos | Regular (400) | 11 px | +2% |
| Cifras (dinero, conteos) | Medium (500) | 17–20 px | 0, tabular |

**Dos pesos solamente: 400 y 500.** Nada de 600 o 700 — se ven pesados contra el fondo oscuro.

**Mayúsculas solo en el lockup y su bajada.** El resto de la interfaz va en formato oración,
nunca en Formato Título.

**Moneda:** siempre `S/ ` con espacio y separador de miles. Ejemplo: `S/ 8,420`.

---

## 6. Sistema modular en la interfaz

El módulo del símbolo es la unidad de layout. Todo espaciado, grosor de acento y separación es
múltiplo de él.

- **Indicador de navegación activa:** una barra vertical lima de 6×14 px a la izquierda del
  ítem. Es el módulo de la junta escalado — así el logo se vuelve sistema y no adorno.
- **Radios:** 6 px en controles, 8 px en cards, 12 px en contenedores grandes. Los módulos del
  símbolo nunca llevan radio.
- **Bordes:** 0.5 px en `rgba(255,255,255,0.09)`. Un solo grosor en toda la interfaz.

### 6.1 Estados

| Estado | Fondo | Texto |
|---|---|---|
| Entregado / cobrado | `#D4FF4F` | `#2C3A00` |
| En tránsito | `#23262B` | `#C7CDD4` |
| Por despachar | `#23262B` | `#C7CDD4` |
| Rechazado | `#3A2424` | `#F0B2B2` |

Solo dos estados llevan color: el que cierra bien y el que exige acción. Los intermedios son
grises. Si todo tiene color, nada resalta.

### 6.2 Mapas y tracking

- Estilo de mapa oscuro y desaturado. POIs y etiquetas apagados salvo avenidas principales.
- Calles en dos grises apenas separados del fondo: `#1B2027` (secundarias) y `#232A32`
  (principales).
- Ruta recorrida en `#D4FF4F` sólido, 3 px. Tramo pendiente en `#5C6B33` punteado.
- Pin activo: círculo lima de 6.5 px con halo del mismo color al 16%.
- Pines inactivos: `#3D444C`, 3.5 px.

### 6.3 Superficies translúcidas

Las cards flotantes sobre mapa usan vidrio esmerilado:

```css
background: rgba(255, 255, 255, 0.07);
backdrop-filter: blur(16px) saturate(140%);
border: 0.5px solid rgba(255, 255, 255, 0.14);
border-radius: 10px;
```

- El `saturate(140%)` es lo que evita que la card se vea como un rectángulo gris pegado
  encima: recoge algo de color del mapa.
- No subir el relleno arriba de 8%. Más que eso deja de leerse como vidrio.
- **El texto nunca es translúcido.** Cifras y títulos siempre al 100% de opacidad.
- Por rendimiento: el `backdrop-filter` sobre un mapa que se redibuja constantemente castiga
  el framerate en equipos modestos. Aplicarlo solo a cards fijas; la card que sigue al
  vehículo va con fondo sólido `#171A1F` al 92%.

---

## 7. Voz

**Cómo suena:** directo, operativo, peruano sin folclore. Habla de plata, pedidos y entregas
con los nombres que usa el cliente.

- Tuteo, nunca "usted" ni voseo.
- Nombres propios locales sin traducir ni explicar: Yape, Plin, Izipay, Shalom, Olva,
  contraentrega.
- Verbo primero: "Cobra en 3 pasos", no "Cobros simplificados".
- Cifras concretas antes que adjetivos: "27 pedidos en ruta" gana a "visibilidad total".

**Palabras prohibidas:** revolucionar, potenciar, empoderar, solución integral, sinergia,
disruptivo, seamless, unlock, ecosistema.

**Mensajes base:**

- Vende, cobra y despacha desde un solo lugar.
- Hecho para Perú.
- Tus pasarelas y tus couriers en una sola pantalla.

---

## 8. Aplicaciones fuera de pantalla

- **Sticker de packaging:** símbolo en una tinta sobre kraft o negro, 25 mm. Sin lockup, sin
  bajada.
- **Cinta de embalaje:** patrón de módulos repetidos en hueso sobre ink, con una junta lima
  cada cinco repeticiones.
- **Presentaciones:** fondo `#0F1115`, símbolo arriba a la izquierda a 24 px, una idea por
  lámina.
- **Firma de correo:** lockup horizontal a 90 px de ancho, sin bajada, versión clara si el
  cliente usa fondo blanco.

---

## 9. Pendientes

Cosas que este manual todavía no resuelve y hay que cerrar antes de producción:

- Ícono maskable de Android: el área segura circular corta los brazos. Reducir el símbolo al
  60% del canvas.
- Favicon de 16 y 32 px en versión simplificada.
- Set de íconos de interfaz: elegir una familia outline de grosor constante y documentarla.
- Modo claro completo de la aplicación, si se decide ofrecerlo.
- Registro del nombre y del símbolo en Indecopi.

---

## 10. Aplicación en este repo

Dónde vive cada regla, para no volver a decidirlo en cada pantalla.

**Alcance (decidido al adoptar esta versión):** el **panel del vendedor es Kross** —ink y
lima, es la herramienta que Kross vende—. Lo que ve el **comprador** (tienda, checkout, chat
del pedido, tracking) sigue pintándose con el color de **cada marca**: eso es el white-label
y no se toca. Por eso `--brand` es derivado y nadie lo escribe a mano:
`var(--store-brand, lima)`, y dentro del panel (`[data-theme]`) siempre gana el lima.

| Regla del manual | Dónde vive |
|---|---|
| §3 Símbolo, variantes y lockup | `src/components/KrossLogo.tsx` (`KrossIcon`, `KrossLockup`) |
| §3.6 Bajo 32 px va la simplificada | El propio `KrossIcon`: apaga la junta solo, no hay que acordarse |
| Firma del panel (marca operada) | `src/components/BrandMark.tsx` |
| §4 Paleta | `src/index.css`, tokens `--k-*`; los componentes usan los semánticos (`--surface`, `--text`, `--border`, `--ok-*`…) |
| §4.2 Reserva del lima | El acento genérico del panel es gris (`--brand-tint` → superficie 2); el lima queda en la junta, el indicador de nav y lo entregado/cobrado |
| §5 Tipografía | Inter y los dos pesos, en `index.css` bajo `[data-theme]`. Las clases `font-black`/`font-bold` heredadas se remapean a 500 en vez de reescribir cientos de `className` |
| §6 Radios y bordes | Mismo sitio: remapeo de `rounded-*` a 6/8/12 y de los bordes a 0.5 px |
| §6 Indicador de nav activa | Barra lima de 6×14 en `SideNav` (y tumbada, 14×6, en `BottomNav`) |
| §6.1 Estados | `src/lib/order-chips.ts` — un solo lugar para Chats, CRM, Stats y el detalle del pedido |
| Tema | `src/lib/theme.ts`: oscuro por defecto (§4 describe una interfaz oscura); el claro es la variante clara de §3.3 |
| Iconos | `public/favicon.svg` (simplificada), `icon-192/512.png`, `icon-maskable-512.png` (símbolo al 60%), servidos por `api/manifest.js` |

### 10.1 Lo que esta versión deja abierto

- **Acentos por pantalla.** Chats, el detalle del pedido, CRM y Stats ya siguen §4.2. Las
  demás (Productos, Equipo, Marca, Clientes, Retención, Llamadas, Bot IA) heredaron el lima
  donde antes había color de marca, incluidos botones genéricos que §4.2 prohíbe. Falta el
  barrido pantalla por pantalla.
- **`ChatView`** (el chat dentro del panel) conserva el amarillo del sistema viejo.
- **Web pública** (`/servicios`, legales): comparte plantilla con las marcas, así que quedó
  clara. Falta decidir la versión Kross en ink para `krossclub.app`.
- **Mapas y tracking (§6.2)** y **vidrio esmerilado (§6.3)**: no hay implementación todavía.
- **Excepción anotada:** §4.2 pide máximo tres apariciones de lima por pantalla. En una lista
  de pedidos, cada entregado pinta su chip: son varias apariciones del *mismo* significado.
  Se aceptó para listas; en pantallas de detalle la regla se cumple tal cual.
- **El punto de "en línea"** quedó en hueso, no en lima: presencia no es dinero ni entrega.
- Siguen abiertos los pendientes de §9 (íconos de interfaz, favicon 16/32 rasterizado,
  modo claro completo, Indecopi).
