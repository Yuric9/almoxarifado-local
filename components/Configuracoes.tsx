'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { Check, Monitor, Moon, Pencil, Plus, Sun, Trash2, X } from 'lucide-react'
import { api, mensagemErro } from '@/lib/cliente'
import type { CategoriaResumo, Configuracoes, Sistema, Tema } from '@/lib/tipos'
import { Botao, CabecalhoPagina, Campo, Painel, Tabela, celula, celulaNumero, classeInput } from './ui'

export function TelaConfiguracoes({ config, sistema, categorias, aoSalvar, aoAlterarCategorias, notificar, abrirBackup, abrirPlanilhas }: {
  config: Configuracoes
  sistema: Sistema | null
  categorias: CategoriaResumo[]
  aoSalvar: (c: Configuracoes) => void
  aoAlterarCategorias: () => Promise<void>
  notificar: (msg: string, erro?: boolean) => void
  abrirBackup: () => void
  abrirPlanilhas: () => void
}) {
  const [form, setForm] = useState(config)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => setForm(config), [config])

  const alterado = JSON.stringify({ ...form, tema: config.tema }) !== JSON.stringify(config)
  const campo = (nome: keyof Configuracoes) => (e: { target: { value: string } }) => setForm({ ...form, [nome]: e.target.value })

  async function salvar(dados: Partial<Configuracoes>, mensagem = 'Configurações salvas') {
    setSalvando(true)
    try {
      const nova = await api<Configuracoes>('/api/configuracoes', { method: 'PATCH', json: dados })
      aoSalvar(nova)
      notificar(mensagem)
    } catch (e) {
      notificar(mensagemErro(e), true)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <CabecalhoPagina titulo="Configurações" descricao="Preferências do sistema. Ficam salvas junto com os dados (vão com o HD)." />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <Painel titulo="Aparência">
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
              <OpcaoTema atual={config.tema} valor="claro" icone={<Sun size={18} />} rotulo="Claro" aoEscolher={t => salvar({ tema: t }, 'Tema alterado')} />
              <OpcaoTema atual={config.tema} valor="escuro" icone={<Moon size={18} />} rotulo="Escuro" aoEscolher={t => salvar({ tema: t }, 'Tema alterado')} />
              <OpcaoTema atual={config.tema} valor="sistema" icone={<Monitor size={18} />} rotulo="Igual ao Windows" aoEscolher={t => salvar({ tema: t }, 'Tema alterado')} />
            </div>
          </Painel>

          <Painel titulo="Empresa e padrões">
            <form
              className="space-y-4"
              onSubmit={e => {
                e.preventDefault()
                salvar({
                  empresa_nome: form.empresa_nome,
                  empresa_setor: form.empresa_setor,
                  entregue_por_padrao: form.entregue_por_padrao,
                  estoque_minimo_padrao: Number(form.estoque_minimo_padrao),
                  backups_manter: Number(form.backups_manter)
                })
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Nome da empresa / obra" opcional>
                  <input value={form.empresa_nome} onChange={campo('empresa_nome')} className={classeInput} placeholder="Aparece no comprovante e nos relatórios" />
                </Campo>
                <Campo rotulo="Setor">
                  <input value={form.empresa_setor} onChange={campo('empresa_setor')} className={classeInput} />
                </Campo>
                <Campo rotulo="“Entregue por” padrão" opcional>
                  <input value={form.entregue_por_padrao} onChange={campo('entregue_por_padrao')} className={classeInput} placeholder="Preenche a retirada automaticamente" />
                </Campo>
                <Campo rotulo="Estoque mínimo padrão">
                  <input type="number" min="0" step="any" value={form.estoque_minimo_padrao} onChange={campo('estoque_minimo_padrao')} className={classeInput} />
                </Campo>
                <Campo rotulo="Backups automáticos a manter">
                  <input type="number" min="1" max="365" step="1" value={form.backups_manter} onChange={campo('backups_manter')} className={classeInput} />
                </Campo>
              </div>
              <div className="flex justify-end gap-2">
                {alterado && <Botao onClick={() => setForm(config)}>Descartar</Botao>}
                <Botao type="submit" variante="primario" disabled={!alterado || salvando}>Salvar</Botao>
              </div>
            </form>
          </Painel>

          <Painel titulo="Dados e sistema">
            <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
              <dt className="text-slate-500">Versão</dt><dd className="text-slate-900">{sistema?.versao || '—'}</dd>
              <dt className="text-slate-500">Modo</dt><dd className="text-slate-900">{sistema?.modo === 'portatil' ? 'Portátil (dados junto ao programa)' : sistema?.modo === 'instalado' ? 'Instalado' : 'Desenvolvimento'}</dd>
              <dt className="text-slate-500">Pasta de dados</dt><dd className="break-all font-mono text-xs text-slate-900">{sistema?.pasta_dados || '—'}</dd>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Botao onClick={abrirBackup}>Backup e restauração</Botao>
              <Botao onClick={abrirPlanilhas}>Importar / exportar planilhas</Botao>
            </div>
          </Painel>
        </div>

        <GerenciarCategorias categorias={categorias} aoAlterar={aoAlterarCategorias} notificar={notificar} />
      </div>
      <p className="mt-8 text-center text-[11px] text-slate-400">Almoxarifado Local · Sistema desenvolvido por YC Soluções Tecnológicas</p>
    </>
  )
}

function OpcaoTema({ atual, valor, icone, rotulo, aoEscolher }: { atual: Tema; valor: Tema; icone: ReactNode; rotulo: string; aoEscolher: (t: Tema) => void }) {
  const ativo = atual === valor
  return (
    <button role="radio" aria-checked={ativo} onClick={() => aoEscolher(valor)}
      className={`flex flex-col items-center gap-1.5 rounded-md border px-3 py-3 text-sm font-medium transition ${ativo ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
      {icone}{rotulo}
    </button>
  )
}

const CORES = ['#2563EB', '#0EA5E9', '#16A34A', '#F59E0B', '#DC2626', '#9333EA', '#DB2777', '#64748B']

function GerenciarCategorias({ categorias, aoAlterar, notificar }: { categorias: CategoriaResumo[]; aoAlterar: () => Promise<void>; notificar: (msg: string, erro?: boolean) => void }) {
  const [nova, setNova] = useState({ nome: '', cor: CORES[0] })
  const [editando, setEditando] = useState<{ id: number; nome: string; cor: string } | null>(null)

  async function executar(acao: () => Promise<unknown>, mensagem: string) {
    try {
      await acao()
      await aoAlterar()
      notificar(mensagem)
      return true
    } catch (e) {
      notificar(mensagemErro(e), true)
      return false
    }
  }

  return (
    <Painel titulo="Categorias" semPadding>
      <form
        className="flex flex-wrap items-end gap-2 border-b border-slate-200 p-3"
        onSubmit={async e => {
          e.preventDefault()
          if (await executar(() => api('/api/categorias', { method: 'POST', json: nova }), `Categoria "${nova.nome}" criada`)) setNova({ nome: '', cor: nova.cor })
        }}
      >
        <Campo rotulo="Nova categoria" className="min-w-[180px] flex-1">
          <input required value={nova.nome} onChange={e => setNova({ ...nova, nome: e.target.value })} className={classeInput} placeholder="Ex.: Pintura" />
        </Campo>
        <SeletorCor valor={nova.cor} aoMudar={cor => setNova({ ...nova, cor })} />
        <Botao type="submit" variante="primario" icone={<Plus size={16} />}>Adicionar</Botao>
      </form>
      <Tabela colunas={[{ titulo: 'Categoria' }, { titulo: 'Materiais', alinhar: 'direita' }, { titulo: '', largura: 'w-24' }]} vazio="Nenhuma categoria.">
        {categorias.map(c => editando?.id === c.id ? (
          <tr key={c.id}>
            <td className={celula} colSpan={2}>
              <div className="flex flex-wrap items-center gap-2">
                <input autoFocus aria-label="Nome da categoria" value={editando.nome} onChange={e => setEditando({ ...editando, nome: e.target.value })} className={`${classeInput} max-w-xs`} />
                <SeletorCor valor={editando.cor} aoMudar={cor => setEditando({ ...editando, cor })} />
              </div>
            </td>
            <td className={`${celula} text-right`}>
              <div className="flex justify-end gap-1">
                <button aria-label="Salvar" title="Salvar" className="rounded p-1.5 text-emerald-700 hover:bg-slate-100"
                  onClick={async () => { if (await executar(() => api(`/api/categorias/${c.id}`, { method: 'PATCH', json: editando }), 'Categoria atualizada')) setEditando(null) }}>
                  <Check size={16} />
                </button>
                <button aria-label="Cancelar" title="Cancelar" className="rounded p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setEditando(null)}><X size={16} /></button>
              </div>
            </td>
          </tr>
        ) : (
          <tr key={c.id}>
            <td className={celula}>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.cor }} />
                {c.nome}
              </span>
            </td>
            <td className={`${celulaNumero} text-slate-500`}>{c.total_materiais}</td>
            <td className={`${celula} text-right`}>
              <div className="flex justify-end gap-1">
                <button aria-label={`Editar ${c.nome}`} title="Editar" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={() => setEditando({ id: c.id, nome: c.nome, cor: c.cor })}><Pencil size={16} /></button>
                <button aria-label={`Excluir ${c.nome}`} title={c.total_materiais ? 'Em uso por materiais' : 'Excluir'} disabled={c.total_materiais > 0}
                  className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-30 disabled:hover:bg-transparent"
                  onClick={() => { if (window.confirm(`Excluir a categoria "${c.nome}"?`)) executar(() => api(`/api/categorias/${c.id}`, { method: 'DELETE' }), 'Categoria excluída') }}>
                  <Trash2 size={16} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </Tabela>
    </Painel>
  )
}

function SeletorCor({ valor, aoMudar }: { valor: string; aoMudar: (cor: string) => void }) {
  return (
    <div className="flex h-9 items-center gap-1" role="radiogroup" aria-label="Cor">
      {CORES.map(cor => (
        <button key={cor} type="button" role="radio" aria-checked={valor === cor} aria-label={cor} onClick={() => aoMudar(cor)}
          className={`h-5 w-5 rounded-full ring-offset-2 ring-offset-superficie ${valor === cor ? 'ring-2 ring-slate-500' : ''}`} style={{ backgroundColor: cor }} />
      ))}
    </div>
  )
}
