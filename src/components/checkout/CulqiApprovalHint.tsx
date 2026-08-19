// ─── SALES ENGINE · Dónde está el código de aprobación ───────────────────────
// Hermano de YapeCodeHint, para el OTRO código: el de APROBACIÓN (6 dígitos,
// con cuenta regresiva), que autoriza el cobro en línea. A diferencia del
// código de seguridad —que aparece solo en pantalla al yapear— este vive en un
// sitio de la app que el comprador jamás ha abierto: sin el dibujo, el campo de
// abajo es un acertijo. Por eso son DOS paneles: dónde tocar, y qué va a ver.
//
// FIJADO CONTRA LA APP REAL (capturas de agosto 2026). La primera versión se
// dibujó de memoria y mandaba a un "Menú de Yape" que no existe: el camino es
// el mosaico **Aprobar compras** de la pantalla de inicio. Enviar al comprador
// a una pantalla inexistente, en el paso más caro del embudo, es una venta
// perdida — si la app cambia, esto se vuelve a fijar contra capturas nuevas,
// nunca de memoria.
//
// Mismas decisiones que YapeCodeHint: SVG y no imagen (~1.7 KB en la pantalla
// del cobro, nítido en cualquier densidad), reconstrucción tipográfica sin
// material de marca ajeno, y va ARRIBA del campo (quien ya sabe la ignora en
// medio segundo; quien no, la ve antes de quedarse mirando un input vacío).
//
// Los 2 minutos son el número que documenta Culqi ("vigencia de 2 minutos como
// máximo"), no una estimación nuestra. El anillo dibuja el contador que la app
// enseña de verdad; el número de dentro es una foto del tiempo que queda.

