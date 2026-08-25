import { Moon, Sun } from 'lucide-react'
import { useTheme, toggleTheme } from '../lib/theme'

// Un solo botón: muestra a qué tema vas a cambiar, no en cuál estás.
// Mientras nadie lo toca, el panel sigue al sistema operativo.
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, pref } = useTheme()
  const next = theme === 'dark' ? 'claro' : 'oscuro'

  return (
    <button
      onClick={() => toggleTheme(theme)}
      className={`p-1.5 rounded-xl transition-colors hover:bg-gray-100 ${className}`}
      style={{ color: 'var(--text-faint)' }}
      title={pref === 'system' ? `Tema del sistema · cambiar a ${next}` : `Cambiar a tema ${next}`}
      aria-label={`Cambiar a tema ${next}`}>
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}
