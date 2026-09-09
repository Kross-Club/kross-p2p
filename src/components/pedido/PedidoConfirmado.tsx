// ─── Pedido confirmado: el ticket y el recorrido ─────────────────────────────
// Lo que el comprador ve cuando su pedido ya existe. Vivía DENTRO del modal del
// checkout (`OrderDone`) y por eso era frágil: una X y no se veía nunca más.
// Desde el 07-set-2026 tiene URL propia (`/pedido/:token`, `MiPedidoPage`), que
// es lo que la hace recargable — y recargar es justo lo que hace el comprador
// para ver si su envío avanzó.
//
// Este archivo solo PINTA. El ticket se lo dan armado: desde el checkout con el
// estado del formulario, y desde la página con la fila del pedido
// (`ticket-desde-pedido.ts`). Así la misma pantalla sirve a los dos sin que
// ninguno sepa del otro.
//
// Regla dura del módulo: **al comprador nunca se le dice que su pago no
// existe.** Si el adelanto no está cobrado, para él sigue siendo un pedido
// registrado que un asesor va a coordinar. Eso lo resuelve `buildTicket`.
//
// Tres bloques, en orden:
//
//   1. EL TICKET: qué pidió, dónde lo recoge y con qué dirección, a nombre de
//      quién, y su guía con número apenas exista. Diseñado para capturarse.
//      SIN el teléfono de la tienda (09-set-2026): la atención va por el chat
//      del pedido y nada más. Una llamada no deja rastro en el hilo, no la ve
//      el equipo que sigue el pedido, y abre un canal que nadie mide ni puede
//      atender a la hora en que el comprador llame. El número sigue guardado en
//      `stores.wa_display_phone` para lo que el vendedor configure, pero al
//      comprador no se le ofrece.
//   2. EL RECORRIDO: en qué va el pedido y qué viene, como una línea vertical
//      de puntos. El saldo y el DNI no son cajas sueltas que gritan: son el
//      detalle del paso donde tocan.
//   3. LA APP: "¿te avisamos cuando llegue?" con un solo botón. En Android sale
//      el aviso del sistema y, al aceptar, se activan los avisos y se abre el
//      pedido. En iPhone Apple no deja instalar con un clic: se enseñan los dos
//      toques. Y el chat ya no se ofrece desde acá: seguimiento y consultas son
//      cosa de la app —el ticket, la guía y el teléfono sostienen al que no la
//      instala—.

import { useEffect, useState } from 'react'
import { Check, Download, ExternalLink, Smartphone, Wallet } from 'lucide-react'
import { COPY } from '../../lib/checkout/checkout.config'
import type { Ticket, TicketStep } from '../../lib/checkout/ticket'
import { useStore } from '../../lib/store-context'
import BajoLaMarca from './BajoLaMarca'
import Flotante from '../Flotante'
import { cajaDeLaMarca, ESQUINAS_DEL_PEDIDO, estiloValido, fondoDeMarca, tintaSobreDegradado } from '../../lib/degradado'
import { subscribePush } from '../../lib/push'
import { useIsDesktop } from '../../lib/use-desktop'
import { AndroidSteps, IOSInstallVideo, isInstalled } from '../InstallBanner'

interface Props {
  /** Ya armado por quien llama: el checkout desde el formulario, la página
   *  desde la fila del pedido. Esta pantalla no consulta nada. */
  ticket: Ticket
  orderCode: string
  /** Id del pedido: a él se suscribe el push cuando el comprador instala. */
  sessionId?: string | null
}

