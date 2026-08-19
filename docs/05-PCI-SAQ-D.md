# 05 · PCI DSS / SAQ-D — el permiso para usar la API directa de Culqi

> Qué exige Culqi para autorizar el cobro por API, qué de eso nos aplica de verdad, y qué
> mandar al buzón de riesgos. Es el detalle del **bloqueo #1** de `ESTADO-OPERATIVO.md`.
>
> **Decisión tomada (13-ago-2026): camino A.** Se acredita y se pide la autorización. No se
> cae a Culqi Checkout ni al cruce por notificación: el primero nos saca al comprador de la
> pantalla en el momento de la verdad, el segundo depende de un APK o un MacroDroid vivo en
> un Android ajeno.

---

## 1. Qué pide Culqi, literal

Página de Yape (Pagos Online → Cargo único → Yape), sección *Usando APIs*:

> *"Recuerda que cuando interactúas directamente con el API necesitas cumplir la normativa
> de **PCI DSS 3.2**. Por ello, te pedimos que llenes el formulario **SAQ-D** y lo envíes al
> buzón de riesgos Culqi."*

Sin esa autorización, `POST secure/tokens/yape` responde `400` **antes de mirar el celular o
el código**, con llaves live correctas:

```json
{"object":"error","type":"authentication_error",
 "merchant_message":"Tu código de comercio no está autorizado para realizar este tipo de
  peticiones. Contáctate con culqi.com/soporte para obtener mas información."}
```

**Dos datos que cambian cómo se pide.**

1. **El requisito no es de Yape.** El mismo párrafo aparece en cargo único, en suscripciones
   y en one-click: es una política transversal a *"la API directa"*. O sea, está escrita
   pensando en **tarjeta**, y a Yape le cae por vivir bajo el mismo techo.
2. **Citan PCI DSS 3.2, una versión retirada.** El PCI SSC jubiló la 3.2.1 en marzo de 2024;
   hoy rige **v4.0.1**. El texto de Culqi es boilerplate viejo — conviene saberlo para no
   llenar el formulario equivocado, y conviene decirlo al preguntar.

### 1.1 · La primera respuesta de soporte, y por qué no se sostiene (14-ago-2026)

Soporte contestó que su equipo técnico validó la plataforma, que **"la integración opera de
manera correcta"**, y que el error se debía a *"enviar peticiones de prueba utilizando las
credenciales/llaves de Producción (Live) en lugar de las de Prueba (Test)"*, con la
recomendación de usar `sk_test_` para probar y `sk_live_` para vender.

**Comprobado y descartado, con evidencia reproducible.** Dos peticiones a
`POST secure/tokens/yape` con la `pk_live` de Gadicaf, el **14-ago-2026 a las 20:28 (hora
Perú) / 01:28 UTC del 15**:

| Sonda | Cuerpo enviado | Respuesta |
|---|---|---|
| **A** | `{"amount":500,"currency_code":"PEN"}` — **sin `number_phone` y sin `otp`** | `400` `authentication_error` · *"Tu código de comercio no está autorizado…"* |
| **B** | lo mismo **+** `number_phone:900000001`, `otp:425251` (los datos de prueba) | **idéntica, byte por byte** |

La sonda A **no contiene un solo dato de prueba** — solo un monto. Aun así devuelve el mismo
error, lo que sitúa el rechazo en la **autorización del comercio, antes de validar el
cuerpo**. Un error causado por mezclar entornos exigiría que la petición llevara datos del
entorno equivocado; la sonda A no lleva ninguno.

Dos cosas más que se leen del propio mensaje:

- **La llave live es válida y está reconocida.** Culqi identifica el comercio y niega *el
  tipo de petición*, no la credencial. Una llave inválida daría otro error.
- **El código nuestro no es la variable.** El mismo camino, con `pk_test_/sk_test_`,
  tokeniza y cobra correctamente. Lo único que cambia entre el caso que funciona y el que no
  es el entorno del código de comercio — que es precisamente lo que hay que autorizar.

