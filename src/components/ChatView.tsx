import { useState, useRef, useEffect } from 'react'
import { Send, Play, Pause, Mic, MessageCircle } from 'lucide-react'
import { useKrossStore } from '../store'
import type { Chat, Mensaje, MensajeBotones, MensajePrecioOpcion, MensajeAudio } from '../types'

function AudioBubble({ contenido }: { contenido: MensajeAudio }) {
  const [playing, setPlaying] = useState(false)
  return (
    <div className="flex items-center gap-3 bg-green-50 rounded-2xl px-4 py-3 min-w-[180px]">
      <button
        onClick={() => setPlaying(!playing)}
        className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center text-white flex-shrink-0 shadow-sm"
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className="flex-1">
        <div className="flex items-end gap-0.5 h-6">
          {[4,9,14,7,16,11,6,18,8,5,13,9,12,16,7,11,4,13,9,6,15,10].map((h, i) => (
            <div key={i} className={`w-0.5 rounded-full transition-all ${playing ? 'bg-green-500' : 'bg-green-300'}`} style={{ height: `${h}px` }} />
          ))}
        </div>
        <p className="text-[11px] text-green-600 mt-1 font-medium">{contenido.duracion}</p>
      </div>
      <Mic size={14} className="text-green-400" />
    </div>
  )
}

function PreciosBubble({ contenido }: { contenido: MensajePrecioOpcion[] }) {
  return (
    <div className="space-y-2 min-w-[220px]">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Precios</p>
      {contenido.map((op, i) => (
        <div key={i} className="bg-white border border-green-100 rounded-2xl px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-800 text-sm">{op.nombre}</span>
            <span className="font-black text-green-600 text-base">S/{op.precio}</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{op.descripcion}</p>
        </div>
      ))}
    </div>
  )
}

function BotonesBubble({
  contenido,
  onSelect,
  onChatUnlock,
}: {
  contenido: MensajeBotones
  onSelect: (op: string) => void
  onChatUnlock?: () => void
}) {
  const [selected, setSelected] = useState<string | null>(contenido.seleccionada || null)

  const handleSelect = (op: string) => {
    if (op.toLowerCase() === 'chat' && onChatUnlock) {
      onChatUnlock()
      return
    }
    setSelected(op)
    onSelect(op)
  }

  return (
    <div className="space-y-2 min-w-[200px]">
      {contenido.pregunta && <p className="text-sm text-gray-700">{contenido.pregunta}</p>}
      <div className="flex flex-wrap gap-2">
        {contenido.opciones.map((op) => {
          const isChat = op.toLowerCase() === 'chat'
          return (
            <button
              key={op}
              onClick={() => handleSelect(op)}
              className={`text-xs font-medium px-3 py-2 rounded-full border transition-all ${
                isChat
                  ? 'bg-green-500 text-white border-green-500 font-bold flex items-center gap-1.5'
                  : selected === op
                  ? 'bg-green-500 text-white border-green-500'
                  : 'bg-white text-green-700 border-green-200 hover:border-green-400'
              }`}
            >
              {isChat && <MessageCircle size={11} />}
              {op}
            </button>
          )
        })}
      </div>
      {selected && selected.toLowerCase() !== 'chat' && contenido.respuestas[selected] && (
        <div className="bg-green-50 rounded-2xl px-3 py-2 mt-1">
          <p className="text-sm text-green-800">{contenido.respuestas[selected]}</p>
        </div>
      )}
    </div>
  )
}

