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

A branch `feature/app-local` ainda contém a implementação original do MVP. A conversão para SQLite/Electron será feita em etapas, com testes antes de cada marco.
