-- Operational extension: historical migrations and existing balances stay intact.
create table public.stock_roles (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 2 and 100),
 system_role public.app_role unique, created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index stock_roles_name_key on public.stock_roles(lower(btrim(name)));
create table public.stock_role_permissions (
 id uuid primary key default gen_random_uuid(),role_id uuid not null references public.stock_roles on delete restrict,
 permission text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(role_id,permission)
);
create table public.stock_user_roles (
 user_id uuid primary key references public.profiles on delete restrict,role_id uuid not null references public.stock_roles on delete restrict,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.stock_user_permissions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete restrict,
 permission text not null,allowed boolean not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,permission)
);
create function private.stock_permission_keys() returns text[] language sql immutable set search_path='' as $$
 select array['estoque.visualizar','entrada.visualizar','entrada.registrar','saida.visualizar','saida.registrar','historico.visualizar_proprio','historico.visualizar_geral','relatorios.exportar','usuarios.visualizar','usuarios.gerenciar','cargos.gerenciar','permissoes.gerenciar','movimentacoes.estornar']::text[];
$$;
alter table public.stock_role_permissions add check(permission=any(private.stock_permission_keys()));
alter table public.stock_user_permissions add check(permission=any(private.stock_permission_keys()));
insert into public.stock_roles(name,system_role) values
 ('Proprietário','proprietario'),('Administrador','administrador'),('Almoxarife','almoxarife'),('Coordenador','coordenador'),
 ('Planejamento','planejamento'),('Diretor','diretor'),('Funcionário autorizado','funcionario_autorizado');
insert into public.stock_role_permissions(role_id,permission)
 select r.id,k from public.stock_roles r cross join unnest(private.stock_permission_keys()) k
 where r.system_role in ('proprietario','administrador') or k='estoque.visualizar' or
 (r.system_role='almoxarife' and k in ('entrada.visualizar','entrada.registrar','saida.visualizar','saida.registrar','historico.visualizar_proprio','relatorios.exportar'));
create function private.stock_role_for(target uuid) returns uuid language sql stable security definer set search_path='' as $$
 select coalesce((select role_id from public.stock_user_roles where user_id=target),(select r.id from public.stock_roles r join public.profiles p on p.role=r.system_role where p.id=target));
$$;
create function private.stock_configured_for(target uuid,capability text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select capability=any(private.stock_permission_keys()) and (capability not in ('usuarios.visualizar','usuarios.gerenciar','cargos.gerenciar','permissoes.gerenciar') or p.role in ('proprietario','administrador')) and (p.role='proprietario' or coalesce(
 (select o.allowed from public.stock_user_permissions o where o.user_id=p.id and o.permission=capability),
 exists(select 1 from public.stock_role_permissions rp where rp.role_id=private.stock_role_for(p.id) and rp.permission=capability)))
 from public.profiles p where p.id=target),false);
$$;
create function private.stock_allowed_for(target uuid,capability text) returns boolean language sql stable security definer set search_path='' as $$ select private.stock_configured_for(target,capability) and exists(select 1 from public.profiles where id=target and active); $$;
create function private.stock_allowed(capability text) returns boolean language sql stable security definer set search_path='' as $$
 select private.stock_allowed_for((select auth.uid()),capability);
$$;
create function private.stock_scope(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and
 (p.role in ('proprietario','administrador','diretor') or exists(select 1 from public.user_contracts uc where uc.user_id=p.id and uc.contract_id=target)));
