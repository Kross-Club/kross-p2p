// ─── SALES ENGINE · Dónde está el código de aprobación ───────────────────────
// Hermano de YapeCodeHint, para el OTRO código: el de APROBACIÓN (6 dígitos,
// Menú → Código de aprobación, vence en 2 min), que autoriza el cobro en línea.
// A diferencia del código de seguridad —que aparece solo en pantalla al
// yapear— este está ESCONDIDO en un menú que el comprador jamás ha abierto:
// sin el dibujo, el campo de abajo es un acertijo. Por eso son DOS paneles:
// dónde tocar, y qué va a ver.
//
// Mismas decisiones que YapeCodeHint: SVG y no imagen (~1.5 KB en la pantalla
// del cobro, nítido en cualquier densidad), reconstrucción tipográfica sin
// material de marca ajeno, y va ARRIBA del campo (quien ya sabe la ignora en
// medio segundo; quien no, la ve antes de quedarse mirando un input vacío).
//
// ⚠️ Fijar contra la app real antes de amplificar tráfico — igual que se hizo
// con YapeCodeHint contra la pantalla del comprobante.

export default function CulqiApprovalHint() {
  return (
    <div className="rounded-2xl overflow-hidden mb-2"
      style={{ background: '#F7F1FD', border: '1px solid #E9DDF9' }}>
      <svg viewBox="0 0 320 96" className="w-full block" role="img"
        aria-label="En Yape, abre el menú y toca Código de aprobación: te da 6 números que vencen en 2 minutos.">
        {/* Cantos morados de Yape: bastan para que se reconozca la app. */}
        <rect width="320" height="96" fill="#742384" />
        <rect x="8" width="304" height="96" fill="#fff" />

        {/* Panel 1 · la fila del menú que tiene que encontrar */}
        <text x="22" y="17" fontSize="8" fontWeight="700" letterSpacing="0.9"
          fill="#A9A9B8" fontFamily="system-ui, sans-serif">MENÚ DE YAPE</text>
        <rect x="22" y="24" width="128" height="1" fill="#EDEDF2" />
        <rect x="24" y="34" width="19" height="19" rx="5" fill="#F1EAF7" />
        <text x="33.5" y="47.5" textAnchor="middle" fontSize="10" fontWeight="700"
          fill="#742384" fontFamily="system-ui, sans-serif">#</text>
        <text x="50" y="41" fontSize="9.5" fontWeight="700"
          fill="#2B2B36" fontFamily="system-ui, sans-serif">Código de</text>
        <text x="50" y="51" fontSize="9.5" fontWeight="700"
          fill="#2B2B36" fontFamily="system-ui, sans-serif">aprobación</text>
        <text x="141" y="47" textAnchor="end" fontSize="11" fill="#B9B9C6"
          fontFamily="system-ui, sans-serif">›</text>
        <rect x="19" y="29" width="128" height="29" rx="8" fill="none"
          stroke="#742384" strokeWidth="2" />
        <rect x="22" y="67" width="128" height="1" fill="#EDEDF2" />
        <text x="22" y="82" fontSize="8" fontWeight="700" letterSpacing="0.4"
          fill="#A9A9B8" fontFamily="system-ui, sans-serif">1 · ábrelo ahí</text>

        {/* Flecha entre paneles */}
        <path d="M156 46 h12" stroke="#C9B4D6" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M165 42.5 l4 3.5 -4 3.5" fill="none" stroke="#C9B4D6"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Panel 2 · los 6 dígitos con su cuenta regresiva */}
        <text x="178" y="17" fontSize="8" fontWeight="700" letterSpacing="0.9"
          fill="#A9A9B8" fontFamily="system-ui, sans-serif">TU CÓDIGO</text>
        <rect x="178" y="24" width="120" height="1" fill="#EDEDF2" />
        <g fontFamily="system-ui, sans-serif" fontSize="12" fontWeight="700" fill="#2B2B36">
          <rect x="178" y="31" width="17" height="24" rx="4" fill="#F1F1F5" />
          <rect x="198" y="31" width="17" height="24" rx="4" fill="#F1F1F5" />
          <rect x="218" y="31" width="17" height="24" rx="4" fill="#F1F1F5" />
          <rect x="238" y="31" width="17" height="24" rx="4" fill="#F1F1F5" />
          <rect x="258" y="31" width="17" height="24" rx="4" fill="#F1F1F5" />
          <rect x="278" y="31" width="17" height="24" rx="4" fill="#F1F1F5" />
          <text x="186.5" y="47.5" textAnchor="middle">4</text>
          <text x="206.5" y="47.5" textAnchor="middle">8</text>
          <text x="226.5" y="47.5" textAnchor="middle">1</text>
          <text x="246.5" y="47.5" textAnchor="middle">2</text>
          <text x="266.5" y="47.5" textAnchor="middle">0</text>
          <text x="286.5" y="47.5" textAnchor="middle">7</text>
        </g>
        {/* El reloj: la urgencia es real (2 min) y conviene que la vea ANTES de
            ir a Yape, no cuando vuelva con un código vencido. */}
        <circle cx="184" cy="70" r="4.5" fill="none" stroke="#E0894A" strokeWidth="1.4" />
        <path d="M184 67.5 v2.5 h1.8" fill="none" stroke="#E0894A" strokeWidth="1.4" strokeLinecap="round" />
        <text x="193" y="73" fontSize="8.5" fontWeight="700" fill="#B06A2E"
          fontFamily="system-ui, sans-serif">Vence en 2 minutos</text>
        <text x="178" y="88" fontSize="8" fontWeight="700" letterSpacing="0.4"
          fill="#A9A9B8" fontFamily="system-ui, sans-serif">2 · cópialos aquí abajo</text>
      </svg>

      <p className="text-[11px] leading-snug text-gray-600 px-3.5 py-2.5">
        Abre Yape, entra al menú y toca{' '}
        <strong className="text-gray-800">“Código de aprobación”</strong>.
        Copia los 6 números aquí y nosotros cobramos tu adelanto — no tienes que
        escribir ningún monto.
      </p>
    </div>
  )
}
