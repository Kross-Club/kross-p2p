# 04 · La web pública (propuesta de valor + cumplimiento)

> Qué dice la web de `krossclub.app`, cómo está pintada, qué exige la pasarela de
> pago para habilitar las API, dónde se cumple cada requisito en este repo y qué
> falta llenar antes de mandar la web a revisión.
>
> Estado: ✅ construido · 🟡 pendiente de datos reales · 🔮 fuera del código

---

## Por qué existe esta web

`krossclub.app` era, para cualquiera de fuera, una pantalla de login. Sin sesión
redirigía a `/acceso`, que en el dominio de la plataforma solo sabe decir *"esta
página es de cada marca"*. Quien entraba —un cliente nuevo o el revisor de una
pasarela— no encontraba qué se vende, a cuánto, ni cómo contactarnos.

Ahora `/` en el host de la plataforma es una **web pública**: catálogo con
precios, carrito, contacto y las páginas legales. En los subdominios de marca
(`marca.krossclub.app`) nada cambia: sin sesión sigue yendo al acceso del
comprador. Las páginas legales, en cambio, viven en **los dos** dominios, porque
el comprador de una marca también tiene derecho a reclamar donde compró.

---

## Qué dice la web (rediseño de ago-2026) ✅

**Titular: «La tecnología de tu tienda».** Es la bajada del lockup y ahora también el
posicionamiento: Kross es la infraestructura de una tienda peruana, no un marketplace ni un
"software de contraentrega".

**Por qué se cayó lo de contraentrega.** *Contraentrega* significa, para cualquiera que venda
en Perú, que **todo** el dinero se cobra en la puerta. El producto dejó de hacer eso: el
checkout cobra **la mitad del pedido o el total** dentro del mismo formulario, con Yape, y el
pago se da por cobrado solo (cupón de la pasarela → deep link de Yape → webhook firmado que
cruza con el pedido). Contra entrega queda, como mucho, el **saldo**. Seguir diciendo COD
vendía justo el problema que resolvemos, así que la portada lo enfrenta de cara con la
sección «Esto ya no es contraentrega».

**Dónde vive el copy.** En [`src/config/propuesta.ts`](../src/config/propuesta.ts): titular,
cifras, pilares, la comparativa contraentrega/Kross, los cuatro pasos del cobro y las
garantías. La portada, el catálogo y `/servicios` leen de ahí — un solo archivo para que el
mensaje no se desincronice entre páginas. Regla del archivo: **toda cifra tiene que poder
señalarse en el producto o en la base** (hoy: `ADVANCE_HALF_SHARE = 0.5` y los 6.6 s del
primer cobro real del 21-ago-2026, en `ESTADO-OPERATIVO.md`).

**Estructura de la portada:** hero con las tres cifras → «Esto ya no es contraentrega»
(comparativa) → «Cómo entra la plata» (los 4 pasos + qué sostiene la promesa) → los cuatro
pilares (cobra, vende, despacha, retiene) → white-label → catálogo con precios → cómo se
contrata + aviso de SSL → contacto. Los dos requisitos de la pasarela que vivían en la
portada vieja —el catálogo con precios y el proceso de compra— siguen ahí, más abajo.

### Cómo está pintada: dos tonos

El manual de marca v2.0 pedía la versión Kross en ink para `krossclub.app` (§10.1) y esto la
cierra. `PublicLayout` decide el tono:

| Dónde | Tono | Cómo |
|---|---|---|
| `krossclub.app` (todo el sitio) | **Ink de Kross** | `useKrossTheme()` pone `data-theme="dark"`, y el tema del manual traduce superficies, rampa de grises, radios, bordes y pesos sin tocar clases |
| `marca.krossclub.app` (páginas legales) | **Claro, de la marca** | Las legales pasan `tono="legal"`: fuera del host de la plataforma no se aplica `data-theme` y siguen como antes |

Lo que sostiene eso en CSS (`src/index.css`, bloque «Web pública»):

- `:root:not([data-theme]) .web-publica` da los tokens semánticos (`--surface`, `--text`,
  `--border`, `--invert`…) al tono de marca. Antes solo existían dentro del panel, así que
  las páginas públicas se podían escribir una sola vez en tokens.
- `.k-cta` es **el** botón principal del sitio: en tono de marca conserva el oscuro de la
  tienda; en ink se invierte a hueso con texto ink. El lima no entra a botones (§4.2).
- `.k-nav-activo` es el indicador de navegación del §6, tumbado (14×6).

Las portadas del catálogo (`public/catalogo/*.svg`) también se rehicieron en ink y se generan
con `npm run build:portadas` ([`scripts/build-portadas.mjs`](../scripts/build-portadas.mjs)):
una sola aparición de lima por portada, sin degradados y sin texto. No se editan a mano.

