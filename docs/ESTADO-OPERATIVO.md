# Estado operativo

> **Última verificación contra la base: 12-ago-2026.**
> Qué marca está viva, qué le falta, y qué deudas hay abiertas. Lo que el código no dice.

## Cómo leer esto (y por qué no miente)

**La base de datos manda.** Este doc **no** es la fuente de verdad de los flags: los refleja
con fecha, y lleva lo que la BD no guarda — el *porqué*, el *siguiente paso* y *quién lo
destraba*. Un doc que copia a mano el estado de producción miente en una semana.

Para refrescar la tabla de abajo en cinco segundos, en el SQL Editor de
[`ofdjghntvmrdfjhazfvz`](https://supabase.com/dashboard/project/ofdjghntvmrdfjhazfvz):

```sql
select s.id, s.slug, s.nombre, s.active, s.culqi_enabled, s.culqi_scope,
       s.checkout_ab_mode, s.wa_enabled, s.yape_number is not null as yape_manual,
       (select count(*) from products p where p.store_id = s.id) as productos,
       (select count(*) from order_sessions o where o.origin_store_id = s.id) as pedidos,
       left(coalesce(sec.culqi_public_key, ''), 7) as llave
from stores s left join store_secrets sec on sec.store_id = s.id
order by s.id;
```

Si el resultado no cuadra con la tabla, **gana el resultado**: actualiza el doc y cambia la
fecha de arriba.

## Marcas

| Marca | `id` | Activa | Cobro en línea | Catálogo | Pedidos |
|---|---|---|---|---|---|
| **Gadicaf** | `t1` | ✅ | ⛔ apagado — ver bloqueo #1 | 1 producto | 1 |
| **Kross** | `platform` | ✅ | — (no vende: es la tienda de la plataforma) | 0 | 0 |
| **Culqi Test** | `store-culqi-test` | ⛔ desarmada | — | 1 producto | 6 de prueba |

### Gadicaf — la única marca vendiendo

- **Llaves Culqi live cargadas** (`pk_live_…`), `culqi_scope='ALL'`.
- **`culqi_enabled = false` desde el 12-ago-2026**: el cobro en línea no puede funcionar
  hasta el bloqueo #1, y dejarlo encendido significaba que todo comprador que llegase al
  paso 3 se comiera un fallo. Se reenciende el día que Culqi confirme.
- **El checkout funciona**: WhatsApp activo y Yape manual configurado, así que el paso 3 va
  por el flujo manual de `01-SALES-ENGINE.md` §3.1–3.2, que está probado y en producción.
- A/B del checkout en `SPLIT` (mitad y mitad).

## Bloqueos abiertos

| # | Qué bloquea | Desde | Qué lo destraba | Dueño |
|---|---|---|---|---|
| 1 | **El cobro en línea no pasa del token**: `400 authentication_error` — "tu código de comercio no está autorizado para realizar este tipo de peticiones" — con las llaves live y el código correctos. **Causa en investigación**, ver abajo. | 12-ago-2026 | Confirmar en la doc de Culqi si Yape exige **CulqiJS / Checkout v4** en vez de tokenizar server-to-server. Detalle en `01-SALES-ENGINE.md` §3.3. | Fundador + dev |
| 2 | **Webhook de Culqi sin registrar** en el panel. Es la red que evita que un cargo cobrado quede sin registrar si la respuesta se pierde. | — | CulqiPanel → Desarrollo → Webhooks: evento `charge.creation.succeeded` a `https://ofdjghntvmrdfjhazfvz.supabase.co/functions/v1/culqi-webhook`. El Basic es opcional (solo se exige si existe el secret `CULQI_WEBHOOK_BASIC`). | Fundador |

> El bloqueo 2 no se puede comprobar desde el repo — vive en el panel de Culqi. Si ya está
> registrado, táchalo aquí.

### Bloqueo 1 · lo que se sabe y lo que no

**Descartado:** que Culqi tenga que "activar Yape". Soporte responde que es asunto de
integración, no de activación (12-ago-2026). La primera lectura de esta sesión —pedir la
habilitación a soporte— era **incorrecta**.

**Hipótesis viva:** el problema es el *tipo* de integración. Los SDK oficiales recomiendan
**CulqiJS / Checkout v4** en vez de llamar a la API para crear tokens, y el flujo documentado
de Yape es un popup de Culqi donde el comprador teclea celular y código. `culqi-charge`
tokeniza server-to-server, que encaja con "este tipo de peticiones".

**Sin verificar, y es importante:** el proxy de egress de la sesión **bloquea todo el dominio
`culqi.com`** (`docs.`, `apidocs.`, CDN incluidos), así que la documentación oficial no se
pudo leer desde aquí. Hay que abrirla a mano:
`docs.culqi.com/es/documentacion/pagos-online/cargo-unico/tokens-yape`.

**Si se confirma, no es un parche**: cae el "CERO script de terceros en la PWA" de §3.3, y el
comprador pasaría a teclear dentro del popup de Culqi en vez de en nuestro campo.

## Deuda técnica conocida

Anotada donde vive, para que no haya que redescubrirla:

| Deuda | Dónde | Por qué importa |
|---|---|---|
| `culqi-charge` loguea solo `{status, code}`, y los errores de Culqi traen el motivo en `type` / `merchant_message`. | `01-SALES-ENGINE.md` §3.3 · `culqi-charge/index.ts` | El primer fallo de cobro live salió como `{status: 400, code: null}` y costó una tarde de diagnóstico a ciegas. |
| `payment_reason` y los mensajes `sellers` pueden acabar frente al comprador vía `get-session?viewer=seller`. | `culqi-charge/index.ts:331` | Obliga a que **ningún texto de terceros** (como el `merchant_message` de Culqi) entre ahí. Es la razón de que los motivos de fallo sean frases cortas y propias. |
| `manage-store` mantiene vivo el camino legacy `admin_auth_id` para branding. | `01-SALES-ENGINE.md` §3.3 · `manage-store/index.ts:82` | Doble superficie de auth. Los campos de cobro ya exigen JWT verificado; falta retirar el resto. |
| Catálogo de distritos incompleto 🟡 | `02-SMART-LOGISTICS.md` § Deuda conocida | Afecta la cobertura de reparto. |

## Limpieza pendiente

- **`store-culqi-test`** quedó desarmada (`active=false`) pero conserva 1 producto y 6
  pedidos de la verificación e2e. Decidir si se borra o se mantiene como banco de pruebas
  — hoy no estorba, pero ensucia cualquier consulta que cuente pedidos sin filtrar.

## Cuándo tocar este doc

Cuando cambie algo que la BD no explica sola: se enciende o apaga un cobro, entra una marca
nueva, se destraba o aparece un bloqueo, se salda una deuda. **Y siempre la fecha de
arriba** — un doc de estado sin fecha no se puede creer.
