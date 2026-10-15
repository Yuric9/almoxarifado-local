'use client'
import { useMemo, useRef, useState } from 'react'
import { FileText, TriangleAlert, Upload } from 'lucide-react'
import { api } from '@/lib/cliente'
import type { CategoriaResumo, DocumentoLido, Produto } from '@/lib/tipos'
import { AvisoErro, Badge, Botao, Campo, Modal, classeInput, useEnvio } from './ui'

type Linha = {
  incluir: boolean
  descricao: string
  codigo: string
  unidade: string
  quantidade: string
  /** '' = criar material novo; caso contrário, id do material existente. */
  produto_id: string
  motivo: 'codigo' | 'nome' | 'semelhante' | null
}

const MOTIVO: Record<string, string> = { codigo: 'pelo código', nome: 'pelo nome', semelhante: 'nome parecido' }

function observacaoPadrao(doc: DocumentoLido, arquivo: string) {
  if (doc.tipo === 'nfe') return [doc.numero && `NF-e ${doc.numero}`, doc.fornecedor, doc.data].filter(Boolean).join(' · ')
  return `Importado de ${arquivo}`
}

export function ImportarDocumentoModal({ produtos, categorias, aoFechar, aoConcluir }: {
  produtos: Produto[]
  categorias: CategoriaResumo[]
  aoFechar: () => void
  aoConcluir: (mensagem: string) => Promise<void>
}) {
  const arquivo = useRef<HTMLInputElement>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [doc, setDoc] = useState<DocumentoLido | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [modo, setModo] = useState<'entrada' | 'cadastro'>('entrada')
  const [observacao, setObservacao] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [categoriaNovos, setCategoriaNovos] = useState('auto')
  const leitura = useEnvio()
  const gravacao = useEnvio()

  const porId = useMemo(() => new Map(produtos.map(p => [String(p.id), p])), [produtos])

  function ler() {
    leitura.executar(async () => {
      const selecionado = arquivo.current?.files?.[0]
      if (!selecionado) throw new Error('Escolha um arquivo')
      const form = new FormData()
      form.append('arquivo', selecionado)
      const lido = await api<DocumentoLido>('/api/documentos/ler', { method: 'POST', body: form })
      setDoc(lido)
      setObservacao(observacaoPadrao(lido, selecionado.name))
      setLinhas(lido.itens.map(i => ({
        incluir: true,
        descricao: i.descricao,
        codigo: i.codigo || '',
        unidade: i.unidade || 'UN',
        quantidade: i.quantidade === null ? '' : String(i.quantidade),
        produto_id: i.sugestao ? String(i.sugestao.produto_id) : '',
        motivo: i.sugestao?.motivo || null
      })))
    })
  }

  const atualizar = (i: number, dados: Partial<Linha>) => setLinhas(ls => ls.map((l, j) => (j === i ? { ...l, ...dados } : l)))
  const selecionadas = linhas.filter(l => l.incluir)
  const novos = selecionadas.filter(l => !l.produto_id).length

  function confirmar() {
    gravacao.executar(async () => {
      if (!selecionadas.length) throw new Error('Marque pelo menos um item')
      const itens = selecionadas.map(l => ({
        produto_id: l.produto_id ? Number(l.produto_id) : null,
        nome: l.descricao,
        codigo: l.codigo,
        unidade: l.unidade,
        categoria_id: categoriaNovos === 'auto' ? 'auto' : categoriaNovos ? Number(categoriaNovos) : null,
        quantidade: l.quantidade === '' ? null : Number(l.quantidade.replace(',', '.'))
      }))
      const r = await api<{ criados: number; entradas: number }>('/api/documentos/aplicar', { method: 'POST', json: { modo, itens, observacao, responsavel } })
      const partes = [r.criados && `${r.criados} material(is) cadastrado(s)`, r.entradas && `${r.entradas} entrada(s) registrada(s)`].filter(Boolean)
      await aoConcluir(`Documento importado: ${partes.join(', ') || 'nada alterado'}`)
    })
  }

  return (
    <Modal
      titulo="Importar documento"
      descricao={doc ? undefined : 'Leia uma nota fiscal (XML ou DANFE em PDF), pedido ou lista de materiais em Word ou Excel.'}
      aoFechar={aoFechar}
      largura={doc ? 'max-w-6xl' : 'max-w-xl'}
    >
      {!doc ? (
        <div className="space-y-4">
          <input ref={arquivo} id="arquivo-documento" type="file" accept=".xml,.pdf,.docx,.xlsx,.csv" className="sr-only"
            onChange={e => setNomeArquivo(e.target.files?.[0]?.name || '')} />
          <label htmlFor="arquivo-documento" className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-6 py-8 text-center text-sm text-slate-600 hover:bg-slate-50">
            <Upload size={24} className="text-slate-400" />
            <span className="font-medium text-slate-900">{nomeArquivo || 'Escolher arquivo'}</span>
            <span>XML da NF-e · PDF (nota fiscal, pedido) · Word (.docx) · Excel (.xlsx, .csv)</span>
          </label>
          <ul className="list-inside list-disc space-y-1 text-xs text-slate-500">
            <li>O documento precisa ter uma tabela com colunas como <b>Descrição</b>, <b>Quantidade</b> e <b>Unidade</b>, ou ser uma nota fiscal DANFE.</li>
            <li>Tem o <b>XML da nota</b>? Prefira ele: a leitura é exata, sem depender do layout do PDF.</li>
            <li>PDF escaneado (foto/imagem) não tem texto para ler. Use o PDF original enviado pelo fornecedor.</li>
            <li>Nada é gravado antes de você conferir os itens na próxima etapa.</li>
          </ul>
          <AvisoErro texto={leitura.erro} />
          <div className="flex justify-end gap-2">
            <Botao onClick={aoFechar}>Cancelar</Botao>
            <Botao variante="primario" onClick={ler} disabled={!nomeArquivo || leitura.enviando} icone={<FileText size={16} />}>
              {leitura.enviando ? 'Lendo…' : 'Ler documento'}
            </Botao>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tom="azul">{doc.tipo === 'nfe' ? (doc.formato === 'xml' ? 'Nota fiscal (XML)' : 'Nota fiscal (DANFE)') : `Tabela · ${doc.formato.toUpperCase()}`}</Badge>
            {doc.numero && <span className="text-slate-700">Nº <b>{doc.numero}</b></span>}
            {doc.fornecedor && <span className="text-slate-700">· {doc.fornecedor}</span>}
            {doc.data && <span className="text-slate-500">· {doc.data}</span>}
            <span className="ml-auto text-slate-500">{linhas.length} item(ns) encontrados · {nomeArquivo}</span>
          </div>
          {doc.avisos.map(a => (
            <p key={a} className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><TriangleAlert size={16} className="mt-0.5 shrink-0" />{a}</p>
          ))}

          <div className="max-h-[45vh] overflow-auto rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-10 px-3 py-2">
                    <input type="checkbox" aria-label="Marcar todos" checked={linhas.every(l => l.incluir)} onChange={e => setLinhas(ls => ls.map(l => ({ ...l, incluir: e.target.checked })))} className="h-4 w-4" />
                  </th>
                  <th className="px-2 py-2">Descrição no documento</th>
                  <th className="w-28 px-2 py-2">Código</th>
                  <th className="w-24 px-2 py-2 text-right">Qtd.</th>
                  <th className="w-20 px-2 py-2">Un.</th>
                  <th className="w-72 px-2 py-2">Material no sistema</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linhas.map((l, i) => {
                  const material = l.produto_id ? porId.get(l.produto_id) : undefined
                  const unidadeDiferente = material && l.unidade && material.unidade !== l.unidade
                  return (
                    <tr key={i} className={l.incluir ? '' : 'opacity-50'}>
                      <td className="px-3 py-1.5 align-top">
                        <input type="checkbox" aria-label={`Incluir item ${i + 1}`} checked={l.incluir} onChange={e => atualizar(i, { incluir: e.target.checked })} className="mt-2 h-4 w-4" />
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <input aria-label={`Descrição do item ${i + 1}`} value={l.descricao} onChange={e => atualizar(i, { descricao: e.target.value })} className={`${classeInput} h-8`} />
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <input aria-label={`Código do item ${i + 1}`} value={l.codigo} onChange={e => atualizar(i, { codigo: e.target.value })} className={`${classeInput} h-8 font-mono text-xs`} />
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <input aria-label={`Quantidade do item ${i + 1}`} inputMode="decimal" value={l.quantidade} onChange={e => atualizar(i, { quantidade: e.target.value })}
                          className={`${classeInput} h-8 text-right ${l.incluir && modo === 'entrada' && !(Number(l.quantidade.replace(',', '.')) > 0) ? 'border-red-400' : ''}`} />
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <input aria-label={`Unidade do item ${i + 1}`} value={l.unidade} onChange={e => atualizar(i, { unidade: e.target.value.toUpperCase() })} className={`${classeInput} h-8`} />
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <select aria-label={`Material do item ${i + 1}`} value={l.produto_id} onChange={e => atualizar(i, { produto_id: e.target.value, motivo: null })} className={`${classeInput} h-8`}>
                          <option value="">+ Criar material novo</option>
                          {produtos.map(p => <option key={p.id} value={p.id}>{p.codigo ? `${p.codigo} · ` : ''}{p.nome} ({p.unidade})</option>)}
                        </select>
                        <p className="mt-0.5 text-xs">
                          {!l.produto_id && <span className="text-blue-700">Será cadastrado como “{l.descricao}”</span>}
                          {l.produto_id && l.motivo && <span className="text-emerald-700">Encontrado {MOTIVO[l.motivo]}</span>}
                          {unidadeDiferente && <span className="ml-1 text-amber-700">· Atenção: o material usa {material.unidade}, o documento {l.unidade}. Ajuste a quantidade.</span>}
                        </p>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_200px_220px]">
            <Campo rotulo="Observação nas movimentações">
              <input value={observacao} onChange={e => setObservacao(e.target.value)} className={classeInput} />
            </Campo>
            <Campo rotulo="Recebido por" opcional>
              <input value={responsavel} onChange={e => setResponsavel(e.target.value)} className={classeInput} />
            </Campo>
            <Campo rotulo="Categoria dos novos">
              <select value={categoriaNovos} onChange={e => setCategoriaNovos(e.target.value)} className={classeInput} disabled={!novos}>
                <option value="auto">Automática (pelo nome)</option>
                <option value="">Sem categoria</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
          </div>

          <AvisoErro texto={gravacao.erro} />

          <div className="-mx-5 -mb-4 flex flex-wrap items-center gap-4 border-t border-slate-200 bg-slate-50 px-5 py-3">
            <div className="flex flex-wrap gap-4 text-sm text-slate-700" role="radiogroup" aria-label="O que fazer">
              <label className="inline-flex items-center gap-2"><input type="radio" name="modo" checked={modo === 'entrada'} onChange={() => setModo('entrada')} /> Dar entrada no estoque</label>
              <label className="inline-flex items-center gap-2"><input type="radio" name="modo" checked={modo === 'cadastro'} onChange={() => setModo('cadastro')} /> Apenas cadastrar materiais</label>
            </div>
            <span className="ml-auto text-xs text-slate-500">{selecionadas.length} selecionado(s){novos ? ` · ${novos} novo(s)` : ''}</span>
            <Botao onClick={() => { setDoc(null); setLinhas([]) }}>Voltar</Botao>
            <Botao variante="primario" onClick={confirmar} disabled={gravacao.enviando || !selecionadas.length}>
              {gravacao.enviando ? 'Gravando…' : modo === 'entrada' ? 'Confirmar entrada' : 'Cadastrar materiais'}
            </Botao>
          </div>
        </div>
      )}
    </Modal>
  )
}