### Deuda anotada

- **Los metadatos de `index.html` son estáticos y describen a Kross.** El archivo lo sirve
  también cada subdominio de marca, así que la vista previa de un enlace compartido de
  `marca.krossclub.app` sale con el título y la descripción de Kross. El manifest sí es por
  marca (`api/manifest.js` lee el Host); para los metadatos haría falta el mismo truco o SSR.
- El **lockup del header es Kross también en las legales de una marca**, como antes del
  rediseño. Si algún día se quiere marca blanca completa ahí, se resuelve en `PublicLayout`.

---

## Mapa de requisitos

### Información general obligatoria

| Requisito | Estado | Dónde |
|---|---|---|
| Decir con claridad qué productos/servicios ofrece el comercio | ✅ | `src/pages/publico/HomePage.tsx` (hero + "Qué hace Kross por tu tienda"), con el copy en `src/config/propuesta.ts` |
| Datos de contacto: número, correo, dirección | 🟡 | `src/config/empresa.ts` → pie de página, `/contacto` y home |
| Iconos de redes que lleven a las cuentas reales | 🟡 | `EMPRESA.redes` en `src/config/empresa.ts`; se pintan en el pie y en `/contacto` |

Los iconos de redes **solo aparecen si hay cuentas cargadas**. Un icono que no
lleva a ningún lado es observación directa; preferimos no pintarlo.

### Información legal obligatoria

| Requisito | Estado | Dónde |
|---|---|---|
| Términos y condiciones | ✅ | `/terminos` → `src/pages/legal/TerminosPage.tsx` |
| Política de cambios y/o devoluciones | ✅ | `/cambios-y-devoluciones` → `src/pages/legal/CambiosDevolucionesPage.tsx` |
| Política de privacidad | ✅ | `/privacidad` → `src/pages/PrivacidadPage.tsx` |
| Libro de Reclamaciones **integrado**, sin formularios ni archivos externos | ✅ | `/libro-de-reclamaciones` → `src/pages/legal/LibroReclamacionesPage.tsx` |

Los cuatro enlaces están en el pie de **todas** las páginas públicas
(`PublicLayout`), más el aviso del Libro de Reclamaciones.

### Productos y servicios

| Requisito | Estado | Dónde |
|---|---|---|
| Mínimo 5 productos (o los que corresponda si son servicios) | ✅ | 6 ítems en `src/config/catalogo.ts` |
| Cada uno con foto, descripción clara y precio visible | ✅ | Tarjeta (`TarjetaServicio`) y detalle (`/servicios/:slug`) |

Las portadas son SVG en `public/catalogo/`: cargan siempre, no dependen de un
host externo y se pueden reemplazar por fotos reales cambiando la ruta de
`imagen` en el catálogo. Las genera `npm run build:portadas`.

El texto de cada ítem se reescribió con el rediseño: el **cobro del adelanto con Yape
validado solo** está en el plan de entrada, porque es el producto y no un extra. Los precios
**no se tocaron**: son oferta al público y siguen pendientes de confirmación comercial (ver
más abajo).

### Proceso de compra

| Requisito | Estado | Dónde |
|---|---|---|
| Carrito de compras o botón Comprar | ✅ | Botón en cada tarjeta → `/carrito` → `/pago` (`src/lib/carrito.tsx`) |
| Credenciales de prueba si el flujo pide acceso | ✅ no aplica | Comprar no exige cuenta: el carrito vive en `localStorage` y el pedido se cierra con los datos de facturación |

El pedido queda en `web_orders` con un código correlativo (`KR-AAAA-NNNNNN`) que
se le muestra al cliente.

### Seguridad

| Requisito | Estado | Dónde |
|---|---|---|
| SSL en **todas** las URLs | ✅ | Vercel emite y renueva el certificado del dominio y sus subdominios; `vercel.json` añade HSTS (`Strict-Transport-Security`) para que ni siquiera se intente http |
| App publicada en App Store / Google Play | 🔮 | Kross es una PWA instalable; no hay build nativa. Es un requisito "adicional" de la pasarela, no bloqueante |

---

## Libro de Reclamaciones — cómo está hecho

Base legal: Ley 29571 (Código de Protección y Defensa del Consumidor), art. 24 y
D.S. N° 011-2011-PCM con sus modificatorias.

- **Formulario propio**, dentro de la app. Nada de Google Forms, PDF ni enlaces a
  otro dominio: eso es justo lo que la pasarela observa.
- **Campos obligatorios** de la Hoja de Reclamación: correlativo y fecha,
  identificación del consumidor (nombre, documento, domicilio, teléfono, correo,
  y apoderado si es menor de edad), identificación del bien contratado (producto
  o servicio, descripción, monto reclamado) y el detalle con el pedido del
  consumidor.