> Al responder el ticket, adjunta la **sonda A** tal cual: es la que cierra la puerta a la
> explicación de "datos de prueba", porque no lleva datos. Reproducirla no cuesta nada ni
> cobra a nadie — una tokenización fallida no mueve dinero.

**Lo que la respuesta sí confirma, sin querer:** que por Culqi Checkout el comercio opera
normal. Eso es coherente con el diagnóstico, no contra él — Checkout no exige la
autorización de API directa, y por eso "la plataforma está correcta" y el API sigue cerrado.

## 2. Qué es el SAQ-D de verdad

No es un trámite de una vez. Es el cajón de sastre de los cuestionarios PCI: *"todos los
demás comercios elegibles"*, el que toca cuando no calificas para ninguno de los acotados.
Cubre prácticamente los 12 requisitos completos del estándar, y **lo que cuesta no es
llenarlo sino sostenerlo**:

| Obligación | Cadencia |
|---|---|
| Escaneo de vulnerabilidades externas por un **ASV** certificado (req. 11.3.2) | **Trimestral**, con re-escaneo limpio hasta cerrar todo hallazgo alto y medio |
| Re-atestación (AOC firmada) | Anual |
| Políticas, control de accesos, MFA, gestión de logs, scripts de cliente | Continuas |

Es una carga permanente. Sobre adelantos de **S/5–S/30**.

## 3. Lo que nos aplica de verdad: por el riel Yape no pasa una tarjeta

Aquí está el argumento, y es un argumento de hecho, no de conveniencia. **El alcance de PCI
DSS lo define el dato de cuenta** — el PAN y los datos sensibles de autenticación. Esto es
todo lo que sale de Kross hacia Culqi:

| Paso | Qué mandamos | ¿Dato de tarjeta? |
|---|---|---|
| `POST secure/tokens/yape` (llave pública) | `amount`, `number_phone`, `otp`, metadata | **No** — un celular y un código de aprobación de billetera |
| `POST api/charges` (llave secreta) | `amount`, `currency_code`, `email` sintético, `source_id` = `ype_…` | **No** — un token de billetera |
| Persistencia | `payment_events.raw`, con `source` recortado | **No** |

Nunca un PAN, ni CVV, ni fecha de vencimiento, ni datos de banda. **No usamos el endpoint de
tokenización de tarjeta** (`POST /v2/tokens`), ni hace falta habilitarlo. Y la PWA **no carga
CulqiJS ni ningún script de terceros**: la tokenización es server-to-server desde una Edge
Function, así que ni siquiera aplica el requisito 6.4.3 de scripts de página de pago.

Dicho de otro modo: **no tenemos CDE**. No hay entorno de datos de tarjeta que escanear
porque no hay datos de tarjeta.

> ⚠️ **Esto es un argumento, no un derecho.** Lo decide el área de riesgos de Culqi, y su
> política puede ser transversal a propósito. Se pide con el expediente en la mano y se
> acepta la respuesta que venga — la sección 7 dice qué hacer si insisten.
>
> Y vale para hoy: **el día que Kross cobre con tarjeta, la pregunta vuelve entera.**

## 4. El expediente técnico (esto es lo que se adjunta)

Cada afirmación es verificable en el repo. No hay nada aquí que haya que construir: ya está.

