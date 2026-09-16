# Vistas del checkout para Figma

> Generado el 2026-09-16 con `scripts/figma-checkout/` sobre la app real
> (landing → checkout → pago → `/pedido/:token`) corriendo contra un backend de mentira.
> **46 vistas**, una por cada paso y por cada condicional del flujo del comprador.

## Cómo importarlo en Figma

1. **Todo el flujo de una vez:** arrastra `flujo-checkout.svg` al lienzo. Entra como un grupo por
   columna (paso), con cada vista como imagen, su título, la condición que la produce y las flechas
   con la condición de cada transición. Las capas llevan el nombre de la vista (`03b-lima-B-elegir`,
   `Condición · 05d-…`), así que se puede buscar por nombre en el panel de capas.
2. **Una vista suelta:** arrastra el PNG. Está a **2× (780 × H px)**; ponlo a **390 px de ancho**
   (escala 50 %) para que quede al tamaño del celular en que se capturó (390 × 844, iPhone 12/13/14).
   Las vistas cuyo contenido no entraba en 844 px se capturaron con el modal desplegado entero
   (son más altas), para que se vea el paso completo.
3. Las flechas y las cajas de condición del SVG son vectores editables; las pantallas son imágenes
   (no se pueden editar los textos dentro). El SVG pesa lo que pesan las 46 imágenes
   embebidas; si Figma tarda, importa por columna borrando lo que no necesites.

## Qué cubre y qué no

- **Sí:** los 3 pasos del `CheckoutModal`, las dos ramas por región (Lima Metro/Callao vs.
  provincia), domicilio vs. agencia, variante A (la cobertura decide) vs. B (elige el comprador),
  marca con y sin reparto, producto con y sin «mitad», con y sin descuento de salida, tienda con
  Flow y sin cobro en línea, las fases del pago (emitiendo, deeplink de Yape, vuelta de la página
  de Flow, fallo), los errores de validación y la página del pedido en sus variantes.
- **No:** la página de pago de Flow (es de un tercero), la caja de 360pay (dormida desde
  set-2026, `docs/06-360PAY.md`), el chat del pedido `/p/:token` y el panel del vendedor.
- Datos de las capturas: marca «Marca Demo», producto «Sérum de Vitamina C 30 ml» con packs de
  1/2/3 unidades (S/110 · S/189 · S/259), distritos reales (Miraflores, Trujillo, Bagua, Poroy,
  Carhuaz) y las sedes reales de Shalom y Olva.

## Índice de vistas

### Entrada

| Vista | Pantalla | Condición que la produce |
|---|---|---|
| [`00-landing.png`](vistas/00-landing.png) (390×1004) | **Landing del producto** | Entrada al flujo. La barra fija muestra el precio del pack y «¡Lo quiero!» abre el checkout. |
| [`00b-landing-pedido-reciente.png`](vistas/00b-landing-pedido-reciente.png) (390×1004) | **Landing con pedido reciente** | Hay un pedido guardado en este navegador (últimas 24 h): la barra suma «Ver mi pedido» junto a «¡Lo quiero!». |
| [`00c-landing-pago-pendiente.png`](vistas/00c-landing-pago-pendiente.png) (390×1004) | **Landing con pago pendiente** | El pago en línea quedó a medias (advancePending): el botón secundario pasa a «Coordinar el pago de tu pedido» y lleva al chat. |

### Paso 1 · Tu pack

| Vista | Pantalla | Condición que la produce |
|---|---|---|
| [`01-paso1-pack.png`](vistas/01-paso1-pack.png) (390×844) | **Paso 1 · Elige tu pack** | Siempre. El pack recomendado viene preseleccionado (badge «MÁS ELEGIDO»), con el ahorro por unidad y las 6 señales de confianza. El CTA nunca se bloquea aquí. |
| [`01b-paso1-descuento-aplicado.png`](vistas/01b-paso1-descuento-aplicado.png) (390×844) | **Paso 1 · Descuento de salida aplicado** | Aceptó la oferta: vuelve al paso 1 con el banner y el precio tachado en cada pack. El descuento se resta del total y del adelanto. |

### Paso 2 · Tus datos