export default function PedidoConfirmado({ ticket, orderCode, sessionId }: Props) {
  const { store } = useStore()

  // La cabecera lleva el FONDO DE LA MARCA, que no es un color plano: es el
  // degradado de sus dos colores con la inclinación que eligió en el panel
  // (09-set-2026), el mismo que pinta su acceso y el menú de su vendedor. Un
  // color plano acá y un degradado allá eran dos marcas distintas en la misma
  // app.
  //
  // La tinta se elige por CONTRASTE, y contra la MEZCLA de los dos: el
  // comerciante puede poner un naranja, un amarillo o un azul casi negro, y el
  // título —su nombre y la frase del dinero— tiene que leerse en los tres. Un
  // degradado no tiene una sola respuesta, y la mezcla es la que acierta en el
  // medio, que es donde está casi todo el texto (`lib/degradado.ts`).
  const marca = store.color_primary || '#55C8F5'
  const secundario = store.color_dark || marca
  const fondo = fondoDeMarca(marca, secundario, estiloValido(store.gradient_style), store.id ?? store.slug ?? '')
  const { tinta, suave: tintaSuave } = tintaSobreDegradado(marca, secundario)
  // La caja de la marca, si la subió: enmarca las dos esquinas de arriba.
  const caja = cajaDeLaMarca(store.login_images)

  return (
    <div>
      {/* ── La cabecera de la marca ──
          El color llega hasta DEBAJO del ticket y ahí corta: la boleta se
          queda en su rectángulo blanco, recortada contra el color, y lo que
          viene después respira en blanco.

          `overflow-hidden` es lo que hace que las cajas de las esquinas MUERDAN
          el borde en vez de desbordar la página: sin él, un PNG saliendo por la
          derecha estira el ancho del documento y aparece una barra horizontal
          en el celular. */}
      <div className="relative overflow-hidden px-5 pt-5 pb-11 -mx-5" style={{ background: fondo }}>

        {/* La caja de la marca, en las dos esquinas de arriba y meciéndose:
            la misma imagen del acceso, volteada de un lado y con otro ritmo
            (`ESQUINAS_DEL_PEDIDO`). Va DEBAJO de todo lo demás —el ticket es el
            que manda acá— y no se pinta nada si la marca no la subió. */}
        {caja && (
          <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
            {ESQUINAS_DEL_PEDIDO.map((sitio, i) => <Flotante key={i} src={caja} sitio={sitio} />)}
          </div>
        )}

        <div className="relative flex justify-center mb-4" style={{ zIndex: 1 }}>
          <FirmaDeMarca nombre={store.nombre} ancho={store.logo_wide_url} cuadrado={store.logo_url} tinta={tinta} />
        </div>

        <div className="relative text-center mb-4" style={{ zIndex: 1 }}>
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ background: '#DCFCE7' }}
          >
            <Check size={28} strokeWidth={3} style={{ color: '#16A34A' }} />
          </div>
          <h2 className="text-xl font-black mb-1" style={{ color: tinta }}>{COPY.doneTitle}</h2>
          {/* La primera frase es el dinero: es lo que acaba de soltar. */}
          <p className="text-sm font-bold px-4" style={{ color: tintaSuave }}>
            {ticket.payment}
          </p>
        </div>

        <div className="relative" style={{ zIndex: 1 }}>
          <TicketDelPedido ticket={ticket} orderCode={orderCode} />
        </div>
      </div>

      {/* De la franja de la marca al blanco: la curva hacia abajo, y el `-mx-5`
          con su `px-5` para que el panel llegue a los bordes como la franja. */}
      <BajoLaMarca fondo="#fff" className="-mx-5 px-5">
        {/* ── El recorrido ── */}
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 pt-5 mb-2 px-1">{COPY.doneTimelineTitle}</p>
        <Recorrido pasos={ticket.pasos} />

        {/* ── La app ── */}
        <InstalarApp sessionId={sessionId} nombre={store.nombre} logo={store.logo_url} />
      </BajoLaMarca>
    </div>
  )
}

/**
 * El ticket, suelto: qué pidió, dónde lo recoge o a dónde llega, a nombre de
 * quién, su guía y el teléfono de la marca. Lo pintan dos pantallas —esta y la
 * hoja «Ver pedido» del chat (`DetalleDelPedido`)— y por eso vive aparte:
 * una captura del ticket tiene que decir lo mismo venga de donde venga.
 */
