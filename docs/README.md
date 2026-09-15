# Documentación Kross

Kross es **la tecnología de una tienda en línea peruana**: una PWA white-label multi-tenant
donde cada marca tiene su app instalable en `marca.krossclub.app`. El pedido **se cobra
completo antes de despacharse** —con Yape validado automático, por Flow; la mitad solo si el
producto lo permite— y de ahí sigue las tres fases: **vender** → **entregar** → **retener**.

**Para quién (desde el 14-set-2026):** marcas **con stock**, que venden con contenido orgánico
y anuncios, formales, con menos de 100 pedidos al mes, dos a cuatro vendedores en WhatsApp
Web, y que cobran el 100 % antes de despachar. Todo en el contexto del celular.

> Empieza por [`ESTADO-OPERATIVO.md`](./ESTADO-OPERATIVO.md): qué está vivo, qué falta
> desplegar y qué deuda hay abierta. Después, el `.md` del módulo que vayas a tocar.

---

## Cinco capas

La doc se lee mejor sabiendo en qué capa está cada archivo, porque cada capa responde una
pregunta distinta:

| Capa | Pregunta que responde | Archivos |
|---|---|---|
| **1 · Estrategia** | *Por qué* y *para quién* | [`ICP Sales/`](./ICP%20Sales/) (enfoque 1, adquisición COD — histórico), [`ICP LTV/`](./ICP%20LTV/) (enfoque 2, retención; con la precisión del 14-set: marcas con stock), [`14-EVALUACION-KROSS-CLUB.md`](./14-EVALUACION-KROSS-CLUB.md) |
| **2 · Módulos del producto** | *Cómo* está construido cada fase | [`00-CORE-ARCHITECTURE.md`](./00-CORE-ARCHITECTURE.md), [`01-SALES-ENGINE.md`](./01-SALES-ENGINE.md), [`02-SMART-LOGISTICS.md`](./02-SMART-LOGISTICS.md), [`03-LOYALTY-ENGINE.md`](./03-LOYALTY-ENGINE.md), [`11-RELACIONES.md`](./11-RELACIONES.md) |
| **3 · Rieles e integraciones** | *Con quién* hablamos y qué nos obliga | [`12-FLOW.md`](./12-FLOW.md) (el riel de cobro), [`06-360PAY.md`](./06-360PAY.md) y [`07-CONTRATO-360PAY.md`](./07-CONTRATO-360PAY.md) (dormidos desde set-2026), [`13-CONEXIONES.md`](./13-CONEXIONES.md), [`09-PIXELS-CAPI.md`](./09-PIXELS-CAPI.md), [`08-RECORDATORIOS-RECOJO.md`](./08-RECORDATORIOS-RECOJO.md), [`15-AFILIADOS.md`](./15-AFILIADOS.md), [`16-NUBEFACT.md`](./16-NUBEFACT.md) (la boleta electrónica) |
| **4 · Marca y web pública** | *Cómo se ve* y *qué dice* hacia fuera | [`10-MANUAL-DE-MARCA.md`](./10-MANUAL-DE-MARCA.md), [`04-CUMPLIMIENTO-WEB.md`](./04-CUMPLIMIENTO-WEB.md) |
| **5 · Operación** | *Qué está pasando* y *cómo trabajamos* | [`ESTADO-OPERATIVO.md`](./ESTADO-OPERATIVO.md), [`GIT-FLOW.md`](./GIT-FLOW.md) |

## Tres géneros

No todos los `.md` son lo mismo, y confundirlos es leer un diario como si fuera un contrato:

- **Spec** — dice cómo *es* algo hoy: contratos, tablas, reglas. Se edita cuando el código
  cambia. `00`, `01`, `02`, `03`, `09`, `10`, `12`, `13`, `15`, `16`.
- **Bitácora** — dice qué *pasó* y por qué se decidió: entradas con fecha, de la más nueva a
  la más vieja. No se reescribe, se le agrega. `ESTADO-OPERATIVO`, la segunda mitad de `11`,
  `06` y `07` (360pay), `14`.
- **Lista de requisitos** — dice qué *falta* para un hito, con estado por ítem. Muere cuando
  el hito se cumple. `04` (la herencia de Culqi, ya marcada), `08` (plantillas por aprobar).

Estado marcado con ✅ construido · 🟡 parcial · 🔮 planeado · 💤 dormido.

## Regla de ejecución (para Claude Code / devs)

Al trabajar en una funcionalidad, **consulta primero el `.md` del módulo correspondiente**
para respetar sus estándares sin afectar los otros módulos. Todo cambio de datos que cruce
módulos debe reflejarse primero en el contrato `MerchantCustomerSession` de `00-CORE`.

> Los tres módulos comparten el mismo estado del cliente: lo que Sales cierra le sirve al
> motorizado en Logistics y a la campaña de WhatsApp en Loyalty — sin re-preguntar datos.

## Regla del demo

`src/lib/demo/` llena el panel con una tienda de ejemplo (~100 pedidos al día, 3.000 al mes,
tres productos de marca). **La regla es paridad**: lo que el demo enseña es exactamente lo que
la tienda real hace, y lo que se construye para la real se enseña en el demo. Al tocar el
generador, nunca agregues una tirada de azar.