| Vista | Pantalla | Condición que la produce |
|---|---|---|
| [`02-paso2-inicial.png`](vistas/02-paso2-inicial.png) (390×844) | **Paso 2 · WhatsApp y DNI** | Al entrar solo se piden WhatsApp y DNI. Nombre y distrito se revelan cuando el DNI tiene 8 dígitos. |
| [`02b-paso2-dni-validando.png`](vistas/02b-paso2-dni-validando.png) (390×844) | **Paso 2 · Validando el DNI** | DNI completo → consulta a RENIEC (Decolecta) en curso: «Validando tu DNI…». Nombre y distrito ya aparecen. |
| [`02c-paso2-dni-validado.png`](vistas/02c-paso2-dni-validado.png) (390×844) | **Paso 2 · DNI validado** | RENIEC devolvió el nombre: sello verde y «quien recibe» se rellena solo (nunca pisa lo escrito). |
| [`02d-paso2-dni-no-validado.png`](vistas/02d-paso2-dni-no-validado.png) (390×844) | **Paso 2 · DNI no validado** | RENIEC no lo encontró (o el servicio cayó): «No pudimos validarlo, pero puedes continuar». El nombre queda vacío para escribirlo; nunca se bloquea la venta por un servicio externo. |
| [`02e-paso2-errores.png`](vistas/02e-paso2-errores.png) (390×844) | **Paso 2 · Errores de validación** | Campos con error al tocar el CTA (celular que no empieza en 9, nombre vacío, distrito sin elegir): mensajes que dicen CÓMO arreglarlo, CTA gris y la ayuda «Completa los datos marcados». |
| [`02f-paso2-distrito-buscando.png`](vistas/02f-paso2-distrito-buscando.png) (390×844) | **Paso 2 · Buscando el distrito** | Un solo selector con los 1 874 distritos del país. Badge «Podemos ir a tu casa» solo si la marca reparte en esa región y el distrito tiene cobertura. |

### Rama Lima (Lima Metro y Callao)

| Vista | Pantalla | Condición que la produce |
|---|---|---|
| [`03-lima-A-domicilio.png`](vistas/03-lima-A-domicilio.png) (390×974) | **Lima · Variante A · Domicilio** | Distrito de Lima Metropolitana/Callao + la marca reparte + checkout_ab_mode = A: el método queda en DOMICILIO sin preguntar. Se piden dirección y referencia; el aviso dice cuánto paga ahora. |
| [`03b-lima-B-elegir.png`](vistas/03b-lima-B-elegir.png) (390×844) | **Lima · Variante B · Elegir cómo recibirlo** | checkout_ab_mode = B (o ?checkout=B) y la marca reparte: dos tarjetas, «En mi casa» y «Recojo en agencia». Nada más aparece hasta que elija. |
| [`03c-lima-B-casa.png`](vistas/03c-lima-B-casa.png) (390×1051) | **Lima · Variante B · En mi casa** | Eligió casa: dirección + referencia y el aviso de cuánto paga ahora. |
| [`03d-lima-agencia-cercanas.png`](vistas/03d-lima-agencia-cercanas.png) (390×1356) | **Lima · Recojo en agencia · Puntos cercanos** | Eligió agencia (también en Lima: Shalom y Olva tienen sedes). Los 4 puntos más cercanos al centro del distrito, mezclando couriers; el primero queda preseleccionado. |
| [`03e-lima-agencia-buscar.png`](vistas/03e-lima-agencia-buscar.png) (390×1240) | **Lima · Recojo en agencia · Ver todos** | «Ver todos los puntos de mi zona»: buscador sobre las 911 sedes, con vuelta al ranking de cercanía. |
| [`03f-lima-sin-domicilio.png`](vistas/03f-lima-sin-domicilio.png) (390×1217) | **Lima · Marca sin reparto a domicilio** | home_delivery_enabled = false y sin courier de Lima (§60): el reducer fija AGENCIA al elegir distrito. No hay tarjetas ni badge en la lista; va directo al selector de puntos (también en variante B). |

### Rama Provincia

