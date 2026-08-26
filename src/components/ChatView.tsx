import { useState, useRef, useEffect } from 'react'
import { Send, Play, Pause, Mic, MessageCircle, CheckCircle2 } from 'lucide-react'
import { useKrossStore } from '../store'
import type { Chat, Mensaje, MensajeBotones, MensajePrecioOpcion, MensajeAudio } from '../types'

function AudioBubble({ contenido }: { contenido: MensajeAudio }) {
  const [playing, setPlaying] = useState(false)
  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3 min-w-[200px]" style={{ background: '#FFD400' }}>
      <button
        onClick={() => setPlaying(!playing)}
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: '#111111', color: '#FFD400' }}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className="flex-1">
        <div className="flex items-end gap-0.5 h-6">
          {[4,9,14,7,16,11,6,18,8,5,13,9,12,16,7,11,4,13,9,6,15,10].map((h, i) => (
            <div key={i} className="w-0.5 rounded-full transition-all" style={{ height: `${h}px`, background: '#111111cc' }} />
          ))}
        </div>
        <p className="text-[11px] mt-1 font-bold" style={{ color: '#111111' }}>{contenido.duracion}</p>
      </div>
      <Mic size={14} style={{ color: '#111111' }} />
    </div>
  )
}

function PreciosBubble({ contenido }: { contenido: MensajePrecioOpcion[] }) {
  return (
    <div className="space-y-2 min-w-[220px]">
      {contenido.map((op, i) => (
        <div key={i} className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-800 text-sm">{op.nombre}</span>
            <span className="font-black text-base" style={{ color: 'var(--brand)' }}>S/{op.precio}</span>
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

  const isConfirm = (op: string) => op.startsWith('✅')
  const isChatBtn = (op: string) => op.toLowerCase().includes('chatear') || op.toLowerCase() === 'chat'

  const handleSelect = (op: string) => {
    if (isChatBtn(op) && onChatUnlock) {
      onChatUnlock()
      return
    }
    setSelected(op)
    onSelect(op)
  }

  const isConfirmSection = contenido.opciones.some(op => isConfirm(op))

  return (
    <div className="space-y-2">
      {/* Botones — alineados a la derecha */}
      <div className="flex flex-wrap gap-2 justify-end">
        {contenido.opciones.map((op) => {
          const isChat = isChatBtn(op)
          const isConf = isConfirm(op)
          const isDone = selected === op

          if (isConf) {
            return (
              <button
                key={op}
                onClick={() => handleSelect(op)}
                disabled={isDone}
                className="w-full flex items-center justify-center gap-2 font-black py-3.5 rounded-2xl text-sm transition-all active:scale-95"
                style={isDone
                  ? { background: 'var(--brand)', color: 'var(--on-brand)' }
                  : { background: '#FFD400', color: '#111111', border: '2px solid #111111' }
                }
              >
                {isDone ? <CheckCircle2 size={16} /> : null}
                {isDone ? '¡Pedido confirmado!' : op}
              </button>
            )
          }

          return (
            <button
              key={op}
              onClick={() => handleSelect(op)}
              className="text-xs font-bold px-3 py-2 rounded-full border transition-all"
              style={
                isChat
                  ? { background: 'var(--brand)', color: 'var(--on-brand)', borderColor: 'var(--brand)', display: 'flex', alignItems: 'center', gap: '4px' }
                  : selected === op
                  ? { background: 'var(--brand)', color: 'var(--on-brand)', borderColor: 'var(--brand)' }
                  : { background: 'white', color: 'var(--brand)', borderColor: 'var(--brand)' }
              }
            >
              {isChat && <MessageCircle size={11} />}
              {op}
            </button>
          )
        })}
      </div>

      {/* Respuesta al FAQ seleccionado */}
      {selected && !selected.startsWith('✅') && !isChatBtn(selected) && contenido.respuestas[selected] && (
        <div className="rounded-2xl rounded-bl-sm px-4 py-2.5 mt-1" style={{ background: '#FFD400' }}>
          <p className="text-sm font-semibold" style={{ color: '#111111' }}>{contenido.respuestas[selected]}</p>
        </div>
      )}

      {/* Confirmación success */}
      {selected && selected.startsWith('✅') && contenido.respuestas[selected] && (
        <div className="rounded-2xl px-4 py-3 mt-1 flex items-start gap-2" style={{ background: 'var(--brand-tint)', border: '1.5px solid var(--brand)' }}>
          <CheckCircle2 size={16} style={{ color: 'var(--brand)', flexShrink: 0, marginTop: 2 }} />
          <p className="text-sm font-semibold" style={{ color: '#1a6a8a' }}>{contenido.respuestas[selected]}</p>
        </div>
      )}

      {/* Hint para confirmar (solo en la sección de confirmación) */}
      {isConfirmSection && !selected && (
        <p className="text-[10px] text-gray-400 text-right pr-1">👆 Toca para confirmar</p>
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
  const time = new Date(msg.timestamp).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })

  if (msg.tipo === 'audio') {
    return (
      <div className={`flex ${isClient ? 'justify-end' : 'justify-start'} mb-3`}>
        <div>
          <AudioBubble contenido={msg.contenido as MensajeAudio} />
          <p className="text-[10px] text-gray-400 mt-1 ml-1">{time}</p>
        </div>
      </div>
    )
  }

  if (msg.tipo === 'precios') {
    return (
      <div className="flex justify-start mb-3">
        <div>
          <PreciosBubble contenido={msg.contenido as MensajePrecioOpcion[]} />
          <p className="text-[10px] text-gray-400 mt-1 ml-1">{time}</p>
        </div>
      </div>
    )
  }

  if (msg.tipo === 'botones') {
    const contenido = msg.contenido as MensajeBotones
    return (
      <div className="flex justify-start mb-3">
        <div className="w-full max-w-[90%] space-y-2">
          {contenido.pregunta && (
            <div className="rounded-2xl rounded-bl-sm px-4 py-2.5" style={{ background: '#FFD400' }}>
              <p className="text-sm font-semibold" style={{ color: '#111111' }}>{contenido.pregunta}</p>
            </div>
          )}
          <BotonesBubble
            contenido={contenido}
            onSelect={onSelectBtn}
            onChatUnlock={onChatUnlock}
          />
          <p className="text-[10px] text-gray-400 ml-1">{time}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isClient ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[80%] ${isClient ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm ${isClient ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
          style={isClient ? { background: 'var(--brand)', color: 'var(--on-brand)' } : { background: '#FFD400', color: '#111111', fontWeight: 600 }}
        >
          {msg.contenido as string}
        </div>
        <p className="text-[10px] text-gray-400 mt-1 mx-1">{time}</p>
      </div>
    </div>
  )
}

interface ChatViewProps {
  chat: Chat
  isVendedor?: boolean
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

  return (
    <div className="flex flex-col h-full">
      {/* Fondo blanco amarillento muy suave */}
      <div className="flex-1 overflow-y-auto px-4 py-4" style={{ background: 'var(--chat-bg)' }}>
        {chat.mensajes.map(msg => (
          <MensajeItem
            key={msg.id}
            msg={msg}
            onSelectBtn={() => {}}
            onChatUnlock={!chatUnlocked ? () => setChatUnlocked(true) : undefined}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {chatUnlocked && (
        <div className="border-t border-gray-100 px-3 py-3 bg-white">
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder={isVendedor ? 'Responder al cliente...' : 'Escribe tu mensaje...'}
              className="flex-1 rounded-full px-4 py-2.5 text-sm outline-none placeholder-gray-400"
              style={{ background: 'var(--surface-3)' }}
              autoFocus
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-10 h-10 rounded-full flex items-center justify-center  shadow-sm disabled:opacity-40 transition-opacity"
              style={{ background: 'var(--brand)' }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
