# 07 — Recordatorios de recojo en agencia 🔮

> **Diseño, aún no construido.** Cascada automática de recordatorios (push + WhatsApp)
> para que el comprador recoja su pedido de la agencia sin que una persona tenga que
> perseguirlo. Sustituye la idea del "robocall tipo Entel/Claro", que se evaluó y se
> descartó para esta fase (ver decisión al final).
>
> Estado: 🔮 planeado · toca `order_sessions` (contrato `MerchantCustomerSession`,
> ver `00-CORE-ARCHITECTURE.md`), Edge Functions y pg_cron.

---

## El problema

En provincia el pedido viaja por agencia (`dispatch_type = 'AGENCIA_PROVINCIA'`,
`agency_name = SHALOM | OLVA | OTRO`). El paquete llega a la sede… y ahí puede morirse:
si el comprador no va a recogerlo, la agencia lo devuelve a los ~7 días y el pedido
termina en `no_entregado` — flete de ida y vuelta perdido, y la **tasa de entrega**
(la métrica que define un negocio COD) baja.

Hoy la única defensa es que un vendedor se acuerde de escribirle al cliente. Eso no
escala: depende de personas cobrando/persiguiendo detrás de cada pedido.

## La solución en una frase

Un **cron diario** recorre los pedidos que están esperando recojo y dispara una
**cadencia de recordatorios** por los canales que ya existen (Web Push + plantilla de
WhatsApp), con urgencia creciente anclada a un deadline **real**: la fecha en que la
agencia devuelve el paquete. La persona solo entra al final, para las excepciones.

Todo el pipeline de envío ya está construido — este diseño solo añade el disparador
programado y el estado mínimo para saber *a quién* y *cuándo*:

| Pieza | Estado | Dónde |
|---|---|---|
| Envío de plantillas WA al comprador de un pedido | ✅ | `send-wa-template` (resuelve variables server-side: `name`, `product`, `link`, `address`…) |
| Web Push al comprador (por `buyer_id` o `session_id`) | ✅ | patrón `notifyBuyer` de `seller-call-token` / `send-message` |
| Bitácora push vs. WhatsApp | ✅ | `notifications_log` |
| Envío en lote con cooldown por comprador | ✅ (patrón) | `run-campaign` (segmento → plantilla → batch) |
| Saber que el paquete **llegó a la agencia** | ⛔ no existe | — este doc |
| Disparador programado | ⛔ no existe | — este doc |

## Modelo de datos (aditivo, sin romper nada)

Siguiendo la convención de columnas-costura de `setup-kross.sql`:

```sql
-- El ancla de toda la cadencia: cuándo llegó el paquete a la sede.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS arrived_at_agency_at timestamptz;

-- Progreso de la cadencia (0 = nada enviado). Evita reenvíos si el cron corre dos veces.
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS pickup_reminder_step smallint DEFAULT 0;
ALTER TABLE order_sessions ADD COLUMN IF NOT EXISTS pickup_reminder_last_at timestamptz;

-- Config por marca (white-label: cada tienda decide).
ALTER TABLE stores ADD COLUMN IF NOT EXISTS pickup_reminders_enabled boolean DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS agency_hold_days smallint DEFAULT 7; -- días antes de que la agencia devuelva
```

- **No se añade stage nuevo.** `en_camino` + `arrived_at_agency_at IS NOT NULL` ≡
  "esperando recojo". `entregado` (lo recogió) o `no_entregado` (lo devolvieron)
  cierran la cadencia solos, sin código extra.
- `arrived_at_agency_at` cruza módulos (lo escribe Logistics, lo lee este motor y lo
  muestra Sales) → **antes de implementar, registrarlo en el contrato
  `MerchantCustomerSession` de `00-CORE-ARCHITECTURE.md`**, como manda la regla de
  ejecución.
- `notifications_log.kind` gana un valor `'reminder'` (hoy: `message | call | status`).

### ¿Quién marca "llegó a agencia"?

