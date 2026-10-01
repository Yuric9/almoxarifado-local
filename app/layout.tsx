import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Almoxarifado Local',
  description: 'Controle de estoque offline e portátil'
}

const TEMA_INICIAL = `try{var t=localStorage.getItem('tema');if(t==='escuro'||((!t||t==='sistema')&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Aplica o tema salvo antes da página aparecer, evitando o "piscar" do tema claro. */}
        <script dangerouslySetInnerHTML={{ __html: TEMA_INICIAL }} />
      </head>
      <body className="bg-fundo text-slate-900">{children}</body>
    </html>
  )
}