function MensajeItem({
  msg,
  onSelectBtn,
  onChatUnlock,
}: {
  msg: Mensaje
  onSelectBtn: (op: string) => void
  onChatUnlock?: () => void
}) {
  const isClient = msg.autor === 'cliente'
  const isBot = msg.autor === 'bot' || msg.autor === 'ia'
  const time = new Date(msg.timestamp).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })

  if (msg.tipo === 'audio') {
    return (
      <div className={`flex ${isClient ? 'justify-end' : 'justify-start'} mb-3`}>
        <div>
          {isBot && <p className="text-[10px] text-gray-400 mb-1 ml-1">Kross Bot</p>}
          <AudioBubble contenido={msg.contenido as MensajeAudio} />
          <p className="text-[10px] text-gray-300 mt-1 ml-1">{time}</p>
        </div>
      </div>
    )
  }

  if (msg.tipo === 'precios') {
    return (
      <div className="flex justify-start mb-3">
        <div>
          <p className="text-[10px] text-gray-400 mb-1 ml-1">Kross Bot</p>
          <PreciosBubble contenido={msg.contenido as MensajePrecioOpcion[]} />
          <p className="text-[10px] text-gray-300 mt-1 ml-1">{time}</p>
        </div>
      </div>
    )
  }

  if (msg.tipo === 'botones') {
    return (
      <div className="flex justify-start mb-3">
        <div className="max-w-[85%]">
          <p className="text-[10px] text-gray-400 mb-1 ml-1">Kross Bot</p>
          <BotonesBubble
            contenido={msg.contenido as MensajeBotones}
            onSelect={onSelectBtn}
            onChatUnlock={onChatUnlock}
          />
          <p className="text-[10px] text-gray-300 mt-1 ml-1">{time}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isClient ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[80%] ${isClient ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isClient && (
          <p className="text-[10px] text-gray-400 mb-1 ml-1">
            {msg.autor === 'vendedor' ? 'Vendedor' : 'IA Kross'}
          </p>
        )}
        <div className={`px-4 py-2.5 rounded-2xl text-sm ${
          isClient ? 'bg-green-500 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'
        }`}>
          {msg.contenido as string}
        </div>
        <p className="text-[10px] text-gray-300 mt-1 mx-1">{time}</p>
      </div>
    </div>
  )
}

interface ChatViewProps {
  chat: Chat
  isVendedor?: boolean
  /** En modo landing: oculta el input hasta que el cliente toque el botón "Chat" */
  lockedUntilChat?: boolean
}

export default function ChatView({ chat, isVendedor, lockedUntilChat }: ChatViewProps) {
  const [input, setInput] = useState('')
  const [chatUnlocked, setChatUnlocked] = useState(!lockedUntilChat)
  const { sendMessage } = useKrossStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.mensajes.length, chatUnlocked])

  const handleSend = () => {
    if (!input.trim()) return
    sendMessage(chat.id, {
      autor: isVendedor ? 'vendedor' : 'cliente',
      tipo: 'texto',
      contenido: input.trim(),
    })
    setInput('')
  }

  const handleChatUnlock = () => {
    setChatUnlocked(true)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {chat.mensajes.map(msg => (
          <MensajeItem
            key={msg.id}
            msg={msg}
            onSelectBtn={() => {}}
            onChatUnlock={!chatUnlocked ? handleChatUnlock : undefined}
          />
        ))}

        {/* Prompt para desbloquear chat si aún no lo ha hecho */}
        {lockedUntilChat && !chatUnlocked && (
          <div className="flex justify-start mb-3">
            <div className="max-w-[85%]">
              <p className="text-[10px] text-gray-400 mb-1 ml-1">Kross Bot</p>
              <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                <p className="text-sm text-gray-700 mb-2">¿Quieres hablar con un asesor ahora?</p>
                <button
                  onClick={handleChatUnlock}
                  className="flex items-center gap-2 bg-green-500 text-white font-bold px-4 py-2 rounded-xl text-sm"
                >
                  <MessageCircle size={14} />
                  Chat
                </button>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input — solo visible cuando está desbloqueado */}
      {chatUnlocked && (
        <div className="border-t border-gray-100 px-4 py-3 bg-white">
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder={isVendedor ? 'Responder al cliente...' : 'Escribe tu mensaje...'}
              className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-200 placeholder-gray-400"
              autoFocus
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white shadow-sm disabled:opacity-40 transition-opacity"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
