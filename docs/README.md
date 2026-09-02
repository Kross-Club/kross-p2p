# Documentación Kross P2P

Kross es una PWA white-label multi-tenant para ecommerce contraentrega (COD) en Perú.
Cada marca recibe su propia app instalable en `marca.krossclub.app`.

La documentación está dividida por **ICP** (Ideal Customer Profile), porque el producto
vivió una transición de enfoque estratégico manteniendo la misma base de código:

| Carpeta | Enfoque | Cliente objetivo | Objetivo de la app |
|---|---|---|---|
| [`ICP Sales`](./ICP%20Sales/) | Enfoque 1 (original) | Dropshippers / venta por impulso | **Adquirir** y cerrar el pedido COD |
| [`ICP LTV`](./ICP%20LTV/) | Enfoque 2 (actual) | Marcas de recompra (suplementos, cosmética, café) | **Retener** y generar recompra (LTV) |

> El corte entre ambos enfoques es el momento en que se decidió reposicionar Kross
> como **producto de retención** en lugar de herramienta de adquisición. Todo lo
> construido antes de ese corte está documentado en `ICP Sales`; todo lo construido
> después (fases de retención) está en `ICP LTV`.

---

## Dos capas de documentación

La doc está organizada en dos capas complementarias:

- **Capa estratégica (por ICP):** *por qué* y *para quién* — `ICP Sales`, `ICP LTV`.
  La tesis del producto de reparto solo por agencia, cotejada con operadores COD reales,
  vive en [`ICP Sales/VALIDACION-AGENCIA.md`](./ICP%20Sales/VALIDACION-AGENCIA.md).
- **Capa técnica (por módulo):** *cómo* está construido cada componente del Sistema
  Operativo de E-commerce, con estado real del código (✅/🟡/🔮).

### Módulos técnicos

| Módulo | Archivo | Cubre |
|---|---|---|
| 00 · Core | [`00-CORE-ARCHITECTURE.md`](./00-CORE-ARCHITECTURE.md) | Base de datos, auth, panel admin, estado central `MerchantCustomerSession` |
| 01 · Sales | [`01-SALES-ENGINE.md`](./01-SALES-ENGINE.md) | IA Closer, DNI (Decolecta), checkout CRO, pagos |
| 02 · Logistics | [`02-SMART-LOGISTICS.md`](./02-SMART-LOGISTICS.md) | Geolocalización, motorizados Lima, envíos a provincia |
| 03 · Loyalty | [`03-LOYALTY-ENGINE.md`](./03-LOYALTY-ENGINE.md) | Recompra, puntos, campañas WhatsApp, LTV |
| 04 · Cumplimiento | [`04-CUMPLIMIENTO-WEB.md`](./04-CUMPLIMIENTO-WEB.md) | Web pública, páginas legales, Libro de Reclamaciones, requisitos de pasarela |
| 06 · 360pay 🔮 | [`06-360PAY.md`](./06-360PAY.md) | 360pay como pasarela por defecto: el seam de proveedor que hoy no existe, el modelo de credenciales de partner y qué falta del spec |
| 12 · Flow 🟡 | [`12-FLOW.md`](./12-FLOW.md) | Flow Pagos como segundo riel: checkout alojado con redirect, ruteo por monto contra 360pay (corte en S/90), y la puesta en marcha pendiente |
| 08 · Recojo 🔮 | [`08-RECORDATORIOS-RECOJO.md`](./08-RECORDATORIOS-RECOJO.md) | Cascada automática de recordatorios (push + WhatsApp) para que el comprador recoja su pedido de la agencia sin humanos persiguiendo; incluye la decisión de descartar el robocall |

### Cómo trabajamos

| Archivo | Cubre |
|---|---|
| [`ESTADO-OPERATIVO.md`](./ESTADO-OPERATIVO.md) | Qué marca está viva, qué la bloquea y qué deuda hay abierta. **Empieza aquí** si vuelves después de un tiempo |
| [`GIT-FLOW.md`](./GIT-FLOW.md) | Nomenclatura de ramas y commits, flujo de PR |

## Regla de ejecución (para Claude Code / devs)

Al trabajar en una funcionalidad, **consulta primero el `.md` del módulo correspondiente**
para respetar sus estándares sin afectar los otros módulos. Todo cambio de datos que cruce
módulos debe reflejarse primero en el contrato `MerchantCustomerSession` de `00-CORE`.

> Los tres módulos comparten el mismo estado del cliente: lo que la IA cierra en Sales le
> sirve al motorizado en Logistics y al bot de WhatsApp en Loyalty — sin re-preguntar datos.
