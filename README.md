# Almoxarifado Local

Controle de estoque **offline e portátil** para Windows. Funciona direto de um HD externo ou pendrive: o programa e os dados ficam juntos, sem instalar nada no computador e sem internet.

Feito com Next.js 14, React 18, Tailwind CSS, SQLite (`better-sqlite3`) e Electron.

## Funcionalidades

- **Painel** com indicadores clicáveis (materiais, abaixo do mínimo, reservas abertas, movimentações do dia).
- **Materiais** com código, categoria, unidade, localização e estoque mínimo. Clicar em um material abre a **ficha**, com histórico, reservas e as ações de entrada, baixa, ajuste, edição, inativação e exclusão.
- **Entrada rápida**: material, quantidade e observação.
- **Baixa por perda, roubo, vencimento ou quebra**, com motivo registrado no histórico.
- **Ajuste de inventário**: informe a quantidade contada e o sistema lança a diferença.
- **Requisição de retirada** com número automático (`REQ-2026-000001`), **comprovante A4 para imprimir** e **estorno** de retiradas lançadas por engano.
- **Reservas / pedidos separados**: bloqueiam a quantidade sem baixar o estoque físico. Clicar no pedido mostra os itens e permite editar, retirar ou cancelar. Ciclo: `SEPARADO → AGUARDANDO_RETIRADA → RETIRADO` (ou `CANCELADO`).
- **Relatórios** diários, mensais ou por período: totais, movimentação dia a dia, saldo inicial e final por material, retiradas e movimentações, com impressão e exportação em Excel e CSV.
- **Planilhas**: exportar os materiais em Excel (.xlsx) ou CSV e importar em lote, com planilha modelo.
- **Configurações**: tema claro, escuro ou igual ao Windows; nome da empresa no comprovante; padrões; e categorias (criar, renomear, mudar cor e excluir).
- **Backup automático diário**, backup manual e **restauração** pela própria tela.
- Diferencia **estoque físico**, **reservado** e **disponível**. Uma retirada comum nunca consome material reservado.
- **Auditoria**: toda movimentação registra a origem (estoque inicial, entrada, retirada, reserva, baixa, ajuste ou estorno), o motivo e o vínculo com a requisição.

## Uso no HD externo (modo portátil)

1. Baixe `Almoxarifado-Local-HD-<versão>.zip` na página [Releases](https://github.com/Yuric9/almoxarifado-local/releases) do repositório.
2. Extraia a pasta inteira no HD, por exemplo `E:\Almoxarifado\`.
3. Abra `Almoxarifado Local.exe`.

Na primeira execução é criada a pasta de dados ao lado do programa:

```
E:\Almoxarifado\
├── Almoxarifado Local.exe
├── ... (arquivos do programa)
└── Almoxarifado-Dados\
    ├── almoxarifado.db      ← banco de dados
    ├── backups\             ← backups automáticos e manuais
    └── logs\servidor.log    ← log para diagnóstico
```

- Pode levar o HD para outro computador: os dados vão junto, mesmo se a letra da unidade mudar.
- O rodapé do programa mostra o modo (portátil/instalado) e onde os dados estão.
- **Feche o programa antes de desconectar o HD.** O banco usa gravação síncrona e arquivo único para reduzir riscos, mas remover o HD com o programa aberto pode perder a última operação.
- Também existe `Almoxarifado-Local-Portable-<versão>.exe` (arquivo único). Ele funciona igual, mas demora mais para abrir, porque se descompacta a cada execução. Para o HD, prefira o ZIP.
- A versão instalada (`Almoxarifado-Local-Setup-<versão>.exe`) guarda os dados em `%APPDATA%\Almoxarifado Local\data`.

## Desenvolvimento

Requisitos: Node.js 20 ou superior (o CI usa a versão do `.nvmrc`).

```bash
npm install
npm run dev            # http://127.0.0.1:3000 (dados em ./data)
npm run desktop:dev    # mesma coisa, dentro da janela do Electron
```

| Comando | O que faz |
| --- | --- |
| `npm run lint` | ESLint (regras do Next.js) |
| `npm run typecheck` | Verificação de tipos do TypeScript |
| `npm test` | Testes das regras de estoque, reservas, migração e backup (Vitest) |
| `npm run check` | Os três acima |
| `npm run build` | Build de produção do Next.js |
| `npm run desktop:package:win` | Gera instalador, `.exe` portátil e ZIP em `release/` (rodar no Windows) |
| `npm run rebuild:node` | Recompila o SQLite para o Node após empacotar (ver abaixo) |

> O empacotamento recompila o `better-sqlite3` para o Electron dentro do `node_modules`. Depois de empacotar localmente, rode `npm run rebuild:node` antes de voltar a usar `npm run dev` ou `npm test`.

### Estrutura

```
app/
  page.tsx               tela principal
  api/                   rotas locais (produtos, movimentacoes, requisicoes, reservas, backup, sistema)
components/              modais, formulários e comprovante
lib/
  db.ts                  conexão SQLite (aberta sob demanda) e migrações
  repository.ts          regras de negócio: materiais, categorias, entradas, baixas, ajustes, retiradas e reservas
  relatorios.ts          relatórios por período
  planilha.ts            importação e exportação de planilhas (.xlsx e .csv)
  configuracoes.ts       preferências salvas no banco
  backup.ts              backup, backup automático e restauração
  paths.ts               onde ficam banco e backups
scripts/                 utilitários de build
electron/main.cjs        janela desktop, servidor interno e escolha da pasta de dados
tests/                   testes automatizados
```

### Segurança

- O servidor interno escuta só em `127.0.0.1`, em uma porta livre escolhida a cada execução. Não fica acessível pela rede.
- Requisições de escrita vindas de outros sites são bloqueadas (`middleware.ts`).
- A janela usa `contextIsolation` e `sandbox`, e links externos abrem no navegador padrão.

## CI

O workflow `.github/workflows/ci.yml` roda lint, tipos, testes e build a cada push ou PR. Depois gera os pacotes Windows e publica como artefato, com `SHA256SUMS.txt`.

Ao mesclar na `main`, o CI cria automaticamente a Release `v<versão do package.json>` com os executáveis. Para lançar uma nova versão, aumente o campo `version` do `package.json` no PR. Enviar uma tag `v*` também publica uma Release.

## Mais documentação

- [BACKUP.md](BACKUP.md): backup e restauração
- [DESKTOP-ROADMAP.md](DESKTOP-ROADMAP.md): próximos passos
- [ONLINE-MIGRATION.md](ONLINE-MIGRATION.md): como retomar uma versão online (Supabase)
