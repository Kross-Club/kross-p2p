# 03 · LOYALTY & REORDER ENGINE — Fidelización & LTV

> **Objetivo:** multiplicar el valor del cliente en el tiempo sin volver a pagar ads en
> Meta/TikTok. Generar recompra automática.
>
> Leyenda: ✅ construido · 🟡 parcial · 🔮 planeado

## Componentes

### 1. Sistema de puntos / cashback ✅
- `buyers.puntos` + **recompensa de bienvenida** al activar el DNI (`buyer-login`,
  `stores.welcome_points/welcome_msg`).
- **Canje redimible**: `register-buyer` (`redeem_points`) → descuento en la próxima compra,
  topado por saldo y por precio. Config `stores.points_rate` ("1 punto = S/X").
- Visible desde la primera compra en la app del comprador.
- Escribe `loyalty.pointsEarned` del estado central.

### 2. Recordatorios de recompra inteligente ✅ (manual) / 🔮 (auto)
- **Segmentos por ciclo de consumo** (`retention-metrics`, `run-campaign`):
  - **RESTOCK** — última compra hace `[restock_days, winback_days)` → el producto se acaba.
  - **WIN-BACK** — sin comprar hace más de `winback_days` → cliente dormido.
- Envío de plantilla **WhatsApp** por lotes de 80 con **cooldown de 7 días**
  (`buyers.last_campaign_at`). Ventanas configurables por marca (`ClientesPage`/`RetencionPage`).
- **Hoy 🟡:** la campaña se **dispara manual** desde el panel.
- **Falta 🔮:** **automatización real** (pg_cron / scheduled function) que corra el restock
  a diario según el ciclo del producto sin intervención → `loyalty.nextReorderDate`.

### 3. Loop de recompra (catálogo + reorder) ✅
- Tienda del comprador `TiendaPage.tsx` (`/tienda`): catálogo + pedido en 1–2 toques
  (sin reingresar datos, hereda del `buyers`).
- "Volver a pedir" (reorder 1-tap) y "Comprar de nuevo" en `MisPedidosPage.tsx`.

### 4. Activación de base existente ✅ (Retención Fase 1)
- Import de clientes (`import-buyers`, CSV con detección de columnas), embudo de activación
  (`manage-store` → `client_stats`), invitación masiva controlada (`invite-buyers`),
  link de invitación compartible.

### 5. Valoraciones & social proof 🔮
- **Falta 🔮:** solicitud automática de reviews post-entrega con incentivo (puntos) para la
  próxima compra, y mostrar prueba social en la landing/tienda.

## Dashboard de retención ✅
`RetencionPage.tsx` + `retention-metrics`: tasa de recompra, ingreso de clientes
existentes, LTV promedio, tamaño de segmentos.

## Datos que consume/produce (estado central)
- Lee: `customer.phone`, historial de `order_sessions` entregados.
- Escribe: `loyalty.pointsEarned` ✅, `loyalty.nextReorderDate` 🟡→🔮.

## Estándares
- Proteger el canal antes que el envío puntual: **lotes + cooldown + log** siempre.
- El `points_rate` es palanca de negocio (sale del margen COD): calibrar por marca.
- Nunca spamear WhatsApp; respetar el cooldown y el estado del número.

## Pendientes priorizados
1. 🔮 Automatización con cron del restock (retención pasiva).
2. 🔮 Reviews automáticas con incentivo + social proof.
3. 🟡 Persistir `loyalty.nextReorderDate` por cliente.

## Ver también
Detalle por fases en [`ICP LTV`](./ICP%20LTV/).