- **Reclamo vs. queja** definidos en pantalla, como manda la norma.
- **Copia para el consumidor**: al enviar se muestra la hoja completa con su
  número correlativo y un botón para imprimirla o guardarla en PDF (`@media
  print` en `src/index.css` deja solo el documento).
- **Plazo de respuesta**: 15 días hábiles, indicado en la hoja y en los términos.
- **Dónde queda**: tabla `complaints`, escrita por la Edge Function
  `libro-reclamaciones`. RLS activo y sin políticas públicas: solo service role.
- En un subdominio de marca la hoja registra `store_id` y `store_nombre`, para
  que cada marca vea los suyos.

### Copia por correo (opcional)

`libro-reclamaciones` envía la copia al consumidor **si** están configurados los
secrets `RESEND_API_KEY` y `RECLAMOS_FROM` (opcionalmente `RECLAMOS_TO` para la
copia interna). Sin ellos es un no-op silencioso, igual que el fallback de
WhatsApp: perder el reclamo porque falló un correo sería exactamente al revés de
lo que la norma protege. La hoja imprimible siempre está disponible.

```
supabase secrets set RESEND_API_KEY=… RECLAMOS_FROM="Kross <reclamos@krossclub.app>" \
  --project-ref ofdjghntvmrdfjhazfvz
```

---

## Qué falta llenar antes de la revisión

1. **`src/config/empresa.ts`** — cargados teléfono/WhatsApp
   (+51 925 951 393), correo (`equipo@kross.club`), Instagram, RUC
   (`10482968622`) y domicilio fiscal. Falta **el nombre del titular**, tal
   como figura en SUNAT: el RUC empieza en 10, o sea persona natural con
   negocio, así que no hay razón social sino nombres y apellidos. Es
   obligatorio en la Hoja de Reclamación. En desarrollo, un aviso en pantalla
   lista lo que falta; `src/config/empresa.test.ts` valida el resto (dígito
   verificador del RUC, formato del móvil, correos y URLs de redes).
2. **`src/config/catalogo.ts`** — los precios publicados son la lista de
   referencia con la que se pasa la revisión. Antes de que la web reciba
   compras reales hay que confirmarlos: lo que se muestra ahí es oferta al
   público.
3. **Base de datos** — correr **solo la sección 15** de
   `supabase/setup-kross.sql` (crea `web_orders`, `complaints` y sus
   correlativos):

   ```bash
   sed -n '/─── 15\. WEB PÚBLICA/,$p' supabase/setup-kross.sql
   ```

   > ⚠️ **Ojo con el archivo completo.** El bloque 14 recrea
   > `order_sessions_stage_check` **sin** la etapa `no_entregado` y el bloque
   > 17 la vuelve a añadir. Correrlo entero, entonces: sin ningún pedido en
   > `no_entregado` termina bien (manda el 17, que va después); con alguno, el
   > bloque 14 falla al validar las filas existentes y el editor de Supabase
   > deshace todo. Ninguno de los dos es una sorpresa silenciosa, pero el `sed`
   > de arriba sigue siendo lo barato: imprime la sección 15 y todo lo que le
   > sigue (16-18 — cobro con la pasarela, `no_entregado` y la unicidad de `buyers`),
   > idempotente y ya aplicado en producción.
4. **Edge Functions**:
   ```
   supabase functions deploy web-order            --project-ref ofdjghntvmrdfjhazfvz
   supabase functions deploy libro-reclamaciones  --project-ref ofdjghntvmrdfjhazfvz
   ```

## Ojo: hay dos cobros distintos con la pasarela

No confundirlos, porque viven en sitios distintos:

| | Qué cobra | Dónde |
|---|---|---|
| **Adelanto COD** | El adelanto del pedido de un comprador, con Yape | `pay360-coupon` / `pay360-webhook`, en el checkout de las marcas. En producción y **con pago real cobrado**: se emite un cupón por el adelanto y el comprador lo paga con un botón que abre Yape. No hace falta acreditación PCI — nunca tocamos credenciales de pago. Ver [`06-360PAY.md`](./06-360PAY.md) |
| **Suscripción de la plataforma** | El plan que una marca le compra a Kross en `krossclub.app` | `/pago` → `web-order`. **Todavía no cobra** |

## Cuando lleguen las llaves de la pasarela

`/pago` hoy **registra** el pedido; no cobra. Al conectar la pasarela:

- El importe a cobrar se calcula **en el servidor**, a partir de `items`.
  `web_orders.total_mostrado` es lo que dijo el navegador y sirve solo para
  detectar diferencias: un navegador puede decir lo que quiera.
- La llave secreta va como secret de la Edge Function, nunca en el bundle. En el
  front solo entra la llave pública.
