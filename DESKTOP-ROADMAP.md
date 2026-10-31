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
- [x] Ícone próprio do aplicativo (`build/icon.ico`, gerado de `build/icon.svg`)
- [ ] Assinatura digital do executável

## Etapa 3 — Operação
- [x] Backup manual e automático diário
- [x] Restauração com validação e cópia de segurança
- [x] Comprovante de retirada imprimível
- [x] Editar / inativar / excluir material, com código e localização
- [x] Baixa por perda, roubo, vencimento ou quebra
- [x] Ajuste de inventário e estorno de retirada
- [x] Detalhe e edição de reservas
- [x] Importação e exportação de planilhas (.xlsx e .csv)
- [x] Relatórios diários, mensais e por período (impressão, Excel e CSV)
- [x] Configurações: tema claro/escuro, empresa, padrões e categorias
- [x] Importar nota fiscal (DANFE), pedido ou lista em PDF, Word ou Excel
- [ ] Leitura de PDF escaneado (OCR)
- [x] Importar o XML da NF-e (mais preciso que o PDF)
- [x] Classificação automática de materiais pela tabela GOINFRA/AGETOP
- [ ] Atualizar a tabela de referência importando a planilha nova da GOINFRA ou do SINAPI
- [x] Usuários e permissões (login, perfis Administrador/Almoxarife/Consulta, "registrado por")
- [x] Cadastro de setores/obras e funcionários (consumo por setor)
- [x] Ficha de EPI por funcionário (NR-6, com CA)
- [x] Empréstimo de ferramentas (sai e volta)
- [ ] Estoque máximo e lista de reposição
- [x] Inventário completo (folha de contagem e divergências)
- [ ] Cadastro de fornecedores e pedidos de compra
- [ ] Migrar para Next.js 15 (alertas de segurança do Next 14 em recursos não usados pelo app)

## Validação manual pendente (Windows)
- [ ] Executar a versão ZIP a partir de um HD externo e trocar de computador
- [ ] Instalar e atualizar pelo NSIS sem perder dados
- [ ] Imprimir o comprovante em uma impressora real
