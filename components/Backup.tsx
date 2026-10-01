'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, HardDrive, TriangleAlert, Upload } from 'lucide-react'
import { api, mensagemErro } from '@/lib/cliente'
import { Botao, CabecalhoPagina, Painel, Tabela, celula, celulaNumero } from './ui'

/* ------------------------------------------------------------------ backup */

type ListaBackups = { pasta: string; backups: Array<{ nome: string; tamanho: number; criado_em: string }> }

const tamanho = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function TelaBackup({ aoRestaurar, notificar }: { aoRestaurar: () => void | Promise<void>; notificar: (msg: string, erro?: boolean) => void }) {
  const [lista, setLista] = useState<ListaBackups | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')

  const carregar = useCallback(async () => {
    try { setLista(await api<ListaBackups>('/api/backup')) } catch (e) { notificar(mensagemErro(e), true) }
  }, [notificar])
  useEffect(() => { carregar() }, [carregar])

  async function fazerBackup() {
    setOcupado(true)
    try {
      const r = await api<{ arquivo: string }>('/api/backup', { method: 'POST' })
      notificar(`Backup criado: ${r.arquivo}`)
      await carregar()
    } catch (e) {
      notificar(mensagemErro(e), true)
    } finally {
      setOcupado(false)
    }
  }

  async function restaurar() {
    const selecionado = arquivo.current?.files?.[0]
    if (!selecionado) return notificar('Selecione um arquivo .db para restaurar', true)
    if (!window.confirm(`Substituir todos os dados atuais pelo backup "${selecionado.name}"?\n\nUma cópia dos dados atuais será salva antes.`)) return
    setOcupado(true)
    try {
      const form = new FormData()
      form.append('arquivo', selecionado)
      const r = await api<{ backupAnterior: string }>('/api/backup/restaurar', { method: 'POST', body: form })
      notificar(`Backup restaurado. Dados anteriores salvos em ${r.backupAnterior}`)
      if (arquivo.current) arquivo.current.value = ''
      setNomeArquivo('')
      await carregar()
      await aoRestaurar()
    } catch (e) {
      notificar(mensagemErro(e), true)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Backup"
        descricao="Um backup automático é criado por dia ao abrir o programa. Os 15 mais recentes são mantidos."
        acoes={<Botao variante="primario" onClick={fazerBackup} disabled={ocupado} icone={<HardDrive size={16} />}>Fazer backup agora</Botao>}
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Painel titulo="Backups salvos" semPadding>
          {lista && <p className="break-all border-b border-slate-200 px-4 py-2 text-xs text-slate-500">Pasta: {lista.pasta}</p>}
          <Tabela colunas={[{ titulo: 'Arquivo' }, { titulo: 'Data' }, { titulo: 'Tamanho', alinhar: 'direita' }, { titulo: '', largura: 'w-40' }]} vazio="Nenhum backup ainda.">
            {(lista?.backups || []).map(b => (
              <tr key={b.nome} className="hover:bg-slate-50">
                <td className={`${celula} whitespace-nowrap font-mono text-xs`}>{b.nome}</td>
                <td className={`${celula} whitespace-nowrap text-slate-600`}>{new Date(b.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className={`${celulaNumero} text-slate-600`}>{tamanho(b.tamanho)}</td>
                <td className={`${celula} text-right`}>
                  <a href={`/api/backup?arquivo=${encodeURIComponent(b.nome)}`} download={b.nome} className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
                    <Download size={16} /> Salvar cópia
                  </a>
                </td>
              </tr>
            ))}
          </Tabela>
        </Painel>

        <Painel titulo="Restaurar backup">
          <div className="mb-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <p>Substitui todos os dados atuais. Antes, uma cópia dos dados atuais é salva automaticamente.</p>
          </div>
          <input ref={arquivo} id="arquivo-backup" type="file" accept=".db,.sqlite,application/octet-stream" className="sr-only" onChange={e => setNomeArquivo(e.target.files?.[0]?.name || '')} />
          <label htmlFor="arquivo-backup" className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50">
            <Upload size={16} /> <span className="truncate">{nomeArquivo || 'Escolher arquivo .db'}</span>
          </label>
          <Botao className="mt-3 w-full" onClick={restaurar} disabled={ocupado || !nomeArquivo}>Restaurar</Botao>
        </Painel>
      </div>
    </>
  )
}