| Control | Cómo está resuelto | Dónde |
|---|---|---|
| **No se almacenan datos de tarjeta** | No entran al sistema. Además `chargeForStorage` recorta `source` del cargo antes de persistir, que es lo único con PII del pagador | `_shared/culqi.ts` |
| **Llaves fuera del navegador** | Las **dos** llaves viven en `store_secrets`; el bundle del front no lleva ninguna, ni la pública | `culqi-charge/index.ts:141-147` |
| **Llaves inaccesibles desde el cliente** | `store_secrets` con RLS activo, `REVOKE ALL` a `anon`/`authenticated` y **sin políticas**: solo entra el service role | `setup-kross.sql:384-392`, `622-629` |
| **Escritura de llaves autenticada** | `manage-store` exige **JWT verificado** para los campos de cobro; son write-only (nunca se devuelven) | `manage-store/index.ts:64-65, 247-253` |
| **TLS en todo el trayecto** | Certificado de Vercel en el dominio y subdominios + **HSTS** `max-age=63072000; includeSubDomains; preload` | `vercel.json` |
| **Cabeceras de seguridad** | `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` | `vercel.json` |
| **Secretos fuera de los logs** | Regla escrita en el módulo: jamás el request, la llave, el celular ni el OTP. Solo el diagnóstico propio de Culqi, con lista de campos cerrada y test que la fija | `_shared/culqi.ts` · `culqi.test.ts` |
| **Autenticación del webhook** | Culqi no firma sus webhooks: el payload es una pista, y la verdad es re-consultar `GET /v2/charges/{id}` con la llave secreta de esa tienda. Un cargo ajeno o forjado da 404 | `culqi-webhook/index.ts` |
| **Integridad del monto** | El monto **jamás** viene del cliente: se re-deriva en el servidor y se contrasta contra la fila | `culqi-charge/index.ts:119-133` |
| **Anti doble cargo** | Claim-lock sobre índice único en `payment_events`; `network_after` no reintenta | `culqi-charge/index.ts:158-192` |
| **Aislamiento multi-tenant** | Llaves y cargos resueltos por `origin_store_id`; el webhook rechaza el cargo de una tienda para el pedido de otra | `culqi-webhook/index.ts:95-99` |
| **Límite de intentos** | 8 por pedido, después lo toma una persona | `culqi-charge/index.ts:46` |

## 5. Qué pedir exactamente

No pidas "que me habiliten Yape" — eso ya lo respondió soporte y por ahí no es. Pide **la
autorización de API con el alcance que nos corresponde**:

1. **Autorizar el código de comercio** para `POST /v2/tokens/yape` y `POST /v2/charges` con
   `source_id` de tipo `ype_`.
2. **Dejar deshabilitada la tokenización de tarjeta** (`POST /v2/tokens`). No la usamos y no
   la queremos: es justo lo que nos sacaría del alcance.
3. **Si aun así exigen SAQ**, preguntar tres cosas concretas:
   - ¿Cuál corresponde a un comercio que **no** almacena, procesa ni transmite datos de
     tarjeta? (Si el alcance es billetera, el SAQ-D es el formulario de otro problema.)
   - ¿Sobre qué versión — su documentación cita **3.2**, retirada desde marzo de 2024?
   - ¿Aceptan una **atestación reducida** para el alcance billetera, dado que como agregador
     su propia certificación PCI ya cubre al sub-comercio? Es exactamente el motivo por el
     que **Culqi Checkout funciona hoy sin papeleo**.

**Dónde mandarlo.** `riesgos@culqi.com` es el buzón publicado, con una salvedad honesta:
está documentado para **disputas y contracargos**, así que un correo suelto puede morir ahí.
Abre en paralelo un **ticket en CulqiPanel → Soporte** citando el error literal, y usa el
correo como respaldo con el expediente adjunto. Canales: (01) 643 1050 · 970 141 600.

## 6. Borrador del correo