$$;
create function private.stock_manager(capability text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() and private.stock_allowed(capability);
$$;
create function private.stock_actor() returns uuid language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
 declare actor uuid=(select auth.uid());
 begin
 perform 1 from private.administration_mutex where singleton for update;
 perform 1 from public.profiles where id=actor and active for update;
 if not found then raise exception 'Active identity required' using errcode='42501';end if;
 return actor;
 end $$;
create function private.stock_manage_actor(capability text) returns uuid language plpgsql security definer set search_path='' as $$
 declare actor uuid;
 begin actor=private.stock_actor();if not private.stock_manager(capability) then raise exception 'Management permission required' using errcode='42501';end if;return actor;end $$;
create function private.stock_target(target uuid) returns void language plpgsql security definer set search_path='' as $$
 declare actor uuid=(select auth.uid()); p public.profiles; k text;
 begin
 select * into p from public.profiles where id=target;
 if target is null or target=actor then raise exception 'Other user required; self administration forbidden' using errcode='42501';end if;
 if (select role from public.profiles where id=actor)='proprietario' then return;end if;
 if p.role='proprietario' then raise exception 'Owner protected from administrator' using errcode='42501';end if;
 foreach k in array private.stock_permission_keys() loop
 if private.stock_configured_for(target,k) and not private.stock_allowed(k) then raise exception 'Target exceeds actor ceiling' using errcode='42501';end if;
 end loop;
 end $$;
create function private.stock_ceiling(target uuid) returns void language plpgsql security definer set search_path='' as $$
 declare k text;
 begin
 if (select role from public.profiles where id=(select auth.uid()))='proprietario' then return;end if;
 foreach k in array private.stock_permission_keys() loop
 if private.stock_configured_for(target,k) and not private.stock_allowed(k) then raise exception 'Cannot grant permissions above actor ceiling' using errcode='42501';end if;
 end loop;
 end $$;
create table public.stock_movements (
 id uuid primary key default gen_random_uuid(),actor_id uuid not null references public.profiles on delete restrict,
 actor_name text not null,contract_id uuid not null references public.contracts on delete restrict,contract_name text not null,
 product_id uuid not null references public.products on delete restrict,product_code text not null,product_description text not null,unit text not null,
 kind text not null check(kind in ('entrada','saida')),quantity numeric(24,6) not null check(quantity>0 and quantity<>'NaN'::numeric),
 before_quantity numeric(24,6) not null check(before_quantity>=0),after_quantity numeric(24,6) not null check(after_quantity>=0),
 supplier_id uuid references public.suppliers on delete restrict,supplier_name text not null default '',oc text not null default '',nf text not null default '',
 destination text not null default '',recipient text not null default '',recipient_company text not null default '',notes text not null default '',
 reversal_of uuid unique references public.stock_movements on delete restrict,reversal_reason text not null default '',
 idempotency_key uuid not null,request_hash text not null,occurred_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(actor_id,idempotency_key),
 check(after_quantity=case when kind='entrada' then before_quantity+quantity else before_quantity-quantity end),
 check(kind<>'saida' or reversal_of is not null or (btrim(destination)<>'' and btrim(recipient)<>'' and btrim(recipient_company)<>''))
);
create index stock_movements_contract_date on public.stock_movements(contract_id,occurred_at desc,id);
create index stock_movements_actor_date on public.stock_movements(actor_id,occurred_at desc,id);
create function private.stock_visible(c uuid,a uuid,k text) returns boolean language sql stable security definer set search_path='' as $$
 select private.stock_scope(c) and (private.stock_allowed('historico.visualizar_geral') or (a=(select auth.uid()) and (private.stock_allowed('historico.visualizar_proprio') or private.stock_allowed(k||'.registrar'))) or private.stock_allowed(k||'.visualizar'));
$$;
create function private.stock_movement_json(m public.stock_movements) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(m)-'request_hash'-'idempotency_key'||jsonb_build_object('quantity',m.quantity::text,'before_quantity',m.before_quantity::text,'after_quantity',m.after_quantity::text,
 'reversed_by',(select id from public.stock_movements x where x.reversal_of=m.id),'reversal',(select jsonb_build_object('id',x.id,'reason',x.reversal_reason,'actor_name',x.actor_name,'occurred_at',x.occurred_at) from public.stock_movements x where x.reversal_of=m.id));
$$;
create function private.stock_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Movement ledger is append only; use reversal RPC' using errcode='42501';end $$;
create trigger stock_immutable before update or delete on public.stock_movements for each row execute function private.stock_immutable();
create function private.stock_unit_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.unit<>new.unit and exists(select 1 from public.stock_movements where product_id=old.id) then raise exception 'Unit with movements cannot change' using errcode='23514';end if;return new;end $$;
create trigger stock_unit_guard before update on public.products for each row execute function private.stock_unit_guard();
-- Individual stock denial is enforced on the existing SQL projection too.
create or replace function private.can_read_contract(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.stock_scope(target) and private.stock_allowed('estoque.visualizar');
$$;
drop policy contracts_read on public.contracts;
create policy contracts_read on public.contracts for select to authenticated using(private.stock_scope(id) and
 (private.stock_allowed('estoque.visualizar') or private.stock_allowed('entrada.registrar') or private.stock_allowed('saida.registrar') or private.stock_allowed('entrada.visualizar') or private.stock_allowed('saida.visualizar') or private.stock_allowed('historico.visualizar_geral') or private.stock_allowed('historico.visualizar_proprio')));
drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()) or private.stock_manager('usuarios.visualizar'));
drop policy user_contracts_read on public.user_contracts;
create policy user_contracts_read on public.user_contracts for select to authenticated using(private.stock_manager('usuarios.visualizar') or (user_id=(select auth.uid()) and private.is_active()));
do $$ declare t text;begin
 foreach t in array array['stock_roles','stock_role_permissions','stock_user_roles','stock_user_permissions','stock_movements'] loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);
 execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.record_audit()',t);
 end loop;end $$;
