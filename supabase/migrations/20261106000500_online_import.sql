-- v0.9: signed read-only previews and atomic, idempotent balance snapshots.
-- The four historical migrations and their business policies remain unchanged.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table private.import_signing_key(singleton boolean primary key check(singleton), secret bytea not null, ttl_seconds smallint not null default 600 check(ttl_seconds between 1 and 600));
insert into private.import_signing_key(singleton,secret) values(true,extensions.gen_random_bytes(32));
create table private.import_receipts(fingerprint text primary key check(fingerprint ~ '^[a-f0-9]{64}$'),batch_id uuid not null references public.import_batches(id),result jsonb not null);
alter table private.import_signing_key enable row level security;
alter table private.import_signing_key force row level security;
alter table private.import_receipts enable row level security;
alter table private.import_receipts force row level security;
revoke all on private.import_signing_key,private.import_receipts from public,anon,authenticated;

create function private.import_actor() returns uuid language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid=(select auth.uid()); p public.profiles;
begin
 perform 1 from private.administration_mutex where singleton for update;
 select * into p from public.profiles where id=actor for update;
 if not found or not p.active or p.role not in ('administrador','proprietario') then raise exception 'Active import administrator required' using errcode='42501'; end if;
 return actor;
end $$;
create function private.import_state() returns text language sql security definer set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_array(
 (select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.products t),
 (select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.contracts t),
 (select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.suppliers t),
 (select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.locations t),
 (select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.contract_balances t),
 (select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.balance_references t)
 )::text,'UTF8')),'hex');
