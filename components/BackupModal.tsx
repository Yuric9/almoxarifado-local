'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, mensagemErro } from '@/lib/cliente'
import { Modal } from './ui'

type Lista = { pasta: string; backups: Array<{ nome: string; tamanho: number; criado_em: string }> }

const tamanho = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function BackupModal({ aoFechar, aoRestaurar }: { aoFechar: () => void; aoRestaurar: () => void | Promise<void> }) {
  const [lista, setLista] = useState<Lista | null>(null)
  const [status, setStatus] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    try { setLista(await api<Lista>('/api/backup')) } catch (e) { setStatus({ tipo: 'erro', texto: mensagemErro(e) }) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function fazerBackup() {
    setOcupado(true)
    try {
      const r = await api<{ arquivo: string }>('/api/backup', { method: 'POST' })
      setStatus({ tipo: 'ok', texto: `Backup salvo: ${r.arquivo}` })
      await carregar()
    } catch (e) {
      setStatus({ tipo: 'erro', texto: mensagemErro(e) })
    } finally {
      setOcupado(false)
    }
  }

  async function restaurar() {
    const selecionado = arquivo.current?.files?.[0]
    if (!selecionado) return setStatus({ tipo: 'erro', texto: 'Escolha um arquivo .db para restaurar' })
    if (!window.confirm(`Substituir TODOS os dados atuais pelo backup "${selecionado.name}"?\n\nUma cópia dos dados atuais será salva antes.`)) return
    setOcupado(true)
    try {
      const form = new FormData()
      form.append('arquivo', selecionado)
      const r = await api<{ backupAnterior: string }>('/api/backup/restaurar', { method: 'POST', body: form })
      setStatus({ tipo: 'ok', texto: `Backup restaurado. Os dados anteriores foram salvos em ${r.backupAnterior}` })
      if (arquivo.current) arquivo.current.value = ''
      await carregar()
      await aoRestaurar()
    } catch (e) {
      setStatus({ tipo: 'erro', texto: mensagemErro(e) })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Modal titulo="💾 Backup dos dados" subtitulo="Um backup automático é feito todo dia ao abrir o programa." aoFechar={aoFechar} largura="max-w-2xl">
      {status && (
        <p role="status" className={`mb-4 rounded-xl border px-4 py-3 font-semibold ${status.tipo === 'ok' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{status.texto}</p>
      )}

      <section className="mb-6">
        <button onClick={fazerBackup} disabled={ocupado} className="h-14 w-full rounded-xl bg-zinc-900 text-lg font-bold text-white disabled:opacity-60">Fazer backup agora</button>
        {lista && <p className="mt-2 break-all text-sm text-zinc-500">Pasta: {lista.pasta}</p>}
      </section>

      <section className="mb-6">
        <h3 className="mb-2 text-lg font-bold">Backups salvos</h3>
        {!lista?.backups.length && <p className="text-zinc-500">Nenhum backup ainda.</p>}
        <ul className="max-h-60 divide-y overflow-auto rounded-xl border">
          {lista?.backups.map(b => (
            <li key={b.nome} className="flex items-center justify-between gap-3 px-4 py-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{b.nome}</p>
                <p className="text-sm text-zinc-500">{new Date(b.criado_em).toLocaleString('pt-BR')} · {tamanho(b.tamanho)}</p>
              </div>
              <a href={`/api/backup?arquivo=${encodeURIComponent(b.nome)}`} download={b.nome} className="shrink-0 rounded-lg border px-3 py-2 font-semibold hover:bg-zinc-50">Salvar cópia…</a>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
        <h3 className="mb-1 text-lg font-bold text-amber-900">Restaurar um backup</h3>
        <p className="mb-3 text-sm text-amber-900">Substitui os dados atuais pelos do arquivo escolhido.</p>
        <div className="flex flex-wrap gap-2">
          <input ref={arquivo} type="file" accept=".db,.sqlite,application/octet-stream" className="min-w-0 flex-1" />
          <button onClick={restaurar} disabled={ocupado} className="rounded-xl bg-amber-600 px-4 py-2 font-bold text-white disabled:opacity-60">Restaurar</button>
        </div>
      </section>
    </Modal>
  )
}
