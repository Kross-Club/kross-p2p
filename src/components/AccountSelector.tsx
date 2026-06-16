import { useState } from 'react'
import { ChevronDown, User } from 'lucide-react'
import { useKrossStore } from '../store'
import { useNavigate } from 'react-router-dom'

export default function AccountSelector() {
  const [open, setOpen] = useState(false)
  const { currentUser, usuarios, switchUser } = useKrossStore()
  const navigate = useNavigate()

  const handleSwitch = (userId: string) => {
    const user = usuarios.find(u => u.id === userId)
    if (!user) return
    switchUser(userId)
    setOpen(false)
    if (user.tipo === 'comprador') navigate('/comprador/chats')
    else navigate('/vendedor/chats')
  }

  const badgeColor = currentUser.tipo === 'comprador'
    ? 'bg-blue-100 text-blue-700'
    : currentUser.tipo === 'vendedora'
    ? 'bg-purple-100 text-purple-700'
    : 'bg-green-100 text-green-700'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
          <User size={14} className="text-green-700" />
        </div>
        <div className="text-left">
          <p className="text-xs font-semibold text-gray-800 leading-none">{currentUser.nombre.split(' ')[0]}</p>
          <p className={`text-[10px] font-medium capitalize px-1.5 rounded-full mt-0.5 inline-block ${badgeColor}`}>
            {currentUser.tipo}
          </p>
        </div>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="p-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 py-1">Cambiar cuenta</p>
            {usuarios.map(u => (
              <button
                key={u.id}
                onClick={() => handleSwitch(u.id)}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-xl text-left hover:bg-gray-50 transition-colors ${currentUser.id === u.id ? 'bg-green-50' : ''}`}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-sm font-bold">
                  {u.nombre[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{u.nombre}</p>
                  <p className="text-[10px] text-gray-400 capitalize">{u.tipo}</p>
                </div>
                {currentUser.id === u.id && (
                  <div className="ml-auto w-2 h-2 rounded-full bg-green-500" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  )
}
