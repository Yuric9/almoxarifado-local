# Roadmap Desktop

## Etapa 1 — Base local
- [x] Next.js + SQLite local
- [x] API local e camada de dados separada (`lib/repository.ts`)
- [x] Documentação para futura versão online

## Etapa 2 — Desktop
- [x] Electron com servidor Next interno
- [x] Servidor só em `127.0.0.1`, em porta livre
- [x] Instância única (evita dois processos no mesmo banco)
- [x] Instalador NSIS, `.exe` portátil e ZIP para HD (Windows x64)
- [x] Modo portátil: dados ao lado do executável (`Almoxarifado-Dados`)
- [x] Build do CI corrigido (SQLite era recompilado para o Electron antes do `next build`)
- [ ] Ícone próprio do aplicativo (`build/icon.ico`)
- [ ] Assinatura digital do executável

## Etapa 3 — Operação
- [x] Backup manual e automático diário
- [x] Restauração com validação e cópia de segurança
- [x] Comprovante de retirada imprimível
- [ ] Editar / inativar material
- [ ] Exportação CSV
- [ ] Relatório de movimentações por período

## Validação manual pendente (Windows)
- [ ] Executar a versão ZIP a partir de um HD externo e trocar de computador
- [ ] Instalar e atualizar pelo NSIS sem perder dados
- [ ] Imprimir o comprovante em uma impressora real
