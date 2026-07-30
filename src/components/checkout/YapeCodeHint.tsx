// ─── SALES ENGINE · Dónde está el código de seguridad ────────────────────────
// El campo del código era el único punto del checkout donde el comprador tenía
// que APRENDER algo nuevo, y en la primera venta real a un tercero hubo que
// explicárselo por chat. Una explicación que hay que dar por chat es fricción
// que no escala: el próximo comprador no tiene a nadie a quien preguntarle.
//
// La respuesta no es más texto —ya había un hint y no alcanzó— sino
// RECONOCIMIENTO: casi todo peruano ha visto la pantalla de "¡Yapeaste!". Con
// una miniatura de esa pantalla y los 3 dígitos resaltados, no hay nada que
// leer ni que entender; se compara y listo.
//
// Va en SVG inline a propósito: es la pantalla donde se cobra, y no puede
// depender de una request más en 4G. Tampoco usa una captura real de Yape —
// sería material de marca ajeno; esto es una evocación esquemática.

export default function YapeCodeHint() {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5 mb-2"
      style={{ background: '#F7F1FD', border: '1px solid #E9DDF9' }}>
      <svg viewBox="0 0 78 96" className="w-[52px] h-[64px] flex-shrink-0" aria-hidden="true">
        <rect width="78" height="96" rx="8" fill="#fff" stroke="#E4D6F5" />
        {/* Cabecera morada: el "¡Yapeaste!" que el comprador acaba de ver. */}
        <rect x="1" y="1" width="76" height="26" rx="7" fill="#742384" />
        <circle cx="39" cy="11" r="5" fill="#fff" opacity=".9" />
        <path d="M36.6 11.2l1.7 1.7 3.2-3.4" stroke="#742384" strokeWidth="1.6"
          fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="26" y="19" width="26" height="3.4" rx="1.7" fill="#fff" opacity=".75" />
        {/* Monto */}
        <rect x="22" y="33" width="34" height="6" rx="3" fill="#D9D9E3" />
        {/* La etiqueta y los 3 dígitos: lo único que importa, por eso es lo
            único con color y con anillo. */}
        <rect x="16" y="48" width="46" height="3" rx="1.5" fill="#C9C9D4" />
        <g>
          <rect x="17" y="56" width="14" height="16" rx="3" fill="#F3E8FF" stroke="#742384" strokeWidth="1.4" />
          <rect x="33" y="56" width="14" height="16" rx="3" fill="#F3E8FF" stroke="#742384" strokeWidth="1.4" />
          <rect x="49" y="56" width="14" height="16" rx="3" fill="#F3E8FF" stroke="#742384" strokeWidth="1.4" />
          <text x="24" y="68" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#742384">2</text>
          <text x="40" y="68" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#742384">1</text>
          <text x="56" y="68" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#742384">1</text>
        </g>
        <rect x="20" y="80" width="38" height="3" rx="1.5" fill="#E4E4EC" />
      </svg>

      <p className="text-[11px] leading-snug text-gray-600">
        Apenas terminas de yapear, tu pantalla muestra
        {' '}<strong className="text-gray-800">Código de seguridad</strong> con 3 números.
        <span className="block mt-0.5 text-gray-500">Cópialos aquí — con eso reconocemos tu pago al toque.</span>
      </p>
    </div>
  )
}
