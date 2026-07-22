// El quiz es data-driven: edita este arreglo para cambiar el embudo sin tocar UI.
// Tipos de paso:
//   'choice' → opciones (alta conversión: 1 tap avanza)
//   'text'   → input libre
//   'ai'     → turno de IA (llama a la Edge Function ai-quiz con lo respondido)
//   'lead'   → captura nombre + teléfono y cierra el quiz (quiz-submit)

export type StepType = 'choice' | 'text' | 'ai' | 'lead'

export interface QuizStep {
  id: string
  type: StepType
  title: string
  subtitle?: string
  options?: { label: string; value: string; emoji?: string }[]
  placeholder?: string
}

export const QUIZ: QuizStep[] = [
  {
    id: 'goal',
    type: 'choice',
    title: '¿Cuál es tu objetivo principal?',
    subtitle: 'Elige el que más se parezca a ti.',
    options: [
      { label: 'Bajar de peso', value: 'peso', emoji: '🔥' },
      { label: 'Ganar energía', value: 'energia', emoji: '⚡' },
      { label: 'Dormir mejor', value: 'sueno', emoji: '😴' },
      { label: 'Cuidar mi piel', value: 'piel', emoji: '✨' },
    ],
  },
  {
    id: 'obstacle',
    type: 'choice',
    title: '¿Qué te lo impide hoy?',
    options: [
      { label: 'Falta de tiempo', value: 'tiempo' },
      { label: 'No sé por dónde empezar', value: 'guia' },
      { label: 'Ya probé y no funcionó', value: 'frustrado' },
    ],
  },
  {
    id: 'detail',
    type: 'text',
    title: 'Cuéntame en una frase tu situación',
    subtitle: 'La IA usará esto para tu recomendación.',
    placeholder: 'Ej: entreno pero no bajo de peso…',
  },
  {
    id: 'ai',
    type: 'ai',
    title: 'Analizando tus respuestas…',
    subtitle: 'Tu recomendación personalizada.',
  },
  {
    id: 'lead',
    type: 'lead',
    title: 'Te enviamos tu plan por WhatsApp',
    subtitle: 'Déjanos dónde enviártelo.',
  },
]