$$;
create function private.import_plan(destination uuid, source_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; result jsonb='[]'; errors jsonb; warnings jsonb; p public.products; b public.contract_balances; c public.contracts; loc uuid; supp uuid; key text; q text; discard boolean; action text; line integer; field text; n integer=0; applied integer=0; invalid integer=0; content_fingerprint text; selected jsonb='[]'; duplicate_result jsonb;
begin
 select * into c from public.contracts where id=destination;
 if not found then raise exception 'Destination contract not found' using errcode='23503'; end if;
 if jsonb_typeof(source_rows) is distinct from 'array' or jsonb_array_length(source_rows) not between 1 and 500 then raise exception 'Expected 1..500 rows' using errcode='22023'; end if;
 for r in select value from jsonb_array_elements(source_rows) loop
  n=n+1; errors='[]'; warnings='[]'; loc=null; supp=null; p=null; b=null;
  if jsonb_typeof(r)<>'object' or exists(select 1 from jsonb_object_keys(r) k where k not in ('line','code','description','unit','quantity','contract','supplier','location','oc','nf','category','manufacturer','model','action','discard','decided','cell_error')) then raise exception 'Unexpected row fields' using errcode='22023'; end if;
  if jsonb_typeof(r->'line')<>'number' or (r->>'line') !~ '^[0-9]{1,5}$' then raise exception 'Invalid source line' using errcode='22023'; end if;
  line=(r->>'line')::integer;
  if line not between 1 and 10000 or (select count(*) from jsonb_array_elements(source_rows) x where x->>'line'=r->>'line')<>1 then raise exception 'Duplicate/invalid source line' using errcode='22023'; end if;
  if r ? 'discard' and jsonb_typeof(r->'discard')<>'boolean' then raise exception 'Invalid discard decision' using errcode='22023'; end if;
  if r ? 'decided' and jsonb_typeof(r->'decided')<>'boolean' then raise exception 'Invalid explicit decision' using errcode='22023'; end if;
  discard=coalesce((r->>'discard')::boolean,false);
  if not discard and not coalesce((r->>'decided')::boolean,false) then errors=errors||'"Decisão explícita obrigatória para cada linha."'::jsonb; end if;
  action=coalesce(r->>'action','ignore');
  if action not in ('ignore','add','replace') then raise exception 'Explicit action required' using errcode='22023'; end if;
  foreach field in array array['code','description','unit','quantity','contract','supplier','location','oc','nf','category','manufacturer','model','cell_error'] loop
   if (r ? field and jsonb_typeof(r->field)<>'string') or length(coalesce(r->>field,''))>240 then errors=errors||to_jsonb('Campo inválido ou longo: '||field); end if;
  end loop;
  key=regexp_replace(upper(btrim(coalesce(r->>'code',''))),'\s+',' ','g');
  if length(key) not between 1 and 80 then errors=errors||'"Código obrigatório, até 80 caracteres."'::jsonb; end if;
  if length(btrim(coalesce(r->>'description',''))) not between 2 and 240 then errors=errors||'"Descrição obrigatória, de 2 a 240 caracteres."'::jsonb; end if;
  if coalesce(r->>'unit','') not in ('un','m','m²','m³','kg','g','l','ml','saco','caixa','rolo','par','jogo','pacote','kit','t') then errors=errors||'"Unidade inválida."'::jsonb; end if;
  q=replace(btrim(coalesce(r->>'quantity','')),',','.');
  if q !~ '^[0-9]{1,18}(\.[0-9]{1,6})?$' then errors=errors||'"Quantidade decimal não negativa: até 18 inteiros e 6 casas, sem arredondamento."'::jsonb; else q=(q::numeric(24,6))::text; end if;
  if btrim(coalesce(r->>'contract',''))<>'' and lower(btrim(r->>'contract'))<>lower(btrim(c.name)) then errors=errors||'"Contrato da linha difere do destino explícito."'::jsonb; end if;
  if coalesce(r->>'cell_error','')<>'' then errors=errors||'"Célula inválida/fórmula: converter em valor textual."'::jsonb; end if;
  if not discard and (select count(*) from jsonb_array_elements(source_rows) x where not coalesce((x->>'discard')::boolean,false) and regexp_replace(upper(btrim(x->>'code')),'\s+',' ','g')=key)>1 then errors=errors||'"Código repetido: descarte explicitamente as linhas excedentes."'::jsonb; end if;
  select * into p from public.products where code_key=key;
  if p.id is not null then
   if p.unit<>r->>'unit' then errors=errors||'"Unidade difere do catálogo global; ajuste o cadastro antes de importar."'::jsonb; end if;
   if p.description<>btrim(r->>'description') or p.category<>coalesce(r->>'category','') or p.manufacturer<>coalesce(r->>'manufacturer','') or p.model<>coalesce(r->>'model','') then warnings=warnings||'"Metadados divergentes: catálogo existente será preservado."'::jsonb; end if;
   select * into b from public.contract_balances where product_id=p.id and contract_id=destination;
  end if;
  if exists(select 1 from public.products x where lower(btrim(x.description))=lower(btrim(r->>'description')) and x.code_key<>key) then warnings=warnings||'"Possível duplicidade por descrição em outro código."'::jsonb; end if;
  if btrim(coalesce(r->>'supplier',''))<>'' then select id into supp from public.suppliers where lower(btrim(name))=lower(btrim(r->>'supplier')); if supp is null then errors=errors||'"Fornecedor não cadastrado."'::jsonb; end if; end if;
  if btrim(coalesce(r->>'location',''))<>'' then select id into loc from public.locations where contract_id=destination and lower(btrim(code))=lower(btrim(r->>'location')); if loc is null then errors=errors||'"Localização não cadastrada no contrato de destino."'::jsonb; end if; end if;
  if b.id is not null and action='add' then errors=errors||'"Saldo existente: escolha substituir fotografia ou ignorar."'::jsonb; end if;
  if b.id is null and action='replace' then errors=errors||'"Saldo inexistente: escolha adicionar ou ignorar."'::jsonb; end if;
  if not discard and jsonb_array_length(errors)>0 then invalid=invalid+1; end if;
  if not discard and action<>'ignore' and jsonb_array_length(errors)=0 then
   applied=applied+1;
   selected=selected||jsonb_build_array(jsonb_build_object('code',key,'description',btrim(r->>'description'),'unit',r->>'unit','category',coalesce(r->>'category',''),'manufacturer',coalesce(r->>'manufacturer',''),'model',coalesce(r->>'model',''),'quantity',q,'location',lower(btrim(coalesce(r->>'location',''))),'supplier',lower(btrim(coalesce(r->>'supplier',''))),'oc',lower(btrim(coalesce(r->>'oc',''))),'nf',lower(btrim(coalesce(r->>'nf','')))));
  end if;
  result=result||jsonb_build_array(jsonb_build_object('line',line,'code',key,'description',coalesce(p.description,btrim(r->>'description')),'unit',r->>'unit','category',coalesce(p.category,r->>'category',''),'manufacturer',coalesce(p.manufacturer,r->>'manufacturer',''),'model',coalesce(p.model,r->>'model',''),'quantity',q,'action',action,'discard',discard,'product_id',p.id,'balance_id',b.id,'location_id',coalesce(loc,b.location_id),'supplier_id',coalesce(supp,b.supplier_id),'oc',btrim(coalesce(r->>'oc','')),'nf',btrim(coalesce(r->>'nf','')),'before',case when b.id is null then null else jsonb_build_object('quantity',b.quantity::text,'location_id',b.location_id,'supplier_id',b.supplier_id) end,'errors',errors,'warnings',warnings));
 end loop;
 content_fingerprint=encode(sha256(convert_to(jsonb_build_object('destination',destination,'selected',(select coalesce(jsonb_agg(x order by x->>'code'),'[]') from jsonb_array_elements(selected) x))::text,'UTF8')),'hex');
 select receipts.result into duplicate_result from private.import_receipts receipts where receipts.fingerprint=content_fingerprint;
 return jsonb_build_object('rows',result,'destination',destination,'contract',c.name,'invalid',invalid,'applied',applied,'ready',invalid=0 and applied>0,'fingerprint',content_fingerprint,'duplicate',duplicate_result);
end $$;

create function public.admin_import_preview(request jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid; plan jsonb; body jsonb; encoded text; mac text; key bytea;
begin
 actor=private.import_actor();
 if octet_length(request::text)>524288 or jsonb_typeof(request)<>'object' or exists(select 1 from jsonb_object_keys(request) k where k not in ('destination','rows','file_name','file_sha256','sheet_name')) then raise exception 'Invalid or oversized import request' using errcode='22023'; end if;
 if coalesce(request->>'file_name','') !~* '^[^/\\]{1,200}\.xlsx$' or coalesce(request->>'file_sha256','') !~ '^[a-f0-9]{64}$' or length(coalesce(request->>'sheet_name','')) not between 1 and 100 then raise exception 'Invalid source metadata' using errcode='22023'; end if;
 lock table public.products,public.contracts,public.suppliers,public.locations,public.contract_balances,public.balance_references in share row exclusive mode;
 plan=private.import_plan((request->>'destination')::uuid,request->'rows');
 body=jsonb_build_object('actor',actor,'expires',extract(epoch from clock_timestamp())::bigint+(select ttl_seconds from private.import_signing_key where singleton),'request',request,'state',private.import_state(),'fingerprint',plan->>'fingerprint');
 encoded=replace(encode(convert_to(body::text,'UTF8'),'base64'),E'\n','');
 select secret into key from private.import_signing_key where singleton;
 mac=encode(extensions.hmac(convert_to(encoded,'UTF8'),key,'sha256'),'hex');
 return plan||jsonb_build_object('token','jpimp1:'||encoded||'.'||mac,'expires',body->'expires');
end $$;
create function public.admin_import_commit(preview_token text) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid; body jsonb; encoded text; signature text; key bytea; plan jsonb; row jsonb; batch uuid; product uuid; balance uuid; status text; result jsonb; receipt jsonb; succeeded integer=0; ignored integer=0;
begin
 actor=private.import_actor();
 if preview_token is null or length(preview_token)>1500000 or preview_token !~ '^jpimp1:[A-Za-z0-9+/=]+\.[a-f0-9]{64}$' then raise exception 'Invalid preview token' using errcode='22023'; end if;
 encoded=split_part(substr(preview_token,8),'.',1);signature=split_part(preview_token,'.',2);
 select secret into key from private.import_signing_key where singleton;
 if signature<>encode(extensions.hmac(convert_to(encoded,'UTF8'),key,'sha256'),'hex') then raise exception 'Invalid preview signature' using errcode='42501'; end if;
 body=convert_from(decode(encoded,'base64'),'UTF8')::jsonb;
 if body->>'actor'<>actor::text or (body->>'expires')::bigint<extract(epoch from clock_timestamp()) then raise exception 'Expired or foreign preview' using errcode='42501'; end if;
 lock table public.products,public.contracts,public.suppliers,public.locations,public.contract_balances,public.balance_references in share row exclusive mode;
 select r.result into receipt from private.import_receipts r where r.fingerprint=body->>'fingerprint';
 if found then return receipt||jsonb_build_object('reused',true); end if;
 plan=private.import_plan((body->'request'->>'destination')::uuid,body->'request'->'rows');
 if body->>'state'<>private.import_state() then raise exception 'Preview conflict: data changed; preview again' using errcode='40001'; end if;
 if not (plan->>'ready')::boolean then raise exception 'Discard invalid rows and explicitly select actions before confirmation' using errcode='22023'; end if;
 insert into public.import_batches(created_by,source_file,sheet_name,summary) values(actor,body->'request'->>'file_name',body->'request'->>'sheet_name',jsonb_build_object('kind','balance_snapshot','file_sha256',body->'request'->>'file_sha256','fingerprint',plan->>'fingerprint','destination',plan->>'destination','source_rows',jsonb_array_length(plan->'rows'),'applied',plan->'applied')) returning id into batch;
 for row in select value from jsonb_array_elements(plan->'rows') loop
  product=(row->>'product_id')::uuid; balance=(row->>'balance_id')::uuid; status='ignored';
  if not (row->>'discard')::boolean and row->>'action'<>'ignore' then
   if product is null then insert into public.products(code,description,unit,category,manufacturer,model) values(row->>'code',row->>'description',row->>'unit',row->>'category',row->>'manufacturer',row->>'model') returning id into product; end if;
   if balance is null then insert into public.contract_balances(product_id,contract_id,quantity,location_id,supplier_id) values(product,(plan->>'destination')::uuid,(row->>'quantity')::numeric,(row->>'location_id')::uuid,(row->>'supplier_id')::uuid) returning id into balance;
   else update public.contract_balances set quantity=(row->>'quantity')::numeric,location_id=(row->>'location_id')::uuid,supplier_id=(row->>'supplier_id')::uuid where id=balance; end if;
   if row->>'oc'<>'' then insert into public.balance_references(balance_id,contract_id,kind,reference) values(balance,(plan->>'destination')::uuid,'oc',row->>'oc') on conflict do nothing; end if;
   if row->>'nf'<>'' then insert into public.balance_references(balance_id,contract_id,kind,reference) values(balance,(plan->>'destination')::uuid,'nf',row->>'nf') on conflict do nothing; end if;
   status='success'; succeeded=succeeded+1;
  else ignored=ignored+1; end if;
  insert into public.import_rows(batch_id,source_line,contract_id,product_id,status,details) values(batch,(row->>'line')::integer,(plan->>'destination')::uuid,product,status,row-'product_id'-'balance_id'||jsonb_build_object('result',status));
 end loop;
 result=jsonb_build_object('batch_id',batch,'actor',actor,'file_name',body->'request'->>'file_name','sheet_name',body->'request'->>'sheet_name','date',clock_timestamp(),'applied',succeeded,'ignored',ignored,'reused',false,'rows',(select jsonb_agg(e.value||jsonb_build_object('status',case when (e.value->>'discard')::boolean or e.value->>'action'='ignore' then 'ignored' else 'success' end)) from jsonb_array_elements(plan->'rows') e));
 insert into private.import_receipts values(plan->>'fingerprint',batch,result);
 return result;
end $$;
revoke all on function private.import_actor(),private.import_state(),private.import_plan(uuid,jsonb),public.admin_import_preview(jsonb),public.admin_import_commit(text) from public,anon,authenticated;
grant execute on function public.admin_import_preview(jsonb),public.admin_import_commit(text) to authenticated;

-- Batch/results may only be appended by the atomic server RPC, never directly.
revoke insert on public.import_batches,public.import_rows from authenticated;