export function TicketDelPedido({ ticket, orderCode }: { ticket: Ticket; orderCode: string }) {
  const { store } = useStore()
  return (
    <div className="rounded-2xl border-2 border-gray-900 overflow-hidden bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 text-white">
        <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">
          {store.nombre || 'Tu pedido'}
        </span>
        <span className="text-base font-black tabular-nums">{orderCode}</span>
      </div>

      <dl className="divide-y divide-gray-100">
        {ticket.lines.map(l => (
          <div key={l.label} className="px-4 py-3 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{l.label}</dt>
              {/* `aside` va AL COSTADO del valor —el DNI pegado al nombre—, y
                  cae debajo solo si no entra: en el mostrador se leen juntos. */}
              <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[15px] font-bold text-gray-900 leading-snug">{l.value}</span>
                {l.aside && <span className="text-sm font-bold text-gray-500 tabular-nums">{l.aside}</span>}
              </dd>
              {l.detail && <dd className="text-sm text-gray-600 leading-snug mt-0.5">{l.detail}</dd>}
            </div>
            {/* La foto del pack que compró, al costado de su nombre
                (09-set-2026). Un ticket que se manda por WhatsApp para que
                alguien más lo recoja se entiende mejor con la foto de lo que
                va a recoger que con «Pack Mono Loco».

                `object-contain` y NO `cover`: la gracia de la foto de un pack
                es que se vean las tres unidades, y recortar para llenar el
                cuadrado le corta una — enseñaría menos de lo que compró. Si la
                URL muere se esconde sola: esta pantalla se guarda como captura
                y el ícono de imagen rota se guardaría con ella. */}
            {l.image && (
              <img
                src={l.image} alt="" aria-hidden
                onError={e => { e.currentTarget.hidden = true }}
                className="w-16 h-16 rounded-xl object-contain flex-shrink-0 bg-gray-50 p-1"
              />
            )}
          </div>
        ))}

        {/* La guía: el NÚMERO como línea, porque es lo que la agencia
            pregunta y una captura no tiene botones; el botón debajo. */}
        {ticket.guide && (
          <div className="px-4 py-3">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{ticket.guide.line.label}</dt>
            <dd className="text-[15px] font-bold text-gray-900 leading-snug tabular-nums">{ticket.guide.line.value}</dd>
            <dd className="mt-2">
              <a
                href={ticket.guide.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-black
                  bg-gray-900 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
              >
                {COPY.doneSeeGuide} {ticket.guide.button} <ExternalLink size={13} />
              </a>
            </dd>
          </div>
        )}

      </dl>
    </div>
  )
}

/**
 * La marca encabezando su propia pantalla.
 *
 * Con logo APAISADO va él solo: un lockup ya trae el nombre dibujado como la
 * marca quiere que se lea, y repetirlo al lado lo dice dos veces y peor —la
 * misma regla que `BrandMark` en el panel—. Sin él, el cuadrado y el nombre
 * escrito con la tinta que contrasta.
 */
export function FirmaDeMarca({ nombre, ancho, cuadrado, tinta, compacta }: {
  nombre: string; ancho?: string | null; cuadrado: string | null; tinta: string
  /** En la cabecera del chat, donde comparte la fila con la flecha y el teléfono. */
  compacta?: boolean
}) {
  if (ancho) {
    return <img src={ancho} alt={nombre} className={compacta ? 'h-8 max-w-[160px] object-contain' : 'h-9 max-w-[200px] object-contain'} />
  }
  return (
    <div className="flex items-center gap-2">
      {cuadrado && (
        <img src={cuadrado} alt="" aria-hidden className="w-8 h-8 rounded-xl object-contain bg-white/90 p-0.5" />
      )}
      <span className="text-base font-black tracking-tight" style={{ color: tinta }}>{nombre}</span>
    </div>
  )
}

/** La línea vertical de puntos: lo hecho en verde, lo actual con el color de
 *  la marca y latiendo, lo que viene en gris. */
export function Recorrido({ pasos }: { pasos: TicketStep[] }) {
  return (
    <ol className="relative mb-6 pl-1">
      {pasos.map((p, i) => {
        const ultimo = i === pasos.length - 1
        const color = p.estado === 'hecho' ? '#16A34A' : p.estado === 'actual' ? 'var(--brand)' : '#D1D5DB'
        return (
          <li key={p.label} className="relative flex gap-3 pb-5">
            {!ultimo && (
              <span aria-hidden className="absolute left-[9px] top-5 bottom-0 w-0.5"
                style={{ background: p.estado === 'hecho' ? '#16A34A' : '#E5E7EB' }} />
            )}
            <span aria-hidden className="relative mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: color, boxShadow: p.estado === 'actual' ? '0 0 0 4px color-mix(in srgb, var(--brand) 25%, transparent)' : undefined }}>
              {p.estado === 'hecho' && <Check size={12} strokeWidth={3.5} className="text-white" />}
              {p.estado === 'actual' && <span className="w-2 h-2 rounded-full bg-white" />}
            </span>
            <div className="min-w-0">
              <p className={`text-[15px] leading-snug ${p.estado === 'pendiente' ? 'text-gray-400 font-bold' : 'text-gray-900 font-black'}`}>
                {p.label}
              </p>
              {p.detail && (
                <p className={`text-sm leading-snug mt-0.5 ${p.estado === 'pendiente' ? 'text-gray-400' : 'text-gray-600'}`}>
                  {p.detail}
                </p>
              )}
              {/* El botón que traerá ese paso, apagado. Se enseña para que lo
                  reconozca cuando de verdad se encienda; `disabled` de verdad,
                  no un dibujo, para que ni el teclado ni el lector de pantalla
                  lo ofrezcan. */}
              {p.accion && (
                <button type="button" disabled
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-black
                    bg-gray-100 text-gray-400 cursor-not-allowed">
                  <Wallet size={14} strokeWidth={2.5} /> {p.accion}
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// El «¡Listo! Ya tienes la app» es el ACUSE del toque que acaba de dar, no un
// estado guardado (08-set-2026). Se recordaba en `localStorage` y sobrevivía a
// todo, así que quien recargaba la página —o volvía días después a mirar su
// envío— se encontraba con una tarjeta que solo dice «búscala en tu celular» y
// ningún botón. Eso es un callejón sin salida, y por partida doble: nada
// avisa cuando el comprador DESINSTALA la app, así que el recuerdo podía ser
// falso y no había forma de volver a ofrecérsela nunca más.
//
// Ahora vive en el estado del componente y se va con la recarga: mientras la
// página siga abierta se ve la confirmación, y la siguiente carga vuelve a
// ofrecer el botón. Ofrecer de más no cuesta nada —quien ya la tiene lo sabe y
// lo ignora—; ofrecer de menos cuesta un comprador que se queda sin avisos.

/**
 * "¿Te avisamos cuando llegue?" y el botón de la app. Reusa el aviso de
 * instalación que `main.tsx` guarda en `__deferredInstallPrompt`.
 *
 * Al aceptar NO se navega a ningún lado (07-set-2026). Antes abría el chat, y
 * eso tenía sentido cuando esta pantalla era una ventana que se cerraba: había
 * que llevarlo a alguna parte. Ahora el comprador está en su pedido y Android
 * está instalando la app en ese mismo momento — moverlo de página es quitarle
 * de encima justo lo que vino a mirar. Lo que hace falta es enseñarle el ÍCONO
 * que va a tener que buscar en su celular, y eso es lo que se queda en
 * pantalla, también si vuelve más tarde.
 */
function InstalarApp({ sessionId, nombre, logo }: {
  /** Id del pedido: a él se suscribe el push cuando el comprador instala. */
  sessionId?: string | null; nombre: string; logo: string | null
}) {
  const desktop = useIsDesktop()
  const [prompt, setPrompt] = useState<{ prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(
    () => (typeof window !== 'undefined' ? (window as { __deferredInstallPrompt?: never }).__deferredInstallPrompt ?? null : null),
  )
  // Dentro de la app no hay nada que ofrecer; en el navegador, lo que se
  // recordó de una instalación anterior.
  const dentroDeLaApp = typeof window !== 'undefined' && isInstalled()
  // Arranca en falso SIEMPRE: es el acuse de esta visita, no un estado guardado.
  const [instalada, setInstalada] = useState(false)
  const [ayuda, setAyuda] = useState(false)
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

  useEffect(() => {
    const ready = () => setPrompt((window as { __deferredInstallPrompt?: never }).__deferredInstallPrompt ?? null)
    // Android confirma la instalación por su cuenta, la haya pedido este botón
    // o el menú del navegador.
    const installed = () => setInstalada(true)
    window.addEventListener('install-prompt-ready', ready)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('install-prompt-ready', ready)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])

  const instalar = async () => {
    if (!prompt) { setAyuda(true); return }
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    ;(window as { __deferredInstallPrompt?: unknown }).__deferredInstallPrompt = null
    setPrompt(null)
    if (outcome !== 'accepted') return
    // Los avisos son la razón por la que instaló: se piden en el mismo gesto.
    if (sessionId) await subscribePush({ sessionId, role: 'buyer' }).catch(() => {})
    setInstalada(true)
  }

  // Viéndolo DENTRO de la app no hay nada que ofrecer: ya está instalada y el
  // pedido es lo que tiene delante.
  if (dentroDeLaApp) return null

  // Ya la tiene: lo único útil es el ícono con el que va a encontrarla. Sin
  // botón — mandarlo a otra página ahora es sacarlo de su pedido.
  if (instalada) {
    return (
      <div className="rounded-2xl px-4 py-5 text-center"
        style={{ background: 'color-mix(in srgb, var(--brand) 8%, white)', border: '0.5px solid color-mix(in srgb, var(--brand) 35%, transparent)' }}>
        <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center overflow-hidden"
          style={{ background: 'var(--brand)' }}>
          {logo
            ? <img src={logo} alt={nombre} className="w-full h-full object-contain p-1.5" />
            : <Smartphone size={26} className="text-white" />}
        </div>
        <p className="text-base font-black text-gray-900 leading-snug mt-3">{COPY.doneInstallReady}</p>
        <p className="text-sm text-gray-600 leading-snug mt-1 px-2">{COPY.doneInstallFind(nombre)}</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl px-4 pt-4 pb-5 text-center"
      style={{ background: 'color-mix(in srgb, var(--brand) 8%, white)', border: '0.5px solid color-mix(in srgb, var(--brand) 35%, transparent)' }}>
      <Ilustracion logo={logo} nombre={nombre} />
      <p className="text-base font-black text-gray-900 leading-snug mt-3">{COPY.doneInstallQuestion}</p>
      <p className="text-sm text-gray-600 leading-snug mt-1 px-2">{COPY.doneInstallBody(nombre)}</p>

      {isIOS ? (
        // El video en vez de la lista: los cuatro toques se entienden viéndolos
        // y no leyéndolos. Solo acá, al final de la confirmación, donde hay
        // sitio y el comprador acaba de terminar y está mirando.
        <div className="mt-3 flex flex-col items-center">
          <p className="text-xs text-gray-500 mb-1">{COPY.doneInstallIos}</p>
          <IOSInstallVideo />
        </div>
      ) : (
        <>
          <button type="button" onClick={instalar}
            className="mt-4 flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-black text-base text-white
              focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ background: 'var(--brand)' }}>
            <Download size={18} strokeWidth={2.5} /> {COPY.doneInstallCta}
          </button>
          <p className="text-[11px] text-gray-500 mt-2">{COPY.doneInstallSub}</p>
          {/* El navegador no dio el aviso de instalar (ya se rechazó una vez, o
              este Chrome no lo ofrece). Se enseña el camino del menú con las
              palabras exactas que va a leer, no una etiqueta inventada. */}
          {ayuda && (desktop
            ? <p className="text-[11px] text-gray-500 mt-2 px-2">{COPY.doneInstallDesktop}</p>
            : (
              <div className="mt-3">
                <p className="text-[11px] text-gray-500 mb-1">{COPY.doneInstallHelp}</p>
                <div className="flex justify-center"><AndroidSteps /></div>
              </div>
            ))}
        </>
      )}
    </div>
  )
}

/** Un celular recibiendo los avisos del pedido, con el logo de la marca en la
 *  pantalla. Dibujado, no una foto: se pinta con el color de cada marca. */
function Ilustracion({ logo, nombre }: { logo: string | null; nombre: string }) {
  return (
    <div className="relative mx-auto w-[168px] h-[120px]" aria-hidden>
      <svg viewBox="0 0 168 120" className="w-full h-full">
        <rect x="58" y="6" width="52" height="108" rx="10" fill="#111827" />
        <rect x="62" y="12" width="44" height="96" rx="7" fill="#FFFFFF" />
        <rect x="76" y="14" width="16" height="3" rx="1.5" fill="#111827" />
        <g>
          <rect x="14" y="30" width="66" height="22" rx="7" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
          <rect x="21" y="36" width="10" height="10" rx="3" fill="var(--brand)" />
          <rect x="36" y="36" width="34" height="3.5" rx="1.75" fill="#111827" />
          <rect x="36" y="43" width="24" height="3" rx="1.5" fill="#9CA3AF" />
        </g>
        <g>
          <rect x="88" y="58" width="66" height="22" rx="7" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
          <rect x="95" y="64" width="10" height="10" rx="3" fill="#16A34A" />
          <rect x="110" y="64" width="34" height="3.5" rx="1.75" fill="#111827" />
          <rect x="110" y="71" width="20" height="3" rx="1.5" fill="#9CA3AF" />
        </g>
        <circle cx="84" cy="94" r="3" fill="var(--brand)" />
      </svg>
      <div className="absolute left-1/2 top-[38px] -translate-x-1/2 w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center"
        style={{ background: 'var(--brand)' }}>
        {/* `object-contain`, no `cover` (07-set-2026): recortar un logo que ya
            trae su propio aire lo dejaba visiblemente corrido dentro del
            cuadrado. Contenido y con margen se ve entero y centrado. */}
        {logo
          ? <img src={logo} alt={nombre} className="w-full h-full object-contain p-1" />
          : <Smartphone size={18} className="text-white" />}
      </div>
    </div>
  )
}