| Vista | Pantalla | Condición que la produce |
|---|---|---|
| [`04-prov-A-domicilio.png`](vistas/04-prov-A-domicilio.png) (390×1030) | **Provincia · Cobertura IN_ZONE · Variante A** | Distrito fuera de Lima Metro con cobertura del courier (Trujillo): «¡Sí llegamos a tu puerta!» con el plazo del tarifario, dirección + referencia y la salida siempre abierta «Prefiero recoger en una agencia». Aviso naranja con el monto. |
| [`04b-prov-A-agencia-elegida.png`](vistas/04b-prov-A-agencia-elegida.png) (390×1434) | **Provincia · Prefiere recoger** | Desde domicilio tocó «Prefiero recoger en una agencia» (CHOOSE_AGENCY_BRANCH_FLOW): caja morada + puntos cercanos. Como el distrito SÍ tiene cobertura, puede volver con «Prefiero intentar entrega a domicilio». |
| [`04c-prov-sin-cobertura.png`](vistas/04c-prov-sin-cobertura.png) (390×1365) | **Provincia · Sin cobertura (OUT_OF_ZONE)** | El distrito no está en el tarifario del courier: la máquina fija AGENCIA. Caja morada «En tu zona la entrega es en agencia», puntos cercanos y sin enlace para volver a domicilio. |
| [`04d-prov-semanal.png`](vistas/04d-prov-semanal.png) (390×1444) | **Provincia · Zona de visita semanal (BORDERLINE)** | Distrito cubierto pero con entrega 1 vez por semana: el veredicto es BORDERLINE → AGENCIA, con el aviso operativo «el courier pasa una vez por semana». |
| [`04e-prov-B-elegir.png`](vistas/04e-prov-B-elegir.png) (390×896) | **Provincia · IN_ZONE · Variante B · Elegir** | Con cobertura confirmada y variante B, el método lo elige el comprador: dos tarjetas. Sin cobertura no se pregunta (va directo a agencia). El aviso naranja todavía no pone monto. |
| [`04f-prov-B-casa.png`](vistas/04f-prov-B-casa.png) (390×1030) | **Provincia · Variante B · En mi casa** | Eligió casa: «Ok, te lo enviaremos a tu casa» (copy de elección, no de veredicto), plazo, dirección y la salida a agencia. |
| [`04g-prov-B-agencia.png`](vistas/04g-prov-B-agencia.png) (390×1456) | **Provincia · Variante B · Recojo en agencia** | Eligió agencia teniendo cobertura: «Con gusto, te lo dejamos en la agencia que prefieras», puntos cercanos y el enlace para volver a domicilio. |
| [`04i-prov-B-volver.png`](vistas/04i-prov-B-volver.png) (390×844) | **Provincia · Variante B · Volver al paso 2** | Al volver de «Atrás» la rama vuelve a consultar la cobertura y, en variante B, deja el método en blanco: se vuelven a mostrar las dos tarjetas (la dirección escrita se conserva). El aviso naranja pasa a la versión sin monto de «adelanto». |
| [`04h-prov-adelanto-mitad.png`](vistas/04h-prov-adelanto-mitad.png) (390×969) | **Provincia · Aviso con adelanto de la mitad** | Volvió al paso 2 después de elegir la mitad y re-eligió casa: el aviso naranja cambia a «Adelanto de S/…» y «el resto lo pagas al recibir». |

### Paso 3 · Confirmar

| Vista | Pantalla | Condición que la produce |
|---|---|---|
| [`05-paso3-total-domicilio.png`](vistas/05-paso3-total-domicilio.png) (390×844) | **Paso 3 · Paga todo · Domicilio** | Default (§56): se cobra el total. Con Flow activo no se pide nada más: el botón de Yape llega después de «Terminar mi pedido». |
| [`05i-paso3-registrando.png`](vistas/05i-paso3-registrando.png) (390×844) | **Paso 3 · Registrando el pedido** | Submit en vuelo (register-buyer): el botón se bloquea contra el doble tap y «Atrás» desaparece. |
| [`05h-paso3-error-registro.png`](vistas/05h-paso3-error-registro.png) (390×844) | **Paso 3 · Error al registrar** | register-buyer falló (red o servidor): mensaje en rojo y el CTA vuelve a estar disponible. No se borra nada de lo ingresado. |
| [`05b-paso3-total-agencia.png`](vistas/05b-paso3-total-agencia.png) (390×844) | **Paso 3 · Paga todo · Recojo en agencia** | Mismo paso 3 con la copy de recojo: «recoges sin pagar nada más» y la entrega nombra la agencia y el distrito. |
| [`05c-paso3-mitad-opciones.png`](vistas/05c-paso3-mitad-opciones.png) (390×844) | **Paso 3 · El producto permite pagar la mitad** | products.permite_mitad = true: aparece «¿Cuánto quieres pagar ahora?» con Todo (default, con el empujón de puntos) y Mitad. Sin ese flag este bloque no existe. |
| [`05d-paso3-mitad-elegida.png`](vistas/05d-paso3-mitad-elegida.png) (390×844) | **Paso 3 · Eligió la mitad · Domicilio** | advanceChoice = HALF: título «adelanta tu envío», fila «Adelantas ahora» y «Pagas al recibir» con el saldo. |
| [`05e-paso3-mitad-agencia.png`](vistas/05e-paso3-mitad-agencia.png) (390×844) | **Paso 3 · Eligió la mitad · Agencia** | HALF + AGENCIA: la fila dice «Saldo (lo pagas por la app)» — el saldo nunca se paga en el mostrador; pagarlo suelta la clave de recojo. |
| [`05g-paso3-nota-zona.png`](vistas/05g-paso3-nota-zona.png) (390×844) | **Paso 3 · Aviso de zona** | Distrito con entrega solo de lunes a viernes (weekdaysOnly): el paso 3 suma la nota ámbar bajo el resumen. Entrega en provincia a domicilio. |
| [`05f-paso3-sin-cobro-en-linea.png`](vistas/05f-paso3-sin-cobro-en-linea.png) (390×844) | **Paso 3 · Tienda sin cobro en línea** | stores.flow_enabled = false: el paso 3 avisa «Tu pago lo coordinamos por el chat» con el monto. Terminar registra el pedido y va directo a la página del pedido (REGISTERED_MANUAL). |

