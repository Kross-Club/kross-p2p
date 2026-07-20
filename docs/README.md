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
