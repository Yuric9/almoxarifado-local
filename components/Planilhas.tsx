'use client'
import { useRef, useState } from 'react'
import { CircleCheck, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { api } from '@/lib/cliente'
import type { ResultadoImportacao } from '@/lib/tipos'
import { AvisoErro, Botao, Modal, useEnvio } from './ui'

const linkBotao = 'inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-superficie px-3 text-sm font-medium text-slate-700 hover:bg-slate-50'

export function PlanilhasModal({ aoFechar, aoImportar }: { aoFechar: () => void; aoImportar: (mensagem: string) => Promise<void> }) {
  const arquivo = useRef<HTMLInputElement>(null)
  const [nome, setNome] = useState('')
  const [ajustar, setAjustar] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const { enviando, erro, executar } = useEnvio()

  function importar() {
    executar(async () => {
      const selecionado = arquivo.current?.files?.[0]
      if (!selecionado) throw new Error('Escolha uma planilha .xlsx ou .csv')
      const form = new FormData()
      form.append('arquivo', selecionado)
      form.append('ajustar_quantidade', String(ajustar))
      const r = await api<ResultadoImportacao>('/api/planilhas/importar', { method: 'POST', body: form })
      setResultado(r)
      await aoImportar(`Importação concluída: ${r.criados} novo(s), ${r.atualizados} atualizado(s)`)
    })
  }

  return (
    <Modal titulo="Planilhas de materiais" descricao="Exporte o cadastro para o Excel ou importe materiais em lote." aoFechar={aoFechar} largura="max-w-2xl">
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Exportar</h3>
          <div className="flex flex-wrap gap-2">
            <a href="/api/planilhas/materiais?formato=xlsx" download className={linkBotao}><FileSpreadsheet size={16} /> Excel (.xlsx)</a>
            <a href="/api/planilhas/materiais?formato=csv" download className={linkBotao}><Download size={16} /> CSV</a>
          </div>
        </section>

        <section className="border-t border-slate-200 pt-5">
          <h3 className="mb-1 text-sm font-semibold text-slate-900">Importar</h3>
          <p className="mb-3 text-sm text-slate-600">
            A primeira linha deve ter os títulos das colunas. Obrigatória: <b>Nome</b>. Opcionais: Código, Categoria, Unidade, Estoque mínimo, Localização e Quantidade.
            Materiais já cadastrados (mesmo código ou nome) são atualizados; categorias novas são criadas automaticamente.
          </p>
          <a href="/api/planilhas/modelo" download className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
            <Download size={14} /> Baixar planilha modelo
          </a>

          <input ref={arquivo} id="arquivo-planilha" type="file" accept=".xlsx,.csv" className="sr-only" onChange={e => { setNome(e.target.files?.[0]?.name || ''); setResultado(null) }} />
          <label htmlFor="arquivo-planilha" className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50">
            <Upload size={16} /> <span className="truncate">{nome || 'Escolher planilha (.xlsx ou .csv)'}</span>
          </label>
          <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={ajustar} onChange={e => setAjustar(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
            <span>Atualizar o estoque dos materiais existentes com a coluna Quantidade <span className="text-slate-500">(gera um ajuste de inventário para cada diferença)</span></span>
          </label>
          <div className="mt-3 flex justify-end">
            <Botao variante="primario" onClick={importar} disabled={enviando || !nome} icone={<Upload size={16} />}>{enviando ? 'Importando…' : 'Importar'}</Botao>
          </div>
          <div className="mt-3"><AvisoErro texto={erro} /></div>

          {resultado && (
            <div className="mt-3 rounded-md border border-slate-200 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-slate-900">
                <CircleCheck size={16} className="text-emerald-600" />
                {resultado.criados} criado(s) · {resultado.atualizados} atualizado(s){resultado.ajustados ? ` · ${resultado.ajustados} estoque(s) ajustado(s)` : ''}
              </p>
              {resultado.erros.length > 0 && (
                <div className="mt-2">
                  <p className="text-red-700">{resultado.erros.length} linha(s) não importada(s):</p>
                  <ul className="mt-1 max-h-40 list-inside list-disc overflow-auto text-slate-600">
                    {resultado.erros.map(e => <li key={e.linha}>Linha {e.linha}: {e.mensagem}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
