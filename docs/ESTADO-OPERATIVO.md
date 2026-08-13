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
| 1 | **El cobro en línea no pasa del token**: `400 authentication_error` — "tu código de comercio no está autorizado para realizar este tipo de peticiones" — con las llaves live y el código correctos. **Causa confirmada**: la API directa exige acreditación PCI DSS. | 12-ago-2026 | **Pedir a Culqi la autorización de API con alcance Yape.** Expediente técnico, petición y borrador del correo listos en **[`05-PCI-SAQ-D.md`](./05-PCI-SAQ-D.md)** — solo falta mandarlo. | Fundador |
| 2 | **Webhook de Culqi sin registrar** en el panel. Es la red que evita que un cargo cobrado quede sin registrar si la respuesta se pierde. | — | CulqiPanel → Desarrollo → Webhooks: evento `charge.creation.succeeded` a `https://ofdjghntvmrdfjhazfvz.supabase.co/functions/v1/culqi-webhook`. El Basic es opcional (solo se exige si existe el secret `CULQI_WEBHOOK_BASIC`). | Fundador |

> El bloqueo 2 no se puede comprobar desde el repo — vive en el panel de Culqi. Si ya está
> registrado, táchalo aquí.

### Bloqueo 1 · causa confirmada, decisión tomada (13-ago-2026)

**Confirmado contra la documentación de Culqi** (Pagos Online → Cargo único → Yape, sección
*Usando APIs*): interactuar directamente con la API **exige cumplir PCI DSS y enviar el
formulario SAQ-D al buzón de riesgos de Culqi**. Nuestro código es correcto; lo que falta es
esa acreditación. Por eso el error habla de "este *tipo* de peticiones", y por eso soporte
dice que no hay nada que activar: por Culqi Checkout funciona hoy sin papeleo.

**Descartado:** que Culqi tenga que "activar Yape" en el comercio. La primera lectura de esta
sesión —pedir la habilitación a soporte— era **incorrecta**.

**Decisión: camino A — se acredita y se pide la autorización.** No se cae a Culqi Checkout
(saca al comprador de la pantalla en el momento de la venta) ni al cruce por notificación de
§3.1 (depende de un APK o un MacroDroid vivo en un Android ajeno).

Todo el manejo del trámite vive en **[`05-PCI-SAQ-D.md`](./05-PCI-SAQ-D.md)**: qué pedir
exactamente, el expediente técnico que lo sustenta —el riel Yape no transporta datos de
tarjeta, así que no hay CDE que escanear—, el borrador del correo a `riesgos@culqi.com` y el
checklist del día que aprueben.

## Deuda técnica conocida

Anotada donde vive, para que no haya que redescubrirla:

| Deuda | Dónde | Por qué importa |
|---|---|---|
| `payment_reason` y los mensajes `sellers` pueden acabar frente al comprador vía `get-session?viewer=seller`. | `culqi-charge/index.ts:331` | Obliga a que **ningún texto de terceros** (como el `merchant_message` de Culqi) entre ahí. Es la razón de que los motivos de fallo sean frases cortas y propias, y de que `errorForLog` vaya **solo** a los logs de la función. |
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
