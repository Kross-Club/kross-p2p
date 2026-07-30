// ─── SALES ENGINE · Dónde está el código de seguridad ────────────────────────
// El campo del código era el único punto del checkout donde el comprador tenía
// que APRENDER algo nuevo, y en la primera venta real a un tercero hubo que
// explicárselo por chat. Una explicación que se da por chat no escala: el
// próximo comprador no tiene a quién preguntarle.
//
// La respuesta no es más texto —ya había un hint y no alcanzó— sino
// RECONOCIMIENTO: se reproduce la franja exacta que el comprador acaba de ver
// en Yape, para que compare en vez de interpretar.
//
// Va en SVG y no en imagen a propósito. Además de pesar ~1 KB en vez de ~20 en
// la pantalla donde se cobra —y el comprador está en 4G—, se ve nítido en
// cualquier densidad y no incrusta material de marca ajeno: es una
// reconstrucción tipográfica, no una captura. La franja recortada tampoco
// muestra monto (chocaría con los S/20 de Olva) ni datos de la transacción.

export default function YapeCodeHint() {
  return (
    <div className="rounded-2xl overflow-hidden mb-2"
      style={{ background: '#F7F1FD', border: '1px solid #E9DDF9' }}>
      <svg viewBox="0 0 320 58" className="w-full block" role="img"
        aria-label="En tu pantalla de Yape, la fila Código de seguridad muestra tres números.">
        {/* Bordes morados: los cantos de la tarjeta de Yape. Bastan para que se
            reconozca la pantalla sin reproducirla entera. */}
        <rect width="320" height="58" fill="#742384" />
        <rect x="10" width="300" height="58" fill="#fff" />
        {/* Las hairlines que enmarcan la fila en la app real. */}
        <rect x="22" y="6" width="276" height="1" fill="#EDEDF2" />
        <rect x="22" y="51" width="276" height="1" fill="#EDEDF2" />

        <text x="24" y="33" fontSize="11.5" fontWeight="700" letterSpacing="0.4"
          fill="#6B6B7B" fontFamily="system-ui, sans-serif">CÓDIGO DE SEGURIDAD</text>
        {/* El puntito de info del original: sin él la fila no se reconoce igual. */}
        <circle cx="163" cy="29" r="7.5" fill="#3FC7A8" />
        <text x="163" y="33" textAnchor="middle" fontSize="9" fontWeight="700"
          fill="#fff" fontFamily="system-ui, sans-serif">i</text>

        {/* Los 3 dígitos: lo único que el comprador tiene que copiar. Se marcan
            con el color de marca —no con neón— porque esta es la pantalla del
            cobro y la confianza pesa más que la llamada de atención. */}
        <g>
          <rect x="228" y="15" width="24" height="28" rx="5" fill="#F1F1F5" />
          <rect x="256" y="15" width="24" height="28" rx="5" fill="#F1F1F5" />
          <rect x="284" y="15" width="24" height="28" rx="5" fill="#F1F1F5" />
          <text x="240" y="35" textAnchor="middle" fontSize="16" fontWeight="700"
            fill="#2B2B36" fontFamily="system-ui, sans-serif">3</text>
          <text x="268" y="35" textAnchor="middle" fontSize="16" fontWeight="700"
            fill="#2B2B36" fontFamily="system-ui, sans-serif">2</text>
          <text x="296" y="35" textAnchor="middle" fontSize="16" fontWeight="700"
            fill="#2B2B36" fontFamily="system-ui, sans-serif">9</text>
          <rect x="224" y="11" width="88" height="36" rx="9" fill="none"
            stroke="#742384" strokeWidth="2" />
        </g>
      </svg>

      <p className="text-[11px] leading-snug text-gray-600 px-3 py-2">
        Apenas terminas de yapear, esta fila aparece en tu pantalla.
        {' '}<strong className="text-gray-800">Copia esos 3 números aquí abajo</strong> —
        con eso reconocemos tu pago al toque.
      </p>
    </div>
  )
}
