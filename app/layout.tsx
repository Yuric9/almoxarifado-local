import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Almoxarifado Local',
  description: 'Controle de estoque offline e portátil'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-100 text-slate-900">{children}</body>
    </html>
  )
}
