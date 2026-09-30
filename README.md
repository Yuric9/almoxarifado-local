# Almoxarifado Local

Controle de estoque **offline e portátil** para Windows. Funciona direto de um HD externo ou pendrive: o programa e os dados ficam juntos, sem instalar nada no computador e sem internet.

Feito com Next.js 14, React 18, Tailwind CSS, SQLite (`better-sqlite3`) e Electron.

## Funcionalidades

- **Materiais** com categoria, unidade (UN, KG, CX, L…) e alerta de estoque mínimo.
- **Entrada rápida**: material, quantidade e observação.
- **Requisição de retirada** com número automático (`REQ-2026-000001`) e **comprovante para imprimir** com campos de assinatura.
- **Reservas / pedidos separados**: bloqueiam a quantidade sem baixar o estoque físico. Ciclo: `SEPARADO → AGUARDANDO_RETIRADA → RETIRADO` (ou `CANCELADO`).
- Diferencia **estoque físico**, **reservado** e **disponível**. Uma retirada comum nunca consome material reservado.
- **Auditoria**: toda movimentação registra a origem (`ESTOQUE_INICIAL`, `ENTRADA_MANUAL`, `REQUISICAO`, `RESERVA`) e o vínculo com a requisição.
- **Backup automático diário**, backup manual e **restauração** pela própria tela.

## Uso no HD externo (modo portátil)

1. Baixe `Almoxarifado-Local-HD-<versão>.zip` (artefato do GitHub Actions).
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
  repository.ts          regras de negócio (única camada que acessa o banco)
  backup.ts              backup, backup automático e restauração
  paths.ts               onde ficam banco e backups
electron/main.cjs        janela desktop, servidor interno e escolha da pasta de dados
tests/                   testes automatizados
```

### Segurança

- O servidor interno escuta só em `127.0.0.1`, em uma porta livre escolhida a cada execução. Não fica acessível pela rede.
- Requisições de escrita vindas de outros sites são bloqueadas (`middleware.ts`).
- A janela usa `contextIsolation` e `sandbox`, e links externos abrem no navegador padrão.

## CI

O workflow `.github/workflows/ci.yml` roda lint, tipos, testes e build a cada push ou PR. Depois gera os pacotes Windows e publica como artefato, com `SHA256SUMS.txt`.

## Mais documentação

- [BACKUP.md](BACKUP.md): backup e restauração
- [DESKTOP-ROADMAP.md](DESKTOP-ROADMAP.md): próximos passos
- [ONLINE-MIGRATION.md](ONLINE-MIGRATION.md): como retomar uma versão online (Supabase)
