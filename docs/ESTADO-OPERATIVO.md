# Estado operativo

> **Última verificación contra la base: 21-ago-2026.**
> Qué marca está viva, qué le falta, y qué deudas hay abiertas. Lo que el código no dice.

## Cómo leer esto (y por qué no miente)

**La base de datos manda.** Este doc **no** es la fuente de verdad de los flags: los refleja
con fecha, y lleva lo que la BD no guarda — el *porqué*, el *siguiente paso* y *quién lo
destraba*. Un doc que copia a mano el estado de producción miente en una semana.

Para refrescar la tabla de abajo en cinco segundos, en el SQL Editor de
[`ofdjghntvmrdfjhazfvz`](https://supabase.com/dashboard/project/ofdjghntvmrdfjhazfvz):

```sql
select s.id, s.slug, s.nombre, s.active,
       s.pay360_enabled, s.pay360_env, s.pay360_payment_prefix,
       s.pay360_business_id is not null as conectado,
       s.home_delivery_enabled, s.checkout_ab_mode, s.wa_enabled,
       (select count(*) from products p where p.store_id = s.id) as productos,
       (select count(*) from order_sessions o where o.origin_store_id = s.id) as pedidos
from stores s order by s.id;
```

Si el resultado no cuadra con la tabla, **gana el resultado**: actualiza el doc y cambia la
fecha de arriba.

## Marcas

| Marca | `id` | Activa | Cobro en línea | Catálogo | Pedidos |
|---|---|---|---|---|---|
| **Kross Shop** | `st_kross-shop_mt233mx7` | ✅ | ✅ **360pay en producción** (prefijo `KSH`) | 1 producto | 4 |
| **Gadicaf** | `t1` | ✅ | ⛔ sin conectar — ver bloqueo #1 | 1 producto | 1 |
| **Kross** | `platform` | ✅ | — (no vende: es la tienda de la plataforma) | 0 | 0 |
| **Culqi Test** | `store-culqi-test` | ⛔ desarmada | — | 1 producto | 0 |

### Kross Shop — la primera marca cobrando en línea

- **360pay conectado y en `live`**, prefijo de código de pago `KSH`, webhook `PAYMENT_PAID`
  activo. **Primer pago real cobrado el 21-ago-2026**: del pago en Yape al pedido cruzado
  pasaron 6.6 segundos, sin intervención.
- **Entrega a domicilio apagada**: solo recojo en agencia. El `DEFAULT` de la columna se
  cambió a `false` el mismo día — una marca nueva no promete entrega a la puerta hasta que
  alguien decida que puede cumplirla.
- A/B del checkout en `SPLIT` (mitad y mitad).
- WhatsApp aún sin activar.

### Gadicaf

- **Sin 360pay conectado**, así que su paso 3 no cobra: el pedido se registra y el adelanto
  lo coordina un asesor por el chat.
- El flujo manual de Yape se eliminó el 21-ago-2026 y **no le costó nada**: ninguna de
  las cuatro tiendas tenía `yape_number` configurado, así que no había número que
  mostrarle a ningún comprador.
- WhatsApp activo. Entrega a domicilio apagada.

## Bloqueos abiertos

| # | Qué bloquea | Desde | Qué lo destraba | Dueño |
|---|---|---|---|---|
| 1 | **Gadicaf no puede cobrar adelantos en línea**: no tiene 360pay conectado ni número de Yape configurado. Sus pedidos se cierran igual y el adelanto se coordina por chat, pero pierde la confirmación automática. | 21-ago-2026 | Conectarla desde el panel → Cobros → *Cobrar el adelanto con Yape (360pay)*. Es la misma alta de un clic que se hizo con Kross Shop. | Fundador |
| 2 | **Credenciales expuestas sin rotar**: la llave de partner de 360pay y el secreto de firma del webhook pasaron por el chat y por capturas de pantalla. | 20-ago-2026 | Rotar la llave desde 360pay y el secreto con `POST /businesses/{id}/hooks/{hookId}/rotate-secret`, y recargar los secrets del proyecto. | Fundador |

### Culqi quedó fuera (21-ago-2026)

Los dos bloqueos que ocupaban este espacio eran de Culqi: la API directa exigía acreditación
**PCI DSS / SAQ-D** y el cobro nunca pasó del token. **Se eliminó el motor entero** —código,
Edge Functions, columnas, llaves guardadas y el documento de acreditación— el día que 360pay
cobró su primer sol real.

No fue solo limpieza: **tener dos motores encendidos a la vez confundía la configuración de
cada marca**, y el que quedaba bloqueado no aportaba nada. 360pay resuelve el mismo problema
sin tocar credenciales de pago, porque Kross Club es *partner* y cada marca es un *business*
bajo esa cuenta. Ver [`06-360PAY.md`](./06-360PAY.md) y
[`07-CONTRATO-360PAY.md`](./07-CONTRATO-360PAY.md).

## Deuda técnica conocida

Anotada donde vive, para que no haya que redescubrirla:

| Deuda | Dónde | Por qué importa |
|---|---|---|
| `payment_reason` y los mensajes `sellers` pueden acabar frente al comprador vía `get-session?viewer=seller`. | `pay360-coupon/index.ts` · `notePaymentFailure` | Obliga a que **ningún texto de terceros** entre ahí. Es la razón de que los motivos de fallo sean frases cortas y propias, y de que el error crudo de 360pay vaya **solo** a los logs de la función. |
| Nada impide emitir un cupón por debajo de S/5. | `07-CONTRATO-360PAY.md` §6 | La comisión es plana: un adelanto de S/5 le deja S/0 al comercio. Falta un piso configurable por tienda, o caer a contraentrega puro cuando el adelanto no lo alcance. |
| `stores` no guarda RUC ni razón social de cada marca. | `07-CONTRATO-360PAY.md` §5 | El contrato con 360pay nos obliga a mantener ese registro de los comerciantes referidos. |
| `manage-store` mantiene vivo el camino legacy `admin_auth_id` para branding. | `01-SALES-ENGINE.md` §3.3 · `manage-store/index.ts:82` | Doble superficie de auth. Los campos de cobro ya exigen JWT verificado; falta retirar el resto. |
| Catálogo de distritos incompleto 🟡 | `02-SMART-LOGISTICS.md` § Deuda conocida | Afecta la cobertura de reparto. |

## Limpieza pendiente

- **`store-culqi-test`** quedó desarmada (`active=false`) y conserva 1 producto. Con Culqi
  fuera ya no tiene ningún motivo para existir: borrarla.
- **El cliente `Prueba Kross`** creado en el panel de 360pay para confirmar la forma del
  `POST /customers`. Borrarlo desde `console.360pay.pe` → Clientes.

## Cuándo tocar este doc

Cuando cambie algo que la BD no explica sola: se enciende o apaga un cobro, entra una marca
nueva, se destraba o aparece un bloqueo, se salda una deuda. **Y siempre la fecha de
arriba** — un doc de estado sin fecha no se puede creer.
