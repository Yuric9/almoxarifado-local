import { getDb } from './db'

export type Tema = 'sistema' | 'claro' | 'escuro'

export type Configuracoes = {
  empresa_nome: string
  empresa_setor: string
  entregue_por_padrao: string
  estoque_minimo_padrao: number
  backups_manter: number
  tema: Tema
}

export const CONFIG_PADRAO: Configuracoes = {
  empresa_nome: '',
  empresa_setor: 'Almoxarifado',
  entregue_por_padrao: '',
  estoque_minimo_padrao: 5,
  backups_manter: 15,
  tema: 'sistema'
}

const TEMAS: Tema[] = ['sistema', 'claro', 'escuro']

export function lerConfiguracoes(): Configuracoes {
  const linhas = getDb().prepare('SELECT chave, valor FROM configuracoes').all() as Array<{ chave: string; valor: string }>
  const salvas = Object.fromEntries(linhas.map(l => [l.chave, l.valor]))
  return {
    empresa_nome: salvas.empresa_nome ?? CONFIG_PADRAO.empresa_nome,
    empresa_setor: salvas.empresa_setor ?? CONFIG_PADRAO.empresa_setor,
    entregue_por_padrao: salvas.entregue_por_padrao ?? CONFIG_PADRAO.entregue_por_padrao,
    estoque_minimo_padrao: numero(salvas.estoque_minimo_padrao, CONFIG_PADRAO.estoque_minimo_padrao),
    backups_manter: numero(salvas.backups_manter, CONFIG_PADRAO.backups_manter),
    tema: TEMAS.includes(salvas.tema as Tema) ? (salvas.tema as Tema) : CONFIG_PADRAO.tema
  }
}

function numero(valor: string | undefined, padrao: number) {
  const n = Number(valor)
  return valor !== undefined && Number.isFinite(n) ? n : padrao
}

/** Salva apenas os campos enviados, validando cada um. */
export function salvarConfiguracoes(dados: Record<string, unknown>) {
  const validos: Partial<Record<keyof Configuracoes, string>> = {}

  for (const chave of ['empresa_nome', 'empresa_setor', 'entregue_por_padrao'] as const) {
    if (dados[chave] === undefined) continue
    const valor = String(dados[chave] ?? '').trim()
    if (valor.length > 120) throw new Error('Texto muito longo')
    validos[chave] = valor
  }
  if (dados.estoque_minimo_padrao !== undefined) {
    const n = Number(dados.estoque_minimo_padrao)
    if (!Number.isFinite(n) || n < 0) throw new Error('Estoque mínimo padrão inválido')
    validos.estoque_minimo_padrao = String(n)
  }
  if (dados.backups_manter !== undefined) {
    const n = Number(dados.backups_manter)
    if (!Number.isInteger(n) || n < 1 || n > 365) throw new Error('Quantidade de backups deve ser entre 1 e 365')
    validos.backups_manter = String(n)
  }
  if (dados.tema !== undefined) {
    if (!TEMAS.includes(dados.tema as Tema)) throw new Error('Tema inválido')
    validos.tema = String(dados.tema)
  }

  const db = getDb()
  const upsert = db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor')
  db.transaction(() => {
    for (const [chave, valor] of Object.entries(validos)) upsert.run(chave, valor)
  })()
  return lerConfiguracoes()
}