- **v1 (manual, 30 segundos de UI):** botón «Llegó a agencia» en
  `VendedorPedidoPage.tsx`, visible solo si `dispatch_type LIKE 'AGENCIA%'` y
  `stage = 'en_camino'`. Escribe `arrived_at_agency_at = now()` vía `order-manage`.
  El vendedor ya hace este seguimiento hoy — solo que ahora un clic reemplaza a
  todos los mensajes posteriores.
- **🔮 v2 (automático):** el tracking de Shalom vive en el proyecto **Neural**
  (`nqibrziksedspoctjhmc`), no en esta PWA. Cuando exista el puente, Neural puede
  golpear un endpoint que setee `arrived_at_agency_at` sin humano. El diseño no
  cambia: la cadencia solo mira la columna, no le importa quién la escribió.

## La cadencia

Anclada a `arrived_at_agency_at`; el deadline se calcula como
`arrived_at_agency_at + agency_hold_days`. Tono de utilidad, no de marketing —
son notificaciones transaccionales de un pedido que el cliente ya hizo.

| Paso | Día | Canal | Mensaje (esqueleto) |
|---|---|---|---|
| 1 | 0 (al marcar llegada) | Push + WA | «{nombre}, tu pedido {producto} ya está en {agencia} — {dirección de sede}. Recógelo con tu DNI. {link}» |
| 2 | 2 | Push + WA | «{nombre}, tu pedido sigue esperándote en {agencia}. {link}» |
| 3 | 4 | Push + WA | «⚠️ {nombre}, la agencia devolverá tu pedido el {fecha}. Después de esa fecha ya no podremos entregártelo. {link}» |
| 4 | 5 | **Al vendedor** | Push interno: «{comprador} no recoge su pedido (vence {fecha})» — recién aquí interviene una persona, solo para las excepciones. |

Reglas del motor:

- **Push primero, WhatsApp siempre en pasos 1 y 3** (llegada y último aviso son lo
  bastante importantes para pagar la plantilla); en el paso 2, WhatsApp solo si no
  hay push alcanzable — mismo criterio de costo que ya usa `notifyBuyer`.
- **Idempotencia:** el cron avanza `pickup_reminder_step` en la misma escritura que
  envía; un paso nunca se repite aunque el cron corra doble.
- **Corte automático:** `stage` distinto de `en_camino` → fuera de la cadencia. Nada
  de recordarle a alguien que ya recogió.
- **Horario:** el cron corre 1 vez al día a las **11:00 Lima** (16:00 UTC) — hora
  decente para sonar el teléfono, y deja la mañana para que el paso llegue "hoy".

## Plantillas de WhatsApp a aprobar en Meta

Tres plantillas nuevas, **categoría Utility** (más baratas que Marketing y sin riesgo
de bloqueo por promocional). WhatsApp **no permite plantillas de audio** — fuera de la
ventana de 24 h solo salen plantillas aprobadas de texto/media, así que la "nota de voz
automática" no es una opción en este canal.

| Plantilla | Variables | Uso |
|---|---|---|
| `recojo_listo` | {{1}} nombre · {{2}} producto · {{3}} agencia + sede · {{4}} link | Paso 1 |
| `recojo_recordatorio` | {{1}} nombre · {{2}} agencia · {{3}} link | Paso 2 (fallback) |
| `recojo_ultimo_aviso` | {{1}} nombre · {{2}} fecha de devolución · {{3}} link | Paso 3 |

La sede y la fecha se resuelven server-side desde el pedido (patrón `mapping` de
`send-wa-template`), nunca en el cliente.

## Arquitectura del disparador