### Pago (Flow · Yape)

| Vista | Pantalla | Condición que la produce |
|---|---|---|
| [`07-pago-emitiendo.png`](vistas/07-pago-emitiendo.png) (390×844) | **Pago · Creando la orden en Flow** | Pedido registrado y riel FLOW: mientras flow-order responde se anuncia la salida a pagar. Sin pie: no hay botón que repetir. |
| [`07c-pago-yape.png`](vistas/07c-pago-yape.png) (390×844) | **Pago · Botón que abre Yape (deeplink)** | Celular + el servidor sacó el deeplink de Yape: botón «Pagar con Yape», respaldo a la página de Flow, sello de pago seguro y la espera del MATCHED que deja el webhook. |
| [`07b-pago-esperando-al-volver.png`](vistas/07b-pago-esperando-al-volver.png) (390×844) | **Pago · Volvió de la página de pago** | Sin deeplink (o en escritorio) el comprador SALE a la página de Flow; al volver (visibilitychange / bfcache) la misma pantalla pasa a «Esperando tu pago por Yape…» y consulta el pedido cada 3 s. |
| [`07d-pago-fallo.png`](vistas/07d-pago-fallo.png) (390×844) | **Pago · No se pudo generar el pago** | El pedido YA existe pero flow-order falló (ISSUE_FAILED): «Reintentar el pago» o «Prefiero que me escriban para pagar». Único punto con esa salida. |

### Pedido confirmado · /pedido/:token

| Vista | Pantalla | Condición que la produce |
|---|---|---|
| [`08-pedido-confirmado-domicilio.png`](vistas/08-pedido-confirmado-domicilio.png) (390×1157) | **/pedido/:token · Pagado · Domicilio** | El webhook confirmó el pago (MATCHED): navega a la página del pedido. Cabecera con la marca, recorrido (pago recibido + comprobante, boleta pendiente, preparando, en camino, entrega) y el bloque de avisos/app (Android). |
| [`08b-pedido-confirmado-agencia-saldo.png`](vistas/08b-pedido-confirmado-agencia-saldo.png) (390×1219) | **/pedido/:token · Mitad pagada · Agencia** | Adelanto cruzado + recojo en Shalom: recorrido con guía pendiente, «En camino a Shalom», «Llegó a la agencia» con el botón real «Pagar S/… con Yape» (riel en línea + adelanto cruzado) y el recojo con el DNI. |
| [`08c-pedido-pago-pendiente.png`](vistas/08c-pedido-pago-pendiente.png) (390×1027) | **/pedido/:token · Pago pendiente** | Eligió «que me escriban» (GIVE_UP): el pedido se registró con riel FLOW pero sin pago cruzado. Regla dura: nunca se le dice que su pago no existe — «un asesor coordina tu adelanto». |
| [`08d-pedido-coordinar-por-chat.png`](vistas/08d-pedido-coordinar-por-chat.png) (390×1027) | **/pedido/:token · Sin cobro en línea** | Pedido registrado sin riel: «Un asesor te escribe para coordinar tu adelanto». Sin comprobante ni boleta hasta que cruce el pago. |
| [`08e-pedido-confirmado-iphone.png`](vistas/08e-pedido-confirmado-iphone.png) (390×1331) | **/pedido/:token · iPhone** | Mismo pedido pagado visto en iPhone: Safari no da push web, así que el bloque final enseña el video de instalación en vez de «Avisarme por aquí». |

### Salida (X / Esc)

