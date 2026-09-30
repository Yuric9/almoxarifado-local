# Backup e recuperação

## Onde ficam os dados

| Versão | Pasta de dados |
| --- | --- |
| ZIP / portátil (HD) | `Almoxarifado-Dados\` ao lado do `.exe` |
| Instalada (NSIS) | `%APPDATA%\Almoxarifado Local\data\` |
| Desenvolvimento | `./data/` |

O caminho exato aparece no rodapé do programa e na tela **💾 Backup**.

## Backup automático

Ao abrir o programa, é feito **um backup por dia** em `backups/` (`almoxarifado-auto-AAAA-MM-DD_hh-mm-ss.db`). Ficam guardados os 15 mais recentes.

## Backup manual

Em **💾 Backup → Fazer backup agora** é criado `almoxarifado-manual-….db` na pasta `backups/`. Com **Salvar cópia…** você grava qualquer backup em outro lugar (pendrive, nuvem, outro disco).

Os backups são gerados com `VACUUM INTO`, que produz uma cópia consistente mesmo com o programa em uso.

## Restauração

Em **💾 Backup → Restaurar um backup**, escolha um arquivo `.db` e confirme.

1. O arquivo é validado (integridade do SQLite e tabelas do Almoxarifado).
2. Os dados atuais são salvos em `almoxarifado-antes-da-restauracao-….db`.
3. O banco é substituído e as migrações são aplicadas, então backups de versões antigas também funcionam.

## Boas práticas

- Guarde cópias **fora do HD** do programa. O backup automático protege contra erros de uso, não contra perda ou defeito do HD.
- Faça um backup manual antes de atualizar o programa.
- Feche o programa antes de desconectar o HD.
- Nunca coloque arquivos `.db` no Git.
