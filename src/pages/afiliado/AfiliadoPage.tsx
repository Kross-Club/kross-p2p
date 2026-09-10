import PanelDeAfiliado from '../../components/PanelDeAfiliado'

// ─── `/afiliado` — el afiliado de FUERA ──────────────────────────────────────
//
// El que no es de ninguna tienda: entra, mira sus números y se va. Trae su
// propio marco porque no hay panel alrededor — no es vendedor de nadie, así que
// el `Layout` con el menú de una marca no le corresponde.
//
// El comerciante mira exactamente lo mismo en `Panel → Afiliados` (§52), con el
// MISMO componente y sin este marco. Ver `components/PanelDeAfiliado.tsx`.
export default function AfiliadoPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--surface)' }}>
      <div className="max-w-lg mx-auto px-4 py-5">
        <PanelDeAfiliado suelto />
      </div>
    </div>
  )
}