| Vista | Pantalla | Condición que la produce |
|---|---|---|
| [`06-salida-oferta.png`](vistas/06-salida-oferta.png) (390×969) | **Salida · Oferta de descuento** | Tocó la X (o Esc) con datos ingresados, el producto tiene descuento_pen > 0 y aún no se le ofreció: diálogo de retención con el monto como héroe. Una sola vez por checkout. |
| [`06b-salida-confirmar.png`](vistas/06b-salida-confirmar.png) (390×844) | **Salida · Confirmación seca** | Segundo intento de salir (o producto sin descuento): «¿Salir sin terminar?» con el borrador guardado 24 h. Esc = quedarse. |

## Transiciones (las flechas del tablero)

| De | A | Condición | Tipo |
|---|---|---|---|
| `00-landing` | `01-paso1-pack` | «¡Lo quiero!» abre el checkout (bottom-sheet) | avanza |
| `01-paso1-pack` | `02-paso2-inicial` | «Continuar» (el CTA nunca se bloquea en el paso 1) | avanza |
| `02-paso2-inicial` | `02b-paso2-dni-validando` | DNI de 8 dígitos → consulta a RENIEC | avanza |
| `02b-paso2-dni-validando` | `02c-paso2-dni-validado` | RENIEC devolvió nombre → rellena «quien recibe» | avanza |
| `02b-paso2-dni-validando` | `02d-paso2-dni-no-validado` | No encontrado o servicio caído → sigue igual | avanza |
| `02c-paso2-dni-validado` | `02f-paso2-distrito-buscando` | Toca «¿A qué distrito enviamos?» y escribe | avanza |
| `02c-paso2-dni-validado` | `02e-paso2-errores` | Toca «Continuar» con campos inválidos (o los deja vacíos al salir de ellos) | avanza |
| `02f-paso2-distrito-buscando` | `03-lima-A-domicilio` | Distrito de Lima Metro/Callao · la marca reparte · variante A → DOMICILIO fijado solo | avanza |
| `02f-paso2-distrito-buscando` | `03b-lima-B-elegir` | Lima · la marca reparte · variante B → elige el comprador | avanza |
| `02f-paso2-distrito-buscando` | `03f-lima-sin-domicilio` | Lima · home_delivery_enabled = false y sin courier → AGENCIA forzada | avanza |
| `03b-lima-B-elegir` | `03c-lima-B-casa` | «En mi casa» | avanza |
| `03b-lima-B-elegir` | `03d-lima-agencia-cercanas` | «Recojo en agencia» | avanza |
| `03d-lima-agencia-cercanas` | `03e-lima-agencia-buscar` | «Ver todos los puntos de mi zona» | avanza |
| `02f-paso2-distrito-buscando` | `04-prov-A-domicilio` | Provincia · cobertura IN_ZONE · variante A → DOMICILIO | avanza |
| `02f-paso2-distrito-buscando` | `04c-prov-sin-cobertura` | Provincia · OUT_OF_ZONE (o la marca no reparte) → AGENCIA | avanza |
| `02f-paso2-distrito-buscando` | `04d-prov-semanal` | Provincia · zona de visita semanal → BORDERLINE → AGENCIA + aviso | avanza |
| `02f-paso2-distrito-buscando` | `04e-prov-B-elegir` | Provincia · IN_ZONE · variante B → elige el comprador | avanza |
| `04-prov-A-domicilio` | `04b-prov-A-agencia-elegida` | «Prefiero recoger en una agencia» | avanza |
| `04b-prov-A-agencia-elegida` | `04-prov-A-domicilio` | «Prefiero intentar entrega a domicilio» (solo con IN_ZONE) | vuelve |
| `04e-prov-B-elegir` | `04f-prov-B-casa` | «En mi casa» | avanza |
| `04e-prov-B-elegir` | `04g-prov-B-agencia` | «Recojo en agencia» | avanza |
| `05d-paso3-mitad-elegida` | `04i-prov-B-volver` | «Atrás» en variante B: se re-consulta la cobertura y el método queda en blanco | vuelve |
| `04i-prov-B-volver` | `04h-prov-adelanto-mitad` | Re-elige «En mi casa» con la mitad ya elegida | avanza |
| `03-lima-A-domicilio` | `05-paso3-total-domicilio` | «Continuar» · domicilio · paga todo · Flow activo | avanza |
| `03d-lima-agencia-cercanas` | `05b-paso3-total-agencia` | «Continuar» · recojo en agencia (también desde 03f, 04b, 04c, 04d) | avanza |
| `04f-prov-B-casa` | `05c-paso3-mitad-opciones` | «Continuar» · products.permite_mitad = true → aparece el reparto | avanza |
| `04g-prov-B-agencia` | `05e-paso3-mitad-agencia` | «Continuar» · agencia + permite_mitad → «Pago la mitad ahora» | avanza |
| `04-prov-A-domicilio` | `05g-paso3-nota-zona` | «Continuar» · distrito con entrega solo L–V (weekdaysOnly) → nota ámbar | avanza |
| `05c-paso3-mitad-opciones` | `05d-paso3-mitad-elegida` | «Pago la mitad ahora» (domicilio) | avanza |
| `05-paso3-total-domicilio` | `05f-paso3-sin-cobro-en-linea` | Variante: stores.flow_enabled = false → aviso «lo coordinamos por el chat» | variante |
| `05-paso3-total-domicilio` | `05i-paso3-registrando` | «Terminar mi pedido» → register-buyer (idempotente por checkout_id) | avanza |
| `05i-paso3-registrando` | `05h-paso3-error-registro` | register-buyer falla → error y reintento sin perder datos | avanza |
| `05i-paso3-registrando` | `07-pago-emitiendo` | Registro OK · riel FLOW (lo decide el servidor) → flow-order | avanza |
| `05f-paso3-sin-cobro-en-linea` | `08d-pedido-coordinar-por-chat` | «Terminar mi pedido» · sin riel → REGISTERED_MANUAL → /pedido/:token | avanza |
| `07-pago-emitiendo` | `07c-pago-yape` | Celular + el servidor sacó el deeplink de Yape → AWAITING | avanza |
| `07-pago-emitiendo` | `07b-pago-esperando-al-volver` | Sin deeplink (o escritorio): sale a la página de Flow; al volver, espera | avanza |
| `07-pago-emitiendo` | `07d-pago-fallo` | flow-order falla → ISSUE_FAILED | avanza |
| `07d-pago-fallo` | `07-pago-emitiendo` | «Reintentar el pago» (solo desde ISSUE_FAILED) | vuelve |
| `07c-pago-yape` | `08-pedido-confirmado-domicilio` | El webhook cruza el pago (MATCHED) → navega a /pedido/:token | avanza |
| `07b-pago-esperando-al-volver` | `08-pedido-confirmado-domicilio` | MATCHED visto por el sondeo cada 3 s | avanza |
| `07d-pago-fallo` | `08c-pedido-pago-pendiente` | «Prefiero que me escriban para pagar» (GIVE_UP) | avanza |
| `08-pedido-confirmado-domicilio` | `08b-pedido-confirmado-agencia-saldo` | Variante: pagó la mitad + recojo en agencia (saldo por la app, DNI, clave) | variante |
| `08-pedido-confirmado-domicilio` | `08e-pedido-confirmado-iphone` | Variante: iPhone (sin push web → video de instalación) | variante |
| `08-pedido-confirmado-domicilio` | `00b-landing-pedido-reciente` | Vuelve a la landing con el pedido guardado (24 h) | vuelve |
| `07d-pago-fallo` | `00c-landing-pago-pendiente` | Cierra el modal con el pago a medias (advancePending) | vuelve |
| `03-lima-A-domicilio` | `06-salida-oferta` | X o Esc con datos ingresados · descuento_pen > 0 · aún no ofrecido (desde cualquier paso) | avanza |
| `06-salida-oferta` | `06b-salida-confirmar` | Segundo intento de salir (o producto sin descuento) → confirmación seca | avanza |
| `06-salida-oferta` | `01b-paso1-descuento-aplicado` | «Aplicar mi descuento» → vuelve al paso 1 con precios nuevos | vuelve |

## Cómo se regeneran

```bash
# 1) dev server con un Supabase de mentira (las URLs se interceptan en el navegador)
VITE_SUPABASE_URL=https://mock.supabase.local VITE_SUPABASE_ANON_KEY=mock npx vite --port 5173
# 2) capturas + tablero + este README (Playwright con el Chromium del entorno)
node scripts/figma-checkout/run.mjs      # ONLY=lima-A,prov-A … para una parte
node scripts/figma-checkout/board.mjs
node scripts/figma-checkout/readme.mjs
```

Los escenarios están en `run.mjs`; el backend de mentira (producto, tienda, RENIEC,
`register-buyer`, `flow-order`, `get-session`) en `mocks.mjs`; las columnas y flechas del
tablero en `spec.mjs`. Nada de esto toca Supabase ni corre en producción.