create policy stock_roles_read on public.stock_roles for select to authenticated using(private.stock_manager('usuarios.visualizar') or (private.is_active() and id=private.stock_role_for((select auth.uid()))));
create policy stock_rp_read on public.stock_role_permissions for select to authenticated using(private.stock_manager('usuarios.visualizar') or (private.is_active() and role_id=private.stock_role_for((select auth.uid()))));
create policy stock_ur_read on public.stock_user_roles for select to authenticated using(private.stock_manager('usuarios.visualizar') or (private.is_active() and user_id=(select auth.uid())));
create policy stock_up_read on public.stock_user_permissions for select to authenticated using(private.stock_manager('usuarios.visualizar') or (private.is_active() and user_id=(select auth.uid())));
create policy stock_movement_read on public.stock_movements for select to authenticated using(private.stock_visible(contract_id,actor_id,kind));
create function public.stock_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare actor uuid=(select auth.uid());result jsonb;caps jsonb;
 begin
 if not private.is_active() then raise exception 'Active identity required' using errcode='42501';end if;
 select coalesce(jsonb_agg(k),'[]') into caps from unnest(private.stock_permission_keys()) k where private.stock_allowed(k);
 select jsonb_build_object('actor',jsonb_build_object('id',p.id,'name',p.name),'role',r.name,'permissions',caps,'server_time',clock_timestamp(),
 'contracts',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name),'[]') from public.contracts c where private.stock_scope(c.id) and exists(select 1 from jsonb_array_elements_text(caps) cap where cap in ('estoque.visualizar','entrada.visualizar','entrada.registrar','saida.visualizar','saida.registrar','historico.visualizar_proprio','historico.visualizar_geral'))),
 'products',(select coalesce(jsonb_agg(to_jsonb(pr) order by pr.code),'[]') from public.products pr where (private.stock_allowed('entrada.registrar') and exists(select 1 from public.contracts c where private.stock_scope(c.id))) or ((private.stock_allowed('saida.registrar') or private.stock_allowed('estoque.visualizar')) and exists(select 1 from public.contract_balances b where b.product_id=pr.id and private.stock_scope(b.contract_id)))),
 'suppliers',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name),'[]') from public.suppliers s where private.stock_allowed('entrada.registrar')),
 'balances',(select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('quantity',b.quantity::text)),'[]') from public.contract_balances b where private.stock_scope(b.contract_id) and (private.stock_allowed('entrada.registrar') or private.stock_allowed('saida.registrar') or private.stock_allowed('estoque.visualizar'))))
 into result from public.profiles p join public.stock_roles r on r.id=private.stock_role_for(p.id) where p.id=actor;
 return result;
 end $$;
