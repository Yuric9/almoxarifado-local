# Backup e recuperação

## Backup

Na aplicação local, o botão **Fazer backup** baixa uma cópia do arquivo SQLite como `almoxarifado-backup.db`.

## Onde os dados ficam

Em instalação desktop, o banco deve ficar no diretório de dados do usuário e não dentro da pasta do programa. Isso permite atualizar o aplicativo sem apagar o estoque.

## Recuperação

A restauração será adicionada em uma etapa própria para evitar sobrescrever o banco ativo acidentalmente. A cópia original deve ser mantida antes de qualquer restauração.
