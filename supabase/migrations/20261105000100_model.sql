-- Authoritative v0.5 schema. No users, company data or localStorage migration.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
-- Future objects owned by the migration role also start without API privileges.
alter default privileges revoke all on tables from public,anon,authenticated;
alter default privileges revoke all on sequences from public,anon,authenticated;
alter default privileges in schema public revoke all on tables from public,anon,authenticated;
alter default privileges in schema public revoke all on sequences from public,anon,authenticated;
-- PUBLIC's built-in function EXECUTE default is global; schema-only REVOKE cannot remove it.
alter default privileges revoke execute on functions from public,anon,authenticated;
alter default privileges in schema public revoke execute on functions from public,anon,authenticated;
alter default privileges in schema private revoke execute on functions from public,anon,authenticated;

create type public.app_role as enum (
  'funcionario_autorizado','almoxarife','coordenador','planejamento',
  'diretor','administrador','proprietario'
);
create type public.reference_kind as enum ('oc','nf');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 200),
  email text not null check (email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  role public.app_role not null default 'funcionario_autorizado',
  active boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(btrim(email)));
create table public.contracts (
  id uuid primary key default gen_random_uuid(), name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index contracts_name_key on public.contracts (lower(btrim(name)));
create table public.user_contracts (
  user_id uuid not null references public.profiles(id) on delete restrict,
  contract_id uuid not null references public.contracts(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (user_id,contract_id)
);
create index user_contracts_contract_idx on public.user_contracts(contract_id,user_id);
create table public.products (
  id uuid primary key default gen_random_uuid(), code text not null check (length(btrim(code)) between 1 and 80),
  code_key text generated always as (regexp_replace(upper(btrim(code)), '\s+', ' ', 'g')) stored unique,
  description text not null check (length(btrim(description)) between 2 and 240),
  unit text not null check (unit in ('un','m','m²','m³','kg','g','l','ml','saco','caixa','rolo','par','jogo','pacote','kit','t')),
  category text not null default '', manufacturer text not null default '', model text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.suppliers (
  id uuid primary key default gen_random_uuid(), name text not null check (btrim(name) <> ''),
  areas text not null default '', contact text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index suppliers_name_key on public.suppliers(lower(btrim(name)));
create table public.locations (
  id uuid primary key default gen_random_uuid(), contract_id uuid not null references public.contracts(id) on delete restrict,
  code text not null check (btrim(code) <> ''), description text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,contract_id)
);
create unique index locations_code_key on public.locations(contract_id,lower(btrim(code)));
create table public.contract_balances (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete restrict,
  contract_id uuid not null references public.contracts(id) on delete restrict,
  quantity numeric(24,6) not null check (quantity >= 0 and quantity <> 'NaN'::numeric),
  location_id uuid, supplier_id uuid references public.suppliers(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(product_id,contract_id), unique(id,contract_id),
  foreign key(location_id,contract_id) references public.locations(id,contract_id) on delete restrict
);
create index contract_balances_contract_idx on public.contract_balances(contract_id,product_id);
create index contract_balances_supplier_idx on public.contract_balances(supplier_id,contract_id);
create index contract_balances_location_idx on public.contract_balances(location_id,contract_id);
create table public.balance_references (
  id uuid primary key default gen_random_uuid(), balance_id uuid not null, contract_id uuid not null,
  kind public.reference_kind not null, reference text not null check (btrim(reference) <> ''),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(balance_id,contract_id) references public.contract_balances(id,contract_id) on delete cascade
);
create unique index balance_references_key on public.balance_references(balance_id,kind,lower(btrim(reference)));
create index balance_references_contract_idx on public.balance_references(contract_id);
create table public.import_batches (
  id uuid primary key default gen_random_uuid(), created_by uuid not null references public.profiles(id) on delete restrict,
  source_file text not null check (btrim(source_file) <> ''), sheet_name text not null,
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.import_rows (
  id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.import_batches(id) on delete restrict,
  source_line integer not null check (source_line > 0),
  contract_id uuid references public.contracts(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  status text not null check (status in ('success','warning','error','ignored')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(batch_id,source_line)
);
create index import_rows_contract_idx on public.import_rows(contract_id);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid, actor_role public.app_role, entity text not null, entity_id text,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  before_data jsonb, after_data jsonb
);
comment on column public.audit_events.actor_id is 'Historical identity; deliberately retained independently of future account deletion.';
create index audit_events_date_idx on public.audit_events(occurred_at desc);
create table public.system_settings (
  singleton boolean primary key default true check(singleton), system_name text not null check(btrim(system_name) <> ''),
  support_email text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Serialize trusted user/permission administration; inaccessible as an API table.
create table private.administration_mutex (singleton boolean primary key check(singleton));
insert into private.administration_mutex values(true);
revoke all on private.administration_mutex from public,anon,authenticated;

do $$ declare t text; begin
  foreach t in array array['profiles','contracts','user_contracts','products','suppliers','locations','contract_balances','balance_references','import_batches','import_rows','audit_events','system_settings'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
  end loop;
end $$;
