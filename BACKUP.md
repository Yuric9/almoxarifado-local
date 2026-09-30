# Backup e recuperação

## Backup

O botão **Fazer backup** gera uma cópia SQLite consistente usando o mecanismo nativo de backup do banco. O arquivo baixado é `almoxarifado-backup.db`.

Isso evita depender de uma simples cópia do arquivo principal enquanto o SQLite está em modo WAL.

## Onde os dados ficam

Em instalação desktop, o banco fica no diretório de dados do usuário e não dentro da pasta do programa. Isso permite atualizar o aplicativo sem apagar o estoque.

## Recuperação

A restauração automática do banco ainda deve ser tratada como uma operação separada e explícita. Antes de restaurar, mantenha uma cópia do banco atual.

## Boas práticas

- Faça backup antes de atualizar a aplicação.
- Faça backup antes de qualquer operação de manutenção.
- Guarde cópias em outro local.
- Nunca coloque o arquivo `.db` no Git.