```
pg_cron (diario 16:00 UTC)
  └─ pg_net → Edge Function `pickup-reminders`  (service role, sin JWT de usuario)
       ├─ SELECT order_sessions
       │    WHERE dispatch_type LIKE 'AGENCIA%'
       │      AND stage = 'en_camino'
       │      AND arrived_at_agency_at IS NOT NULL
       │      AND store en pickup_reminders_enabled
       ├─ por sesión: días transcurridos → paso que toca → ¿ya se envió? (step)
       ├─ envía push (notifyBuyer) + WA según regla de canal
       ├─ UPDATE pickup_reminder_step / _last_at
       └─ INSERT notifications_log (kind='reminder', detail=paso)
```

- Una sola función nueva; los envíos reutilizan el código compartido existente
  (mismas convenciones: CORS, validación, service role para escribir — el frontend
  jamás la invoca).
- `pickup_reminders_enabled` por tienda permite prender la cascada primero en
  **Gadicaf** (la única marca viva, ver `ESTADO-OPERATIVO.md`) sin tocar al resto.
- Volumen actual (decenas de pedidos) → un solo batch diario sobra; el patrón por
  lotes de `run-campaign` queda como referencia si algún día hay miles.

## Qué medir (para saber si la voz hace falta algún día)

Todo sale de datos que ya se guardan + los nuevos timestamps:

- **Tasa de recojo:** `entregado / (entregado + no_entregado)` en pedidos
  `AGENCIA%` — antes vs. después de prender la cascada. La métrica que decide todo.
- **Tiempo a recojo:** `entregado_at − arrived_at_agency_at` (¿los recordatorios
  aceleran, además de salvar?).
- **Paso que convierte:** ¿cuántos recogen tras el paso 1 vs. cuántos necesitaron el
  último aviso? Si casi todo se resuelve en pasos 1–2, la cascada basta.
- **Cobertura de canal:** `notifications_log` ya separa push vs. WhatsApp — cuánto
  cuesta la cascada por pedido salvado (push es gratis; la plantilla Utility cuesta
  centavos de USD).

## Plan de implementación

| Fase | Alcance | Toca |
|---|---|---|
| **F1** | Columnas + contrato en `00-CORE` + botón «Llegó a agencia» + paso 1 (notificación inmediata al marcar) | `setup-kross.sql`, `order-manage`, `VendedorPedidoPage.tsx` |
| **F2** | Plantillas aprobadas en Meta + Edge Function `pickup-reminders` + pg_cron + pasos 2–3 | Supabase (SQL Editor + deploy función) |
| **F3** | Paso 4 (aviso al vendedor) + contadores de recojo en el panel | `RetencionPage`/panel admin |
| **🔮 F4** | Solo si los datos de F2–F3 muestran un segmento que no lee mensajes: llamada de voz real (SIP trunk / robocall con TTS). Neural escribiendo `arrived_at_agency_at` vía tracking. | fuera de esta PWA en parte |

F1 se puede subir sola y ya genera valor (la notificación de llegada es el paso que
más convierte). F2 es donde desaparece el humano del bucle.

## Decisión: por qué NO el robocall (por ahora)

Se evaluó replicar la llamada con audio grabado tipo cobranza Entel/Claro. Se descartó
para esta fase por tres razones:

1. **Con la infraestructura actual no llega al teléfono.** Las llamadas de la PWA son
   WebRTC (LiveKit) app↔app; sonar un número real exige un SIP trunk que se decidió
   posponer (ver historial de `01-SALES-ENGINE.md` sobre llamadas).
2. **La versión simulada in-app es circular:** solo suena si el comprador abre la PWA…
   y si la abrió, una notificación con el mismo texto lograba lo mismo sin construir
   un bot de audio.
3. **El deadline real presiona mejor que una voz.** «Tu pedido se devuelve el sábado»
   con fecha verificable hace el trabajo que la locutora de Entel intenta hacer, y
   queda escrito con el link a un clic (los robocalls se cuelgan; los WhatsApp se
   releen).

La voz queda como **F4 medible**, no como fe: si `notifications_log` + la tasa de
recojo muestran un segmento sordo a mensajes (p. ej. compradores mayores en
provincia), ahí el robocall SIP se justifica — y para un audio de 20 segundos el
costo es de centavos por llamada.