> **Asunto:** Autorización de API directa — alcance Yape (sin datos de tarjeta) · RUC 10482968622
>
> Buenas tardes,
>
> Escribo para solicitar la autorización de nuestro código de comercio para operar la API
> directa **en el alcance de Yape únicamente**.
>
> Hoy `POST /v2/tokens/yape` nos responde `400 authentication_error` — *"Tu código de comercio
> no está autorizado para realizar este tipo de peticiones"* — con llaves live correctas.
> Entendemos, por su documentación de Yape (sección *Usando APIs*), que la causa es el
> requisito de acreditación PCI DSS para el uso directo de la API.
>
> Antes de iniciar ese proceso quisiéramos confirmar el alcance que nos corresponde, porque
> **nuestra integración no almacena, procesa ni transmite datos de tarjeta**:
>
> - Solo usamos `POST /v2/tokens/yape` (celular + código de aprobación) y `POST /v2/charges`
>   con `source_id` de tipo `ype_`. No usamos ni necesitamos la tokenización de tarjeta.
> - No cargamos CulqiJS ni ningún script de terceros: la tokenización es servidor a servidor.
> - Las llaves viven cifradas del lado servidor, nunca en el navegador.
>
> Nuestras consultas concretas:
>
> 1. ¿Pueden autorizar el código de comercio con alcance Yape, manteniendo deshabilitada la
>    tokenización de tarjeta?
> 2. Si se requiere igualmente un SAQ, ¿cuál corresponde a un comercio sin datos de tarjeta
>    en alcance, y sobre qué versión de la norma? Su documentación cita PCI DSS 3.2, retirada
>    por el PCI SSC en marzo de 2024.
> 3. ¿Existe una atestación reducida para el alcance billetera, considerando que su
>    certificación como agregador ya cubre al sub-comercio?
>
> Adjunto el detalle técnico de la integración (flujo de datos, manejo de llaves, TLS y
> política de logs) por si ayuda a la evaluación. Quedamos atentos.

### 6.1 · Respuesta al ticket de soporte (lista para enviar)

Para contestar la respuesta descrita en §1.1. El objetivo no es discutir: es entregar el dato
que descarta su diagnóstico, para que el ticket suba de nivel en vez de cerrarse.

> **Asunto:** Re: Error 400 `authentication_error` en `/v2/tokens/yape` — la causa no es el
> entorno de las llaves
>
> Buenas tardes, y gracias por la revisión.
>
> Les escribo porque el diagnóstico no coincide con lo que observamos, y quiero darles el
> dato que lo descarta para no hacernos perder tiempo a ambos.
>
> Entiendo la recomendación —`sk_test_` para pruebas, `sk_live_` para ventas reales— y ya la
> seguimos: nuestras pruebas de integración corren con llaves de test, y en ese entorno la
> tokenización y el cargo funcionan sin problema.
>
> El error que reportamos ocurre con las llaves **live** y **no depende de los datos
> enviados**. Lo comprobamos con dos peticiones a `POST https://secure.culqi.com/v2/tokens/yape`,
> ambas con nuestra llave pública live, el **14-08-2026 a las 20:28 hora Perú (01:28 UTC del
> 15-08)**:
>
> 1. Cuerpo `{"amount": 500, "currency_code": "PEN"}` — **sin `number_phone` y sin `otp`**;
>    es decir, sin ningún dato de prueba.
> 2. El mismo cuerpo más `number_phone: 900000001` y `otp: 425251` (los datos de prueba de su
>    documentación).
>
> **Las dos respondieron exactamente lo mismo:**
>
> ```json
> {"object": "error", "type": "authentication_error",
>  "merchant_message": "Tu código de comercio no está autorizado para realizar este tipo de peticiones. Contáctate con culqi.com/soporte para obtener mas información."}
> ```
>
> La primera petición no contenía datos de prueba de ningún tipo. Si la causa fuera mezclar
> credenciales de producción con datos de prueba, esa petición no podría fallar por ese
> motivo. El rechazo ocurre al validar la autorización del comercio, antes de mirar el cuerpo.
>
> Nótese además que el mensaje identifica correctamente nuestro comercio y niega *el tipo de
> petición*, no la credencial: la llave live es válida y está siendo reconocida.
>
> Nuestra lectura, a partir de su documentación de Yape (sección *Usando APIs*), es que el uso
> directo del API requiere una autorización asociada al cumplimiento PCI DSS, y que es esa
> autorización la que falta en nuestro código de comercio. Eso también explica por qué desde
> su lado la plataforma "opera correctamente": por Culqi Checkout el comercio funciona, porque
> Checkout no exige esa autorización.
>
> Con eso, nuestras consultas concretas:
>
> 1. ¿Pueden autorizar nuestro código de comercio para `POST /v2/tokens/yape` y
>    `POST /v2/charges` con `source_id` de tipo `ype_`, manteniendo **deshabilitada** la
>    tokenización de tarjeta (`POST /v2/tokens`)? No la usamos ni la necesitamos.
> 2. Si de todas formas se requiere un SAQ, ¿cuál corresponde a un comercio que **no**
>    almacena, procesa ni transmite datos de tarjeta? Nuestro flujo es únicamente celular +
>    código de aprobación de Yape, servidor a servidor, sin CulqiJS en el navegador.
> 3. ¿Sobre qué versión de la norma? Su documentación cita PCI DSS 3.2, retirada por el PCI
>    SSC en marzo de 2024; hoy rige la v4.0.1.
>
> Quedo atento. Si les sirve, puedo repetir la petición 1 en el momento que indiquen para que
> la ubiquen en sus registros.