create function private.stock_quantity(value text,positive boolean default true) returns numeric language plpgsql immutable set search_path='' as $$
 declare q numeric;
 begin if value is null or value !~ '^[0-9]{1,18}(\.[0-9]{1,6})?$' then raise exception 'Decimal text required, up to six places' using errcode='22023';end if;
 q=value::numeric(24,6);if positive and q<=0 then raise exception 'Quantity must be positive' using errcode='22023';end if;return q;end $$;
create function public.stock_post(request jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
 declare actor uuid;target uuid;prod uuid;idem uuid;digest text;op text;q numeric;expected numeric;b public.contract_balances;m public.stock_movements;p public.products;c public.contracts;s public.suppliers;field text;
 begin
 actor=private.stock_actor();
 if jsonb_typeof(request) is distinct from 'object' or octet_length(request::text)>16384 or exists(select 1 from jsonb_object_keys(request) field_name where field_name not in ('contract_id','product_id','kind','quantity','expected_quantity','idempotency_key','supplier_id','oc','nf','destination','recipient','recipient_company','notes')) then raise exception 'Invalid request' using errcode='22023';end if;
 op=request->>'kind';if op is null or op not in ('entrada','saida') or not private.stock_allowed(op||'.registrar') then raise exception 'Movement permission required' using errcode='42501';end if;
 foreach field in array array['contract_id','product_id','kind','quantity','expected_quantity','idempotency_key'] loop if jsonb_typeof(request->field) is distinct from 'string' then raise exception 'Required text field' using errcode='22023';end if;end loop;
 foreach field in array array['supplier_id','oc','nf','destination','recipient','recipient_company','notes'] loop if request ? field and (jsonb_typeof(request->field)<>'string' or length(request->>field)>500) then raise exception 'Invalid field' using errcode='22023';end if;end loop;
 target=(request->>'contract_id')::uuid;prod=(request->>'product_id')::uuid;idem=(request->>'idempotency_key')::uuid;
 if not private.stock_scope(target) then raise exception 'Unauthorized contract' using errcode='42501';end if;
 q=private.stock_quantity(request->>'quantity');expected=private.stock_quantity(request->>'expected_quantity',false);
 digest=encode(sha256(convert_to(request::text,'UTF8')),'hex');
 select * into m from public.stock_movements where actor_id=actor and idempotency_key=idem;
 if found then if m.request_hash<>digest then raise exception 'Idempotency key reused with different content' using errcode='22023';end if;return private.stock_movement_json(m)||'{"reused":true}'::jsonb;end if;
 select * into p from public.products where id=prod for share;select * into c from public.contracts where id=target for share;
 if p.id is null or c.id is null then raise exception 'Product/contract not found' using errcode='23503';end if;
 if op='saida' and (length(btrim(coalesce(request->>'destination','')))<2 or length(btrim(coalesce(request->>'recipient','')))<3 or length(btrim(coalesce(request->>'recipient_company','')))<2) then raise exception 'Destination recipient and company required' using errcode='22023';end if;
 if op='entrada' and coalesce(request->>'supplier_id','')<>'' then select * into s from public.suppliers where id=(request->>'supplier_id')::uuid;if not found then raise exception 'Supplier not found' using errcode='23503';end if;end if;
 if op='entrada' then insert into public.contract_balances(product_id,contract_id,quantity) values(prod,target,0) on conflict(product_id,contract_id) do nothing;end if;
 select * into b from public.contract_balances where product_id=prod and contract_id=target for update;
 if not found then raise exception 'Balance not found' using errcode='23503';end if;
 if b.quantity<>expected then raise exception 'Balance changed; review again' using errcode='40001';end if;
 if op='saida' and q>b.quantity then raise exception 'Insufficient balance' using errcode='23514';end if;
 update public.contract_balances set quantity=case when op='entrada' then quantity+q else quantity-q end,supplier_id=coalesce(s.id,supplier_id) where id=b.id;
 insert into public.stock_movements(actor_id,actor_name,contract_id,contract_name,product_id,product_code,product_description,unit,kind,quantity,before_quantity,after_quantity,supplier_id,supplier_name,oc,nf,destination,recipient,recipient_company,notes,idempotency_key,request_hash)
 values(actor,(select name from public.profiles where id=actor),target,c.name,prod,p.code,p.description,p.unit,op,q,b.quantity,case when op='entrada' then b.quantity+q else b.quantity-q end,s.id,coalesce(s.name,''),case when op='entrada' then btrim(coalesce(request->>'oc','')) else '' end,case when op='entrada' then btrim(coalesce(request->>'nf','')) else '' end,case when op='saida' then btrim(request->>'destination') else '' end,case when op='saida' then btrim(request->>'recipient') else '' end,case when op='saida' then btrim(request->>'recipient_company') else '' end,btrim(coalesce(request->>'notes','')),idem,digest) returning * into m;
 if m.oc<>'' then insert into public.balance_references(balance_id,contract_id,kind,reference) values(b.id,target,'oc',m.oc) on conflict do nothing;end if;
 if m.nf<>'' then insert into public.balance_references(balance_id,contract_id,kind,reference) values(b.id,target,'nf',m.nf) on conflict do nothing;end if;
 return private.stock_movement_json(m)||'{"reused":false}'::jsonb;
 end $$;
create function public.stock_reverse(request jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
 declare actor uuid;original public.stock_movements;m public.stock_movements;b public.contract_balances;idem uuid;digest text;reason text;opposite text;
 begin
 actor=private.stock_actor();if not private.stock_allowed('movimentacoes.estornar') then raise exception 'Reversal permission required' using errcode='42501';end if;
 if jsonb_typeof(request) is distinct from 'object' or octet_length(request::text)>4096 or exists(select 1 from jsonb_object_keys(request) field_name where field_name not in ('movement_id','reason','idempotency_key')) then raise exception 'Invalid reversal' using errcode='22023';end if;
 if jsonb_typeof(request->'reason') is distinct from 'string' or length(btrim(request->>'reason')) not between 5 and 500 then raise exception 'Reversal reason required' using errcode='22023';end if;
 reason=btrim(request->>'reason');idem=(request->>'idempotency_key')::uuid;if idem is null then raise exception 'Idempotency key required' using errcode='22023';end if;
 select * into original from public.stock_movements where id=(request->>'movement_id')::uuid for update;
 if not found or not private.stock_scope(original.contract_id) then raise exception 'Movement unavailable' using errcode='42501';end if;
 digest=encode(sha256(convert_to(request::text,'UTF8')),'hex');select * into m from public.stock_movements where actor_id=actor and idempotency_key=idem;
 if found then if m.request_hash<>digest then raise exception 'Different idempotent content' using errcode='22023';end if;return private.stock_movement_json(m)||'{"reused":true}'::jsonb;end if;
 if original.reversal_of is not null or exists(select 1 from public.stock_movements where reversal_of=original.id) then raise exception 'Already reversed or reversal of reversal' using errcode='23514';end if;
 select * into b from public.contract_balances where product_id=original.product_id and contract_id=original.contract_id for update;
 if not found or (original.kind='entrada' and b.quantity<original.quantity) then raise exception 'Cannot reverse entry with insufficient current balance' using errcode='23514';end if;
 opposite=case when original.kind='entrada' then 'saida' else 'entrada' end;
 update public.contract_balances set quantity=case when opposite='entrada' then quantity+original.quantity else quantity-original.quantity end where id=b.id;
 insert into public.stock_movements(actor_id,actor_name,contract_id,contract_name,product_id,product_code,product_description,unit,kind,quantity,before_quantity,after_quantity,reversal_of,reversal_reason,idempotency_key,request_hash)
 values(actor,(select name from public.profiles where id=actor),original.contract_id,original.contract_name,original.product_id,original.product_code,original.product_description,original.unit,opposite,original.quantity,b.quantity,case when opposite='entrada' then b.quantity+original.quantity else b.quantity-original.quantity end,original.id,reason,idem,digest) returning * into m;
 return private.stock_movement_json(m)||'{"reused":false}'::jsonb;
 end $$;
create function public.stock_history(request jsonb default '{}'::jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare result jsonb;skip integer;
 begin
 if not private.is_active() then raise exception 'Active identity required' using errcode='42501';end if;
 if jsonb_typeof(request) is distinct from 'object' or octet_length(request::text)>4096 or exists(select 1 from jsonb_object_keys(request) field_name where field_name not in ('movement_id','contract_id','product_id','actor_id','kind','from','to','offset')) then raise exception 'Invalid filters' using errcode='22023';end if;
 skip=coalesce((request->>'offset')::integer,0);if skip<0 or skip>100000 then raise exception 'Invalid offset' using errcode='22023';end if;
 select coalesce(jsonb_agg(private.stock_movement_json(x) order by x.occurred_at desc,x.id desc),'[]') into result from
 (select m.* from public.stock_movements m where private.stock_visible(m.contract_id,m.actor_id,m.kind)
 and (coalesce(request->>'movement_id','')='' or m.id=(request->>'movement_id')::uuid)
 and (coalesce(request->>'contract_id','')='' or m.contract_id=(request->>'contract_id')::uuid)
 and (coalesce(request->>'product_id','')='' or m.product_id=(request->>'product_id')::uuid)
 and (coalesce(request->>'actor_id','')='' or m.actor_id=(request->>'actor_id')::uuid)
 and (coalesce(request->>'kind','')='' or m.kind=request->>'kind')
 and (coalesce(request->>'from','')='' or m.occurred_at>=(request->>'from')::timestamptz)
 and (coalesce(request->>'to','')='' or m.occurred_at<=(request->>'to')::timestamptz)
 order by m.occurred_at desc,m.id desc limit 100 offset skip) x;
 return jsonb_build_object('rows',result,'offset',skip,'limit',100,
 'actors',(select coalesce(jsonb_agg(to_jsonb(a) order by a.name),'[]') from (select distinct actor_id as id,actor_name as name from public.stock_movements where private.stock_visible(contract_id,actor_id,kind) limit 500) a),
 'products',(select coalesce(jsonb_agg(to_jsonb(a) order by a.name),'[]') from (select distinct product_id as id,product_code||' - '||product_description as name from public.stock_movements where private.stock_visible(contract_id,actor_id,kind) limit 500) a));
 end $$;
create function public.stock_admin_snapshot(request jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if jsonb_typeof(request) is distinct from 'object' or exists(select 1 from jsonb_object_keys(request) field_name where field_name <> 'scope') or coalesce(request->>'scope','users') not in ('users','roles') then raise exception 'Invalid snapshot scope' using errcode='22023';end if;
 if request->>'scope'='roles' then
  if not (private.stock_manager('cargos.gerenciar') or private.stock_manager('usuarios.visualizar')) then raise exception 'Role visibility required' using errcode='42501';end if;
  return jsonb_build_object('users','[]'::jsonb,'roles',(select coalesce(jsonb_agg(to_jsonb(r) order by r.name),'[]') from public.stock_roles r),'role_permissions',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.stock_role_permissions r),'user_roles','[]'::jsonb,'overrides','[]'::jsonb,'links','[]'::jsonb,'contracts','[]'::jsonb,'audit','[]'::jsonb);
 end if;
 if not private.stock_manager('usuarios.visualizar') then raise exception 'User visibility required' using errcode='42501';end if;
 return jsonb_build_object('users',(select coalesce(jsonb_agg(to_jsonb(p) order by p.name),'[]') from public.profiles p),
 'roles',(select coalesce(jsonb_agg(to_jsonb(r) order by r.name),'[]') from public.stock_roles r),
 'role_permissions',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.stock_role_permissions r),
 'user_roles',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.stock_user_roles r),
 'overrides',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.stock_user_permissions r),
 'links',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.user_contracts r),
 'contracts',(select coalesce(jsonb_agg(to_jsonb(r) order by r.name),'[]') from public.contracts r),
 'audit',(select coalesce(jsonb_agg(to_jsonb(r) order by r.occurred_at desc),'[]') from (select * from public.audit_events where entity in ('stock_roles','stock_role_permissions','stock_user_roles','stock_user_permissions','profiles','user_contracts') order by occurred_at desc limit 100) r));
 end $$;
