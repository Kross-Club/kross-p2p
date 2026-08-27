import { useSearchParams } from 'react-router-dom'
import { useSeller } from '../../lib/seller-session'
import { useIsDesktop } from '../../lib/use-desktop'
import { puedeVerClientes } from '../../lib/store-clients'
import { MODOS_CLIENTE, modoClienteDeUrl, urlDeModoCliente } from '../../lib/clientes-modos'
import type { ModoCliente } from '../../lib/clientes-modos'
import ClientesPersonas from './ClientesPersonas'
import ClientesReactivar from './ClientesReactivar'
import ClientesInvitar from './ClientesInvitar'

// ─── Clientes: la gente, no las herramientas ─────────────────────────────────
//
// Clientes y Retención eran dos entradas del menú que hablaban de la misma
// gente: una traía base nueva y la otra medía si volvía. Y ninguna de las dos
// era la libreta — no existía una pantalla que respondiera "¿este señor ya me
// compró antes?" (11-RELACIONES).
//
// Ahora Clientes es esa libreta, y las dos herramientas viven adentro como
// modos, igual que en Pedidos.

export default function ClientesPage() {
  const { effective } = useSeller()
  const desktop = useIsDesktop()
  const [params, setParams] = useSearchParams()
  const modo = modoClienteDeUrl(params)

  // `buyers` guarda DNI y teléfono: la libreta es del admin, igual que las
  // grabaciones. El servidor lo exige de todos modos; esto evita la pantalla
  // vacía sin explicación.
  if (!puedeVerClientes(effective)) {
    return <div className="px-4 py-8 text-center text-sm text-gray-400">
      Solo el administrador ve la lista de clientes.
    </div>
  }

  const irA = (m: ModoCliente) => setParams(urlDeModoCliente(m), { replace: true })

  return (
    <div>
      <div className={desktop ? 'px-6 pt-5' : 'px-4 pt-4'}>
        {!desktop && <h1 className="text-xl font-black text-gray-900 mb-3">Clientes</h1>}
        <div className="flex gap-1 p-0.5 rounded-2xl overflow-x-auto" style={{ background: 'var(--surface-3)' }}>
          {MODOS_CLIENTE.map(m => {
            const activo = m.key === modo
            return (
              <button key={m.key} onClick={() => irA(m.key)} title={m.pregunta} aria-pressed={activo}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors flex-shrink-0"
                style={activo
                  ? { background: 'var(--surface)', color: 'var(--text)', fontWeight: 700 }
                  : { color: 'var(--text-faint)', fontWeight: 500 }}>
                <m.icon size={14} />
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      {modo === 'personas' && <ClientesPersonas />}
      {modo === 'reactivar' && <ClientesReactivar />}
      {modo === 'invitar' && <ClientesInvitar />}
    </div>
  )
}
