import type { ReactNode } from 'react'
import PublicLayout from './PublicLayout'

// Marco común de las páginas legales (términos, devoluciones, privacidad). El
// mismo ancho de lectura y la misma jerarquía en todas: son documentos que se
// citan por número de cláusula, y conviene que se lean igual.
export default function LegalPage({ titulo, actualizado, intro, children }: {
  titulo: string
  actualizado: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <PublicLayout tono="legal">
      <article className="max-w-[760px] mx-auto px-5 py-12 text-gray-800">
        <h1 className="text-3xl md:text-4xl font-black">{titulo}</h1>
        <p className="text-sm text-gray-500 mt-1">Última actualización: {actualizado}</p>
        {intro && <div className="mt-5 text-[15px] leading-relaxed text-gray-700">{intro}</div>}
        <div className="mt-6">{children}</div>
      </article>
    </PublicLayout>
  )
}

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="font-black text-lg mb-2">{titulo}</h2>
      <div className="text-[15px] leading-relaxed text-gray-700 space-y-3
        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5">
        {children}
      </div>
    </section>
  )
}