export default function CulqiApprovalHint() {
  return (
    <div className="rounded-2xl overflow-hidden mb-2"
      style={{ background: '#F7F1FD', border: '1px solid #E9DDF9' }}>
      <svg viewBox="0 0 320 100" className="w-full block" role="img"
        aria-label="En Yape, en la pantalla de inicio toca Aprobar compras: te da un código de 6 números que vence en 2 minutos.">
        {/* Cantos morados de Yape: bastan para que se reconozca la app. */}
        <rect width="320" height="100" fill="#742384" />
        <rect x="8" width="304" height="100" fill="#fff" />

        {/* ── Panel 1 · el mosaico del inicio que tiene que tocar ── */}
        <text x="22" y="15" fontSize="8" fontWeight="700" letterSpacing="0.9"
          fill="#A9A9B8" fontFamily="system-ui, sans-serif">INICIO DE YAPE</text>
        <rect x="22" y="21" width="128" height="1" fill="#EDEDF2" />

        {/* El mosaico bueno: candado morado sobre fondo lila y su rótulo. La
            celda mide 36 de ancho para que "compras" quepa con aire dentro del
            resalte — apretarlo hacía que el rótulo tocara el mosaico vecino. */}
        <rect x="31" y="27" width="22" height="22" rx="6" fill="#F1EAF7" />
        <path d="M39 37.5 v-2.6 a3 3 0 0 1 6 0 V37.5" fill="none" stroke="#742384"
          strokeWidth="1.5" strokeLinecap="round" />
        <rect x="37.5" y="37" width="9" height="7" rx="1.8" fill="#742384" />
        <g fontFamily="system-ui, sans-serif" fontSize="6.5" fontWeight="700"
          fill="#2B2B36" textAnchor="middle">
          <text x="42" y="58">Aprobar</text>
          <text x="42" y="65.5">compras</text>
        </g>
        <rect x="24" y="23" width="36" height="46" rx="8" fill="none"
          stroke="#742384" strokeWidth="2" />

        {/* Los vecinos del mosaico, en gris: sitúan la cuadrícula sin competir
            por la atención (rótulos como barras, ilegibles a propósito). */}
        <g fill="#F1F1F5">
          <rect x="73" y="27" width="22" height="22" rx="6" />
          <rect x="115" y="27" width="22" height="22" rx="6" />
        </g>
        <g fill="#DCDCE4">
          <circle cx="84" cy="38" r="3.5" />
          <circle cx="126" cy="38" r="3.5" />
        </g>
        <g fill="#E7E7ED">
          <rect x="74" y="55" width="20" height="3.5" rx="1.75" />
          <rect x="77" y="62" width="14" height="3.5" rx="1.75" />
          <rect x="116" y="55" width="20" height="3.5" rx="1.75" />
          <rect x="119" y="62" width="14" height="3.5" rx="1.75" />
        </g>

        <rect x="22" y="76" width="128" height="1" fill="#EDEDF2" />
        <text x="22" y="90" fontSize="8" fontWeight="700" letterSpacing="0.4"
          fill="#A9A9B8" fontFamily="system-ui, sans-serif">1 · tócalo ahí</text>

        {/* Flecha entre paneles */}
        <path d="M156 45 h12" stroke="#C9B4D6" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M165 41.5 l4 3.5 -4 3.5" fill="none" stroke="#C9B4D6"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* ── Panel 2 · los 6 dígitos con su cuenta regresiva ── */}
        <text x="178" y="15" fontSize="8" fontWeight="700" letterSpacing="0.9"
          fill="#A9A9B8" fontFamily="system-ui, sans-serif">TU CÓDIGO</text>
        <rect x="178" y="21" width="120" height="1" fill="#EDEDF2" />
        <g fontFamily="system-ui, sans-serif" fontSize="12" fontWeight="700" fill="#2B2B36">
          <rect x="178" y="27" width="17" height="24" rx="4" fill="#F1F1F5" />
          <rect x="198" y="27" width="17" height="24" rx="4" fill="#F1F1F5" />
          <rect x="218" y="27" width="17" height="24" rx="4" fill="#F1F1F5" />
          <rect x="238" y="27" width="17" height="24" rx="4" fill="#F1F1F5" />
          <rect x="258" y="27" width="17" height="24" rx="4" fill="#F1F1F5" />
          <rect x="278" y="27" width="17" height="24" rx="4" fill="#F1F1F5" />
          <text x="186.5" y="43.5" textAnchor="middle">4</text>
          <text x="206.5" y="43.5" textAnchor="middle">8</text>
          <text x="226.5" y="43.5" textAnchor="middle">1</text>
          <text x="246.5" y="43.5" textAnchor="middle">2</text>
          <text x="266.5" y="43.5" textAnchor="middle">0</text>
          <text x="286.5" y="43.5" textAnchor="middle">7</text>
        </g>

        {/* El anillo de la app: la urgencia es real y conviene verla ANTES de
            ir a Yape, no al volver con un código ya vencido. */}
        <circle cx="187" cy="64" r="7.5" fill="none" stroke="#EDE3F5" strokeWidth="2.2" />
        <path d="M187 56.5 a7.5 7.5 0 0 1 6.5 11.2" fill="none" stroke="#742384"
          strokeWidth="2.2" strokeLinecap="round" />
        <text x="187" y="66.8" textAnchor="middle" fontSize="7" fontWeight="700"
          fill="#742384" fontFamily="system-ui, sans-serif">38</text>
        <text x="200" y="67" fontSize="8.5" fontWeight="700" fill="#B06A2E"
          fontFamily="system-ui, sans-serif">Vence en 2 min</text>

        <rect x="178" y="76" width="120" height="1" fill="#EDEDF2" />
        <text x="178" y="90" fontSize="8" fontWeight="700" letterSpacing="0.4"
          fill="#A9A9B8" fontFamily="system-ui, sans-serif">2 · cópialos aquí abajo</text>
      </svg>

      <p className="text-[11px] leading-snug text-gray-600 px-3.5 py-2.5">
        Abre Yape y toca{' '}
        <strong className="text-gray-800">“Aprobar compras”</strong>: ahí sale tu
        código. Copia los 6 números aquí y nosotros cobramos tu adelanto — no
        tienes que escribir ningún monto.
      </p>
    </div>
  )
}
