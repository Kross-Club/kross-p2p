// ─── SALES ENGINE · UI del Checkout Guiado tipo Quiz ─────────────────────────────
// Popup bottom-sheet paso-a-paso que CONSUME la máquina de estados pura
// `checkoutReducer` (src/lib/checkout-flow.ts) y escribe customer + delivery + sale
// del estado central al cerrar (register-buyer). El Voice Closer (useVoiceCloser) lee
// este MISMO estado para guiar por voz — dormido hasta configurar el agente.
// Ver docs/01-SALES-ENGINE.md (Pendiente #1).

import { useEffect, useReducer, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ArrowLeft, ShieldCheck, Navigation, Truck, Store, Check, Copy } from 'lucide-react'
import {
  checkoutReducer, initialCheckoutState, stepsFor, canAdvance, requiresAdvance,
  DEFAULT_ADVANCE_PEN, type CheckoutState, type CheckoutStep,
} from '../../lib/checkout-flow'
import type { AgencyName } from '../../lib/session'
import { useVoiceCloser } from '../../lib/useVoiceCloser'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const COUNTRIES = [
  { code: '51', flag: '🇵🇪', name: 'Perú', len: 9 },
  { code: '52', flag: '🇲🇽', name: 'México', len: 10 },
  { code: '57', flag: '🇨🇴', name: 'Colombia', len: 10 },
  { code: '56', flag: '🇨🇱', name: 'Chile', len: 9 },
  { code: '593', flag: '🇪🇨', name: 'Ecuador', len: 9 },
  { code: '54', flag: '🇦🇷', name: 'Argentina', len: 10 },
  { code: '591', flag: '🇧🇴', name: 'Bolivia', len: 8 },
  { code: '1', flag: '🇺🇸', name: 'USA', len: 10 },
]

const AGENCIES: AgencyName[] = ['SHALOM', 'OLVA', 'OTRO']

export interface Pack { nombre: string; descripcion?: string; precio: number }
export interface Product { id: string; store_id: string | null; nombre: string; precio: number; images: string[]; packs: Pack[] }
export interface BuyerAccount { id: string; nombre: string; phone: string; document_type: string; document_number: string; score: number; puntos: number }

const STEP_LABEL: Record<CheckoutStep, string> = {
  contacto: 'Tus datos', entrega: 'Entrega', pago_adelanto: 'Adelanto', confirmado: 'Confirmar',
}

// Estado inicial: si el comprador ya tiene cuenta, precargamos identidad y saltamos
// directo a la entrega (menos fricción — el objetivo del módulo).
function makeInitial(packIdx: number, acc: BuyerAccount | null): CheckoutState {
  const base = initialCheckoutState(packIdx)
  if (!acc) return base
  return {
    ...base,
    step: 'entrega',
    answers: {
      ...base.answers,
      documentNumber: acc.document_number ?? '',
      resolvedName: acc.nombre ?? null,
      whatsapp: (acc.phone ?? '').replace(/^51/, ''),
    },
  }
}

// Colecta lecturas GPS unos segundos y se queda con la más precisa (el pin cae en la
// casa, no en el primer fix grueso de la vía). Mismo enfoque que AddressBar.
function getBestFix(): Promise<GeolocationCoordinates | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    let best: GeolocationCoordinates | null = null
    let done = false
    const finish = () => { if (done) return; done = true; try { navigator.geolocation.clearWatch(id) } catch { /* */ } resolve(best) }
    const start = Date.now()
    const id = navigator.geolocation.watchPosition(
      p => {
        if (!best || p.coords.accuracy < best.accuracy) best = p.coords
        if (best.accuracy <= 8 && Date.now() - start > 3500) finish()
      },
      () => { if (!best) finish() },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    )
    setTimeout(finish, 10000)
  })
}

