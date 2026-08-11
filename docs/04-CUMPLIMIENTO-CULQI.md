# 04 · Cumplimiento de la web pública (Culqi / INDECOPI)

> Qué exige la pasarela de pago para habilitar las API, dónde se cumple cada
> requisito en este repo y qué falta llenar antes de mandar la web a revisión.
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

## Mapa de requisitos

### Información general obligatoria

| Requisito | Estado | Dónde |
|---|---|---|
| Decir con claridad qué productos/servicios ofrece el comercio | ✅ | `src/pages/publico/HomePage.tsx` (hero + "Qué hacemos por tu marca") |
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
`imagen` en el catálogo.

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
| App publicada en App Store / Google Play | 🔮 | Kross es una PWA instalable; no hay build nativa. Es un requisito "adicional" de Culqi, no bloqueante |

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

1. **`src/config/empresa.ts`** — ya están cargados teléfono/WhatsApp
   (+51 925 951 393), correo (`equipo@kross.club`) e Instagram. Siguen vacíos
   **razón social, RUC y domicilio fiscal**, a propósito: un RUC inventado en
   una página legal es peor que no tenerla. Los tres son obligatorios en la
   Hoja de Reclamación, y la dirección es además requisito de Culqi. En
   desarrollo, un aviso en pantalla lista lo que falta.
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

   > ⚠️ **No correr el archivo completo contra producción.** El archivo es
   > idempotente contra sí mismo, pero producción ya tiene cambios que aún no
   > están en `main` (el cobro con Culqi del adelanto). En concreto, la
   > sección 14 recrea `order_sessions_stage_check` **sin** la etapa
   > `no_entregado`, que producción sí tiene: correrlo entero la borraría del
   > CHECK y rompería los pedidos no entregados. Mientras `main` no alcance a
   > producción, se corren solo los bloques nuevos.
4. **Edge Functions**:
   ```
   supabase functions deploy web-order            --project-ref ofdjghntvmrdfjhazfvz
   supabase functions deploy libro-reclamaciones  --project-ref ofdjghntvmrdfjhazfvz
   ```

## Ojo: hay dos cobros distintos con Culqi

No confundirlos, porque viven en sitios distintos:

| | Qué cobra | Dónde |
|---|---|---|
| **Adelanto COD** | El adelanto del pedido de un comprador, con Yape vía Culqi | `culqi-charge` / `culqi-webhook`, en el checkout de las marcas. Ya desplegado en producción, con su esquema (`stores.culqi_enabled`, `store_secrets.culqi_*`, `order_sessions.payment_provider`…) |
| **Suscripción de la plataforma** | El plan que una marca le compra a Kross en `krossclub.app` | `/pago` → `web-order`. **Todavía no cobra** |

## Cuando lleguen las llaves de Culqi

`/pago` hoy **registra** el pedido; no cobra. Al conectar la pasarela:

- El importe a cobrar se calcula **en el servidor**, a partir de `items`.
  `web_orders.total_mostrado` es lo que dijo el navegador y sirve solo para
  detectar diferencias: un navegador puede decir lo que quiera.
- La llave secreta va como secret de la Edge Function, nunca en el bundle. En el
  front solo entra la llave pública.
