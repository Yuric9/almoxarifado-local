-- COLE ISSO NO SQL EDITOR DO SUPABASE
create table categorias (id uuid primary key default gen_random_uuid(), nome text not null, cor text default '#2563EB');
create table produtos (id uuid primary key default gen_random_uuid(), nome text not null, categoria_id uuid references categorias(id), quantidade_atual numeric default 0, estoque_minimo numeric default 5, unidade text default 'UN', criado_em timestamp default now());
create table movimentacoes (id uuid primary key default gen_random_uuid(), produto_id uuid references produtos(id) on delete cascade, tipo text check (tipo in ('ENTRADA','SAIDA')), quantidade numeric not null, responsavel text, observacao text, criado_em timestamp default now());

-- RLS
alter table produtos enable row level security;
alter table movimentacoes enable row level security;
alter table categorias enable row level security;
create policy "public" on produtos for all using (true) with check (true);
create policy "public" on movimentacoes for all using (true) with check (true);
create policy "public" on categorias for all using (true) with check (true);

-- Function que atualiza estoque e impede negativo
create or replace function atualiza_estoque() returns trigger as $$
begin
  if NEW.tipo = 'ENTRADA' then
    update produtos set quantidade_atual = quantidade_atual + NEW.quantidade where id = NEW.produto_id;
  else
    if (select quantidade_atual from produtos where id = NEW.produto_id) < NEW.quantidade then
      raise exception 'Estoque insuficiente';
    end if;
    update produtos set quantidade_atual = quantidade_atual - NEW.quantidade where id = NEW.produto_id;
  end if;
  return NEW;
end;
$$ language plpgsql;
drop trigger if exists trg_estoque on movimentacoes;
create trigger trg_estoque after insert on movimentacoes for each row execute function atualiza_estoque;

-- Dados iniciais
insert into categorias (nome, cor) values ('Ferramentas','#F59E0B'),('Elétrica','#2563EB'),('Hidráulica','#0EA5E9'),('Limpeza','#16A34A');