## 7. Si Culqi insiste en el SAQ-D completo

Entonces la pregunta ya no es técnica, es de negocio, y hay que responderla con el dato que
importa: **cuántos pedidos se caen hoy en el cruce manual**. Sin ese número, sostener un
escaneo ASV trimestral para cobrar adelantos de S/5 es comprar cumplimiento con cargo a una
hipótesis.

Tres salidas, en orden de lo que yo haría:

1. **Insistir con el alcance.** Escalar a un ejecutivo comercial, no a soporte de primera
   línea. Un comercio que no toca tarjeta es un caso que su política probablemente no previó,
   y el que decide eso no atiende el chat.
2. **Llenarlo.** Es viable —el expediente de la sección 4 cubre buena parte de las
   respuestas— pero compra una obligación anual. Que sea una decisión, no una inercia.
3. **Culqi Checkout como puente.** Cobra hoy, sin papeleo, a cambio de que el comprador
   teclee dentro del popup. Nuestro `culqi-charge` no se tira: el cargo, el webhook, el
   claim-lock y la conciliación siguen sirviendo — cambia quién genera el token.

Mientras tanto la tienda va con `culqi_enabled=false` y el paso 3 manual, que está probado y
vendiendo.

## 8. El día que aprueben — checklist

En este orden. El paso que no se podía saltar —sin webhook, un cargo cobrado cuya respuesta
se pierda queda sin registrar— ya está puesto.

1. ✅ **Webhook registrado y comprobado (14-ago-2026)**. En el panel
   (`charge.creation.succeeded` → `https://ofdjghntvmrdfjhazfvz.supabase.co/functions/v1/culqi-webhook`)
   y el endpoint verificado en vivo: sin puerta JWT y sin Basic exigido. **No definir
   `CULQI_WEBHOOK_BASIC`** salvo que se cargue el mismo `usuario:clave` en el panel — si no,
   toda entrega rebota con 401 y, siendo una red de seguridad, el fallo no se nota. Cómo
   re-comprobarlo: [`ESTADO-OPERATIVO.md`](./ESTADO-OPERATIVO.md) § Bloqueo 2.
2. **Encender el cobro** de Gadicaf:
   ```sql
   update stores set culqi_enabled = true where id = 't1';
   ```
3. **Un cargo real, pequeño**, de punta a punta desde el checkout.
4. **Leer el log** — Supabase → Edge Functions → `culqi-charge` → Logs. Si algo falla, ahora
   la línea dice el motivo (`type` + `merchant_message`), no `{400, null}`.
5. **Verificar el cuadre**: `payment_events` con el `chr_`, el pedido en `MATCHED` /
   `confirmado`, y los dos acuses en el chat.
6. **Actualizar `ESTADO-OPERATIVO.md`**: tachar los bloqueos 1 y 2, y la fecha de arriba.
