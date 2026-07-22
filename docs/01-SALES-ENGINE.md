# 01 · SALES ENGINE — Cierre & Conversión

> **Objetivo:** liberar al emprendedor del cuello de botella de atender clientes a mano.
> Cerrar ventas en minutos sin personal humano.
>
> Leyenda: ✅ construido · 🟡 parcial · 🔮 planeado

## Componentes

### 1. Agente IA "Closer" (voz + texto) 🟡 / 🔮
- **Hoy ✅:** voz WebRTC vendedor↔comprador con **LiveKit** (`seller-call-token`,
  `create-call-token`, overlay de llamada, ringtone) + grabación por Egress
  (`livekit-webhook`). Asistente IA para el **vendedor** en `BotIAPage.tsx`.
- **Falta 🔮:** un **closer autónomo** que atienda y cierre solo en la landing (voz tipo
  **ElevenLabs** + LLM manejando la conversación de venta). Hoy la voz es humano↔humano;
  el agente de cierre automático aún no existe.
- Al cerrar, el agente debe marcar `sale.closedBy = 'AI_CLOSER'` en el estado central.

### 2. Checkout CRO ultra-rápido ✅
- **Validación DNI con Decolecta (RENIEC)** → autocompleta el nombre y reduce campos:
  `supabase/functions/dni-lookup/index.ts` (secret `DECOLECTA_TOKEN`).
- Registro del comprador y creación del pedido: `register-buyer` (upsert por
  `document_number` o teléfono; asignación round-robin a un vendedor de **Ventas**;
  continuidad si ya tenía pedido activo con un vendedor).
- Landing de producto: `src/pages/LandingProductoPage.tsx`. Chat del pedido:
  `OrderChatPage.tsx` (Realtime).
- Escribe `customer.*` y `sale.productId` del estado central. ✅

### 3. Pagos locales sin fricción 🟡 / 🔮
- **Hoy ✅:** **Contraentrega (COD)** es el flujo real de cobro.
- **Hoy 🟡:** Yape/Plin aparecen como **etiquetas** en catálogos/seed (`src/data/seed.ts`),
  no como cobro integrado.
- **Falta 🔮:** integración transaccional de **Yape/Plin** (link/QR, confirmación de pago)
  y tarjeta. Al integrarse, setear `sale.paymentMethod` correctamente.

## Métricas del módulo
- Tiempo landing→pedido, % de campos autocompletados por DNI, tasa de cierre por canal
  (`closedBy`), pedidos por vendedor (carga round-robin).

## Estándares
- El closer y el checkout deben **siempre** poblar `customer` y `sale` del
  `MerchantCustomerSession` (ver [00-CORE](./00-CORE-ARCHITECTURE.md)) para que Logística
  y Loyalty no re-pregunten datos.
- DNI: normalizar a 8 dígitos; nunca hardcodear `DECOLECTA_TOKEN`.

## Pendientes priorizados
1. 🔮 AI Closer autónomo (ElevenLabs + LLM) en la landing.
2. 🔮 Cobro Yape/Plin integrado (QR/confirmación).
3. 🟡 Registrar `sale.paymentMethod` real por pedido.
