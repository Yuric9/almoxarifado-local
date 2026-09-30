import './globals.css'
export const metadata = { title: 'Almoxarifado Simples', description: 'MVP acessivel' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body className="bg-[#F8F9FA] antialiased">{children}</body></html>
}