create function public.stock_save_role(request jsonb) returns uuid language plpgsql security definer set search_path='' as $$
 declare actor uuid;target uuid;job_name text;caps jsonb;k text;u record;
 begin
 actor=private.stock_manage_actor('cargos.gerenciar');
 if jsonb_typeof(request) is distinct from 'object' or octet_length(request::text)>8192 or exists(select 1 from jsonb_object_keys(request) field_name where field_name not in ('id','name','permissions')) then raise exception 'Invalid role' using errcode='22023';end if;
 job_name=btrim(request->>'name');caps=request->'permissions';if jsonb_typeof(request->'name') is distinct from 'string' or length(job_name) not between 2 and 100 or jsonb_typeof(caps) is distinct from 'array' or jsonb_array_length(caps)>13 then raise exception 'Role name and permissions required' using errcode='22023';end if;
 for k in select jsonb_array_elements_text(caps) loop if not k=any(private.stock_permission_keys()) or not private.stock_allowed(k) then raise exception 'Role exceeds actor permissions' using errcode='42501';end if;end loop;
 target=nullif(request->>'id','')::uuid;
 if target is null then insert into public.stock_roles(name) values(job_name) returning id into target;
 else
 if not exists(select 1 from public.stock_roles where id=target and system_role is null) then raise exception 'System roles immutable; create custom role' using errcode='42501';end if;
 for u in select user_id from public.stock_user_roles where role_id=target loop perform private.stock_target(u.user_id);end loop;
 update public.stock_roles set name=job_name,updated_at=clock_timestamp() where id=target;
 delete from public.stock_role_permissions where role_id=target;
 end if;
 insert into public.stock_role_permissions(role_id,permission) select target,value from (select distinct jsonb_array_elements_text(caps) value) x;
 for u in select user_id from public.stock_user_roles where role_id=target loop perform private.stock_ceiling(u.user_id);end loop;
 return target;
 end $$;
