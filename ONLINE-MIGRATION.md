# Retomada da versão online

O projeto local usa SQLite, mas o modelo de dados mantém as mesmas entidades principais da versão Supabase: `categorias`, `produtos` e `movimentacoes`.

## Estratégia futura

1. Manter o SQLite como fonte local enquanto a sincronização não for implementada.
2. Reutilizar o schema documentado em `supabase.sql` para a versão online.
3. Criar uma camada de sincronização/repositório com operações equivalentes.
4. Migrar os registros locais para UUIDs quando a sincronização exigir identificação global.
5. Nunca colocar service-role keys no cliente.

A separação entre UI, API routes e `lib/repository.ts` existe justamente para permitir trocar o armazenamento sem reescrever a interface.
