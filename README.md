# Almoxarifado Local

Projeto em transformação de um MVP web de almoxarifado para um aplicativo **local, offline e portátil para Windows**.

## Estado atual

O conteúdo original do MVP foi versionado na branch `feature/app-local` como ponto de partida.

### MVP original
- Next.js 14
- React 18
- Tailwind CSS
- Supabase (referência da versão online)

### Objetivo da transformação
- SQLite como banco local
- Funcionamento sem internet
- Aplicativo Windows instalável
- Versão portátil
- Backup e restauração
- Interface simples para uso diário

## Versão online futura

O arquivo `supabase.sql` é preservado como referência do modelo online. Durante a migração para o modo local será criado `ONLINE-MIGRATION.md`, documentando a arquitetura e os passos necessários para retomar uma versão com Supabase no futuro.

## Importante

A branch `feature/app-local` concentra a conversão para SQLite/Electron em etapas. A `main` permanece estável até a validação do aplicativo desktop em Windows.

## Requisições de retirada

As retiradas de materiais são registradas como **Requisição de Material / Comprovante de Retirada**, com número automático, pessoa que retirou, setor, finalidade, materiais, quantidades, responsável pela entrega e impressão do comprovante. A baixa do estoque fica vinculada à requisição.

## Operação de estoque

### Entrada rápida
A entrada de material é propositalmente simples: material, quantidade e observação opcional. Não exige fornecedor, nota fiscal ou dados de empresa.

### Requisição / retirada
Toda saída comum deve nascer de uma **Requisição de Material / Comprovante de Retirada**. A baixa do estoque fica vinculada à requisição e a movimentação registra sua origem.

### Reservas / pedidos separados
Um pedido pode reservar materiais sem baixar o estoque físico. O ciclo é:
1. **SEPARADO** — quantidade bloqueada para aquele pedido.
2. **AGUARDANDO_RETIRADA** — pedido pronto e aguardando a pessoa.
3. **RETIRADO** — retirada concluída; estoque físico é baixado e uma requisição é criada.
4. **CANCELADO** — reserva liberada e quantidade volta a ficar disponível.

O sistema diferencia **estoque físico**, **quantidade reservada** e **quantidade disponível**. Uma retirada comum não pode consumir material que esteja reservado.

### Auditoria
Movimentações guardam a origem (`ENTRADA_MANUAL`, `ESTOQUE_INICIAL`, `REQUISICAO` ou `RESERVA`) e, quando aplicável, o vínculo com a requisição.

### Migração de bancos antigos
Ao abrir um banco local antigo, a aplicação converte automaticamente os status legados de reserva:
- `RESERVADA` → `SEPARADO`
- `RETIRADA` → `RETIRADO`
- `CANCELADA` → `CANCELADO`