create function public.stock_assign_role(request jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare actor uuid;target uuid;job uuid;
 begin
 actor=private.stock_manage_actor('usuarios.gerenciar');
 if jsonb_typeof(request) is distinct from 'object' or octet_length(request::text)>4096 or exists(select 1 from jsonb_object_keys(request) field_name where field_name not in ('user_id','role_id')) then raise exception 'Invalid assignment' using errcode='22023';end if;
 target=(request->>'user_id')::uuid;perform private.stock_target(target);job=nullif(request->>'role_id','')::uuid;
 if job is null then delete from public.stock_user_roles where user_id=target;
 else if not exists(select 1 from public.stock_roles where id=job and system_role is null) then raise exception 'Assign custom jobs only; system profile remains separately controlled' using errcode='42501';end if;
 insert into public.stock_user_roles(user_id,role_id) values(target,job) on conflict(user_id) do update set role_id=excluded.role_id,updated_at=clock_timestamp();end if;
 perform private.stock_ceiling(target);
 end $$;
create function public.stock_set_override(request jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare actor uuid;target uuid;k text;decision text;
 begin
 actor=private.stock_manage_actor('permissoes.gerenciar');
 if jsonb_typeof(request) is distinct from 'object' or octet_length(request::text)>4096 or exists(select 1 from jsonb_object_keys(request) f where f not in ('user_id','permission','decision')) then raise exception 'Invalid override' using errcode='22023';end if;
 target=(request->>'user_id')::uuid;perform private.stock_target(target);k=request->>'permission';decision=request->>'decision';
 if k is null or not k=any(private.stock_permission_keys()) or decision is null or decision not in ('allow','deny','inherit') then raise exception 'Invalid permission/decision' using errcode='22023';end if;
 if decision='allow' and not private.stock_allowed(k) then raise exception 'Cannot grant above own ceiling' using errcode='42501';end if;
 if decision='inherit' then delete from public.stock_user_permissions where user_id=target and permission=k;
 else insert into public.stock_user_permissions(user_id,permission,allowed) values(target,k,decision='allow') on conflict(user_id,permission) do update set allowed=excluded.allowed,updated_at=clock_timestamp();end if;
 perform private.stock_ceiling(target);
 end $$;
create or replace function private.require_other_user_admin(target uuid) returns void language plpgsql security definer set search_path='' as $$
 begin perform private.stock_manage_actor('usuarios.gerenciar');perform private.stock_target(target);end $$;
alter function public.admin_save_profile(uuid,text,text,public.app_role,boolean) set schema private;
alter function private.admin_save_profile(uuid,text,text,public.app_role,boolean) rename to legacy_save_profile;
create function public.admin_save_profile(target_id uuid,new_name text,new_email text,new_role public.app_role,new_active boolean) returns void language plpgsql security definer set search_path='' as $$
 begin
 perform private.require_other_user_admin(target_id);
 if (select role from public.profiles where id=(select auth.uid()))<>'proprietario' and new_role='proprietario' then raise exception 'Administrator cannot create owners' using errcode='42501';end if;
 perform private.legacy_save_profile(target_id,new_name,new_email,new_role,new_active);perform private.stock_ceiling(target_id);
 end $$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname like 'stock_%' or p.proname='legacy_save_profile') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);end loop;
 end $$;