export default function CheckoutQuiz({ product, packs, initialPackIdx, buyerAccount, onClose }: {
  product: Product
  packs: Pack[]           // ya ordenados (menor → mayor precio)
  initialPackIdx: number
  buyerAccount: BuyerAccount | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [account, setAccount] = useState<BuyerAccount | null>(buyerAccount)
  const [state, dispatch] = useReducer(checkoutReducer, null, () => makeInitial(initialPackIdx, buyerAccount))

  const [country, setCountry] = useState(COUNTRIES[0])
  const [looking, setLooking] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [locating, setLocating] = useState(false)
  const [copied, setCopied] = useState(false)

  const a = state.answers
  const flow = stepsFor(a)
  const stepIdx = flow.indexOf(state.step)
  const pack = packs[a.packIdx] ?? packs[initialPackIdx] ?? { nombre: product.nombre, precio: product.precio }
  const precio = pack?.precio ?? product.precio

  // El Voice Closer lee ESTE estado (dormido si no hay VITE_ELEVENLABS_AGENT_ID).
  useVoiceCloser(state)

  // Autocompleta y valida el nombre desde el DNI (RENIEC vía Decolecta).
  useEffect(() => {
    if (account) return
    setNotFound(false)
    const dni = a.documentNumber.replace(/\D/g, '')
    if (dni.length !== 8) { if (a.resolvedName) dispatch({ type: 'SET_DNI', documentNumber: a.documentNumber, resolvedName: null }); return }
    let alive = true
    setLooking(true)
    fetch(`${BASE}/dni-lookup`, {
      method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_number: dni }),
    })
      .then(r => r.json())
      .then(d => { if (!alive) return; dispatch({ type: 'SET_DNI', documentNumber: a.documentNumber, resolvedName: d?.nombre ?? null }); setNotFound(!d?.nombre) })
      .catch(() => { if (alive) setNotFound(true) })
      .finally(() => { if (alive) setLooking(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.documentNumber, account])

  const capturePin = async () => {
    if (locating) return
    setLocating(true)
    try {
      const coords = await getBestFix()
      if (!coords) { alert('Activa tu ubicación GPS para fijar tu dirección de entrega.'); return }
      if (typeof coords.accuracy === 'number' && coords.accuracy > 80) {
        alert(`Tu ubicación es poco precisa (±${Math.round(coords.accuracy)} m). Sal a un lugar abierto o párate en tu puerta e inténtalo de nuevo. Mejor desde el celular.`)
        return
      }
      dispatch({ type: 'SET_PIN', lat: coords.latitude, lng: coords.longitude })
    } finally {
      setLocating(false)
    }
  }

  const clearAccount = () => {
    setAccount(null)
    dispatch({ type: 'SET_DNI', documentNumber: '', resolvedName: null })
    dispatch({ type: 'SET_WHATSAPP', whatsapp: '' })
  }

  const handleSubmit = async () => {
    if (state.submitting) return
    dispatch({ type: 'SUBMITTING', value: true })
    try {
      const documentNumber = a.documentNumber || account?.document_number || ''
      const res = await fetch(`${BASE}/register-buyer`, {
        method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: product.store_id,
          product_id: product.id,
          product_name: product.nombre,
          product_price: precio,
          pack_name: pack?.nombre ?? null,
          buyer_name: account?.nombre ?? a.resolvedName ?? '',
          buyer_phone: account ? account.phone : `${country.code}${a.whatsapp}`,
          document_type: 'DNI',
          document_number: documentNumber,
          // Estado central · delivery
          address: a.addressText ?? null,
          address_lat: a.lat ?? undefined,
          address_lng: a.lng ?? undefined,
          dispatch_type: a.deliveryType ?? 'MOTORIZADO_LIMA',
          agency_name: a.agencyName ?? undefined,
          delivery_reference: a.reference ?? undefined,
          // Estado central · sale
          payment_method: a.paymentMethod,
          closed_by: 'DIRECT_CHECKOUT',
          advance_op_number: a.advanceOpNumber ?? undefined,
        }),
      })
      if (res.ok) {
        const { token } = await res.json() as { token: string }
        // Loguea al comprador para que su "Mis pedidos" + score funcionen luego.
        try {
          const lr = await fetch(`${BASE}/buyer-login`, {
            method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ document_number: documentNumber, store_id: product.store_id }),
          })
          if (lr.ok) {
            const session = await lr.json()
            localStorage.setItem('buyer_session', JSON.stringify(session))
            window.dispatchEvent(new Event('buyer-session-changed'))
          }
        } catch { /* no bloqueante */ }
        dispatch({ type: 'CONFIRMED' })
        navigate(`/p/${token}`)
        return
      }
      alert('No se pudo registrar el pedido. Intenta de nuevo.')
    } catch {
      alert('Error de conexión. Intenta de nuevo.')
    } finally {
      dispatch({ type: 'SUBMITTING', value: false })
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[500px] bg-white rounded-t-3xl z-50 overflow-y-auto max-h-[95vh]">
        {/* Handle + cerrar */}
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center z-10"><X size={16} className="text-gray-500" /></button>

        {/* Stepper */}
        <div className="px-5 pt-1">
          <div className="flex items-center gap-1.5">
            {flow.map((st, i) => (
              <div key={st} className="flex-1 h-1.5 rounded-full transition-colors" style={{ background: i <= stepIdx ? '#16A34A' : '#E5E7EB' }} />
            ))}
          </div>
          <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mt-1.5">
            Paso {stepIdx + 1} de {flow.length} · {STEP_LABEL[state.step]}
          </p>
        </div>

        <div className="px-5 pb-8 pt-3">
          {/* ── PASO CONTACTO ─────────────────────────────────────────────── */}
          {state.step === 'contacto' && (
            <>
              <h2 className="text-xl font-black text-gray-900 mb-0.5">¡Un paso más! 🎉</h2>
              <p className="text-sm text-gray-500 mb-4">Elige tu pack y validamos tu identidad en segundos.</p>

              {packs.length > 0 && (
                <div className="mb-4 space-y-2">
                  {packs.map((p, i) => {
                    const active = a.packIdx === i
                    const isBest = i === packs.length - 1 && packs.length > 1
                    return (
                      <button key={i} onClick={() => dispatch({ type: 'SET_PACK', packIdx: i })}
                        className={`relative w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 text-left transition-all ${active ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                        {isBest && <span className="absolute -top-2 left-4 text-[9px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: '#16A34A' }}>⭐ MÁS ELEGIDO · MEJOR PRECIO</span>}
                        <div>
                          <p className={`text-sm font-black ${active ? 'text-green-800' : 'text-gray-800'}`}>{p.nombre}</p>
                          <p className="text-[10px] text-gray-400">{p.descripcion || (i > 0 ? '¡Aprovecha y ahorra!' : 'Opción básica')}</p>
                        </div>
                        <p className={`text-lg font-black ${active ? 'text-green-600' : 'text-gray-700'}`}>S/{p.precio}</p>
                      </button>
                    )
                  })}
                </div>
              )}

              {account ? (
                <div className="mb-1 p-3 rounded-2xl flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #060C1A, #0D1F3C)', border: '1.5px solid rgba(125,232,255,0.3)' }}>
                  <span className="text-lg">⚡</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black" style={{ color: '#7DE8FF' }}>Comprando como {account.nombre?.split(' ')[0] || 'ti'}</p>
                    <p className="text-xs" style={{ color: 'rgba(125,232,255,0.5)' }}>{account.document_type} {account.document_number} · Score {account.score}/100</p>
                  </div>
                  <button onClick={clearAccount} className="text-xs px-2 py-1 rounded-lg self-start" style={{ color: 'rgba(125,232,255,0.5)', background: 'rgba(255,255,255,0.05)' }}>Cambiar</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-gray-600 mb-1 block">Tu DNI *</label>
                    <input value={a.documentNumber}
                      onChange={e => dispatch({ type: 'SET_DNI', documentNumber: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                      placeholder="Tus 8 dígitos" type="tel" inputMode="numeric"
                      className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none font-mono tracking-widest" />
                    {looking && <p className="text-[11px] text-gray-400 mt-1.5">Validando tu DNI…</p>}
                    {a.resolvedName && (
                      <div className="mt-1.5 flex items-center gap-1.5 rounded-xl px-3 py-2" style={{ background: '#F0FDF4', border: '1px solid #86EFAC' }}>
                        <ShieldCheck size={14} className="text-green-600 flex-shrink-0" />
                        <p className="text-xs font-black text-green-800 truncate">{a.resolvedName}</p>
                      </div>
                    )}
                    {notFound && !looking && <p className="text-[11px] mt-1.5 font-semibold" style={{ color: '#DC2626' }}>No pudimos validar ese DNI. Revisa los 8 dígitos.</p>}
                    {!a.resolvedName && !looking && !notFound && (
                      <p className="text-[11px] text-gray-400 mt-1.5 flex items-start gap-1">
                        <ShieldCheck size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
                        Con tu DNI validamos tu identidad y guardamos tu historial. Es seguro y no lo compartimos.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-600 mb-1 block">Tu WhatsApp *</label>
                    <div className="flex gap-2">
                      <select value={country.code}
                        onChange={e => { const c = COUNTRIES.find(x => x.code === e.target.value)!; setCountry(c); dispatch({ type: 'SET_WHATSAPP', whatsapp: a.whatsapp.slice(0, c.len) }) }}
                        className="bg-gray-100 rounded-2xl px-2 py-3 text-sm outline-none font-bold text-gray-700 flex-shrink-0">
                        {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} +{c.code}</option>)}
                      </select>
                      <input value={a.whatsapp} onChange={e => dispatch({ type: 'SET_WHATSAPP', whatsapp: e.target.value.replace(/\D/g, '').slice(0, country.len) })}
                        placeholder={`${country.len} dígitos`} type="tel" inputMode="numeric"
                        className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none" />
                    </div>
                    {a.whatsapp.length > 0 && a.whatsapp.length !== country.len && (
                      <p className="text-[11px] text-amber-600 mt-1">Ingresa los {country.len} dígitos de tu número en {country.name}.</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── PASO ENTREGA ──────────────────────────────────────────────── */}
          {state.step === 'entrega' && (
            <>
              <h2 className="text-xl font-black text-gray-900 mb-0.5">¿Dónde te lo entregamos?</h2>
              <p className="text-sm text-gray-500 mb-4">Elige cómo prefieres recibir tu pedido.</p>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <button onClick={() => dispatch({ type: 'SET_DELIVERY_TYPE', deliveryType: 'MOTORIZADO_LIMA' })}
                  className={`flex flex-col items-center gap-1.5 px-3 py-4 rounded-2xl border-2 transition-all ${a.deliveryType === 'MOTORIZADO_LIMA' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                  <Truck size={22} className={a.deliveryType === 'MOTORIZADO_LIMA' ? 'text-green-600' : 'text-gray-400'} />
                  <span className={`text-sm font-black ${a.deliveryType === 'MOTORIZADO_LIMA' ? 'text-green-800' : 'text-gray-700'}`}>Lima · a mi puerta</span>
                  <span className="text-[10px] text-gray-400 text-center">Motorizado · pagas al recibir</span>
                </button>
                <button onClick={() => dispatch({ type: 'SET_DELIVERY_TYPE', deliveryType: 'AGENCIA_PROVINCIA' })}
                  className={`flex flex-col items-center gap-1.5 px-3 py-4 rounded-2xl border-2 transition-all ${a.deliveryType === 'AGENCIA_PROVINCIA' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                  <Store size={22} className={a.deliveryType === 'AGENCIA_PROVINCIA' ? 'text-green-600' : 'text-gray-400'} />
                  <span className={`text-sm font-black ${a.deliveryType === 'AGENCIA_PROVINCIA' ? 'text-green-800' : 'text-gray-700'}`}>Provincia · agencia</span>
                  <span className="text-[10px] text-gray-400 text-center">Shalom/Olva · adelanto de flete</span>
                </button>
              </div>

              {a.deliveryType === 'MOTORIZADO_LIMA' && (
                <div className="space-y-3">
                  <button onClick={capturePin} disabled={locating}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm disabled:opacity-60"
                    style={a.lat != null ? { background: '#F0FDF4', color: '#16A34A', border: '1.5px solid #86EFAC' } : { background: '#FFF7ED', color: '#EA580C', border: '1.5px solid #FDBA74' }}>
                    <Navigation size={16} />
                    {locating ? 'Ubicando… espera unos segundos' : a.lat != null ? '📍 Ubicación fijada · toca para reintentar' : 'Fijar mi ubicación (GPS)'}
                  </button>
                  {a.lat != null && (
                    <a href={`https://www.google.com/maps?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer"
                      className="block text-center text-[11px] font-bold" style={{ color: '#1A73E8' }}>Ver el pin en Google Maps →</a>
                  )}
                  <div>
                    <label className="text-xs font-bold text-gray-600 mb-1 block">Referencia (opcional)</label>
                    <input value={a.reference ?? ''} onChange={e => dispatch({ type: 'SET_REFERENCE', reference: e.target.value })}
                      placeholder="Ej. casa azul, portón negro, 2do piso"
                      className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none" />
                  </div>
                  <p className="text-[11px] text-gray-400 flex items-start gap-1">
                    <Navigation size={12} className="text-green-500 flex-shrink-0 mt-0.5" />
                    Fija el pin desde tu celular, parado en tu puerta, para que el motorizado llegue exacto.
                  </p>
                </div>
              )}

              {a.deliveryType === 'AGENCIA_PROVINCIA' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-gray-600 mb-1.5 block">Agencia de envío *</label>
                    <div className="grid grid-cols-3 gap-2">
                      {AGENCIES.map(ag => (
                        <button key={ag} onClick={() => dispatch({ type: 'SET_AGENCY', agencyName: ag })}
                          className={`py-2.5 rounded-xl border-2 text-xs font-black transition-all ${a.agencyName === ag ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 text-gray-600'}`}>
                          {ag === 'OTRO' ? 'Otra' : ag.charAt(0) + ag.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 mb-1 block">Ciudad / agencia de destino *</label>
                    <input value={a.reference ?? ''} onChange={e => dispatch({ type: 'SET_REFERENCE', reference: e.target.value })}
                      placeholder="Ej. Arequipa, agencia Av. Ejército"
                      className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none" />
                  </div>
                  <div className="rounded-2xl px-4 py-3" style={{ background: '#FFF7ED', border: '1px solid #FDBA74' }}>
                    <p className="text-xs font-black" style={{ color: '#EA580C' }}>Envío a provincia con adelanto de flete</p>
                    <p className="text-[11px] mt-0.5" style={{ color: '#9A3412' }}>Adelantas S/{DEFAULT_ADVANCE_PEN} del flete por Yape/Plin y el saldo lo pagas al recoger en la agencia.</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── PASO PAGO ADELANTO ────────────────────────────────────────── */}
          {state.step === 'pago_adelanto' && (
            <>
              <h2 className="text-xl font-black text-gray-900 mb-0.5">Adelanto de flete · S/{DEFAULT_ADVANCE_PEN}</h2>
              <p className="text-sm text-gray-500 mb-4">Yapea o plinea el adelanto y pégame tu número de operación. Verificamos y coordinamos tu envío.</p>

              <div className="rounded-2xl p-4 mb-4 text-center" style={{ background: 'linear-gradient(135deg,#7C3AED,#5B21B6)' }}>
                <div className="w-32 h-32 mx-auto rounded-2xl bg-white/95 flex items-center justify-center mb-3">
                  <span className="text-[11px] font-black text-gray-400 px-4 text-center">QR Yape/Plin<br />(próximamente)</span>
                </div>
                <p className="text-white/70 text-[11px] font-bold uppercase tracking-wide">Adelanto a yapear</p>
                <p className="text-white font-black text-2xl">S/{DEFAULT_ADVANCE_PEN}</p>
                <button onClick={() => { navigator.clipboard?.writeText(String(DEFAULT_ADVANCE_PEN)); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-black px-3 py-1.5 rounded-lg bg-white/15 text-white">
                  <Copy size={11} /> {copied ? '¡Copiado!' : 'Copiar monto'}
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">N° de operación Yape/Plin *</label>
                <input value={a.advanceOpNumber ?? ''} onChange={e => dispatch({ type: 'SET_ADVANCE_PROOF', opNumber: e.target.value.replace(/\D/g, '').slice(0, 12) })}
                  placeholder="Ej. 00123456" type="tel" inputMode="numeric"
                  className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none font-mono tracking-wide" />
                <p className="text-[11px] text-gray-400 mt-1.5">La subida de foto del comprobante llega pronto. Por ahora, con tu número de operación basta para coordinar.</p>
              </div>
            </>
          )}

          {/* ── PASO CONFIRMADO (resumen + submit) ────────────────────────── */}
          {state.step === 'confirmado' && (
            <>
              <h2 className="text-xl font-black text-gray-900 mb-0.5">Revisa y confirma ✅</h2>
              <p className="text-sm text-gray-500 mb-4">Todo listo. Confirma y seguimos por el chat del pedido.</p>

              <div className="rounded-2xl border border-gray-100 divide-y divide-gray-100 mb-1">
                <Row label="Producto" value={`${product.nombre} · ${pack?.nombre ?? ''}`} />
                <Row label="Total" value={`S/${precio}`} strong />
                <Row label="Cliente" value={account?.nombre ?? a.resolvedName ?? '—'} />
                <Row label="WhatsApp" value={account ? account.phone : `+${country.code} ${a.whatsapp}`} />
                <Row label="Entrega" value={a.deliveryType === 'AGENCIA_PROVINCIA'
                  ? `Provincia · ${a.agencyName ? a.agencyName.charAt(0) + a.agencyName.slice(1).toLowerCase() : 'agencia'}${a.reference ? ` · ${a.reference}` : ''}`
                  : `Lima · a domicilio${a.lat != null ? ' · pin GPS ✓' : ''}${a.reference ? ` · ${a.reference}` : ''}`} />
                <Row label="Pago" value={a.paymentMethod === 'YAPE_PLIN'
                  ? `Adelanto S/${DEFAULT_ADVANCE_PEN} por Yape/Plin${a.advanceOpNumber ? ` · op ${a.advanceOpNumber}` : ''}`
                  : 'Contraentrega (pagas al recibir)'} />
              </div>
            </>
          )}

          {/* ── NAVEGACIÓN ────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 mt-5">
            {stepIdx > 0 && (
              <button onClick={() => dispatch({ type: 'BACK' })} disabled={state.submitting}
                className="flex items-center justify-center gap-1 px-4 py-4 rounded-2xl bg-gray-100 text-gray-600 font-black text-sm disabled:opacity-40">
                <ArrowLeft size={16} /> Atrás
              </button>
            )}
            {state.step === 'confirmado' ? (
              <button onClick={handleSubmit} disabled={state.submitting}
                className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 to-yellow-400 text-gray-900 font-black py-4 rounded-2xl text-base shadow-lg disabled:opacity-50 active:scale-95 transition-transform border-b-4 border-amber-500">
                <Check size={18} /> {state.submitting ? 'Registrando…' : `¡Confirmar pedido! S/${precio}`}
              </button>
            ) : (
              <button onClick={() => dispatch({ type: 'NEXT' })} disabled={!canAdvance(state)}
                className="flex-1 bg-green-500 text-white font-black py-4 rounded-2xl text-base shadow-lg shadow-green-200 disabled:opacity-40 active:scale-95 transition-transform">
                {state.step === 'entrega' && requiresAdvance(a) ? 'Continuar al adelanto →' : 'Continuar →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5">
      <span className="text-[11px] font-black uppercase tracking-wide text-gray-400 flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm text-right ${strong ? 'font-black text-green-600' : 'font-semibold text-gray-800'}`}>{value}</span>
    </div>
  )
}