grant execute on function private.stock_allowed(text),private.stock_scope(uuid),private.stock_manager(text),private.stock_role_for(uuid),private.stock_visible(uuid,uuid,text) to authenticated;
revoke all on function public.stock_context(),public.stock_post(jsonb),public.stock_reverse(jsonb),public.stock_history(jsonb),public.stock_admin_snapshot(jsonb),public.stock_save_role(jsonb),public.stock_assign_role(jsonb),public.stock_set_override(jsonb),public.admin_save_profile(uuid,text,text,public.app_role,boolean) from public,anon,authenticated;
grant execute on function public.stock_context(),public.stock_post(jsonb),public.stock_reverse(jsonb),public.stock_history(jsonb),public.stock_admin_snapshot(jsonb),public.stock_save_role(jsonb),public.stock_assign_role(jsonb),public.stock_set_override(jsonb),public.admin_save_profile(uuid,text,text,public.app_role,boolean) to authenticated;

drop policy audit_read on public.audit_events;
create policy audit_read on public.audit_events for select to authenticated using(private.is_admin() and (entity not in ('profiles','user_contracts','stock_roles','stock_role_permissions','stock_user_roles','stock_user_permissions') or private.stock_manager('usuarios.visualizar')));
-- Balance changes through the application must have an atomic movement or import receipt.
revoke insert,delete,update on public.contract_balances from authenticated;
revoke update(product_id,contract_id,quantity,location_id,supplier_id) on public.contract_balances from authenticated;
-- Export is an explicit server-authorized operation; rows remain contract scoped.
create function public.stock_report(request jsonb default '{}'::jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not private.stock_allowed('relatorios.exportar') then raise exception 'Export permission required' using errcode='42501';end if;return public.stock_history(request);end $$;
revoke all on function public.stock_report(jsonb) from public,anon,authenticated;
grant execute on function public.stock_report(jsonb) to authenticated;
