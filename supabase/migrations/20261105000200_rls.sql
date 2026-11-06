-- Helpers resolve identity from Auth and permissions from protected database rows.
revoke create on schema public from public,anon,authenticated;
create function private.is_active() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active);
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role in ('administrador','proprietario'));
$$;
create function private.can_read_contract(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and (
    p.role in ('diretor','administrador','proprietario') or exists(
      select 1 from public.user_contracts uc where uc.user_id=p.id and uc.contract_id=target
    )
  ));
$$;
create function private.can_read_product(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or exists(select 1 from public.contract_balances b where b.product_id=target and private.can_read_contract(b.contract_id));
$$;
create function private.can_read_supplier(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or exists(select 1 from public.contract_balances b where b.supplier_id=target and private.can_read_contract(b.contract_id));
$$;
revoke all on function private.is_active(), private.is_admin(), private.can_read_contract(uuid), private.can_read_product(uuid), private.can_read_supplier(uuid) from public,anon,authenticated;
grant execute on function private.is_active(), private.is_admin(), private.can_read_contract(uuid), private.can_read_product(uuid), private.can_read_supplier(uuid) to authenticated;

grant select on public.profiles, public.contracts, public.user_contracts, public.products, public.suppliers,
  public.locations, public.contract_balances, public.balance_references, public.import_batches,
  public.import_rows, public.audit_events, public.system_settings to authenticated;

-- No direct profile/membership write grants, even for application administrators.
create policy profiles_read on public.profiles for select to authenticated
  using(id=(select auth.uid()) or private.is_admin());
create policy user_contracts_read on public.user_contracts for select to authenticated
  using(private.is_admin() or (user_id=(select auth.uid()) and private.is_active()));
create policy contracts_read on public.contracts for select to authenticated using(private.can_read_contract(id));
create policy products_read on public.products for select to authenticated using(private.can_read_product(id));
create policy suppliers_read on public.suppliers for select to authenticated using(private.can_read_supplier(id));
create policy locations_read on public.locations for select to authenticated using(private.can_read_contract(contract_id));
create policy balances_read on public.contract_balances for select to authenticated using(private.can_read_contract(contract_id));
create policy references_read on public.balance_references for select to authenticated using(private.can_read_contract(contract_id));
create policy imports_read on public.import_batches for select to authenticated using(private.is_admin());
create policy import_rows_read on public.import_rows for select to authenticated using(private.is_admin());
create policy audit_read on public.audit_events for select to authenticated using(private.is_admin());
create policy settings_read on public.system_settings for select to authenticated using(private.is_admin());

grant insert,delete on public.contracts,public.products,public.suppliers,public.locations,
  public.contract_balances,public.balance_references,public.system_settings to authenticated;
grant update(name) on public.contracts to authenticated;
grant update(code,description,unit,category,manufacturer,model) on public.products to authenticated;
grant update(name,areas,contact) on public.suppliers to authenticated;
grant update(contract_id,code,description) on public.locations to authenticated;
grant update(product_id,contract_id,quantity,location_id,supplier_id) on public.contract_balances to authenticated;
grant update(balance_id,contract_id,kind,reference) on public.balance_references to authenticated;
grant update(system_name,support_email) on public.system_settings to authenticated;
do $$ declare t text; begin
  foreach t in array array['contracts','products','suppliers','locations','contract_balances','balance_references','system_settings'] loop
    execute format('create policy admin_insert on public.%I for insert to authenticated with check(private.is_admin())',t);
    execute format('create policy admin_update on public.%I for update to authenticated using(private.is_admin()) with check(private.is_admin())',t);
    execute format('create policy admin_delete on public.%I for delete to authenticated using(private.is_admin())',t);
  end loop;
end $$;

-- Import records are append-only metadata, not stock movements or procurement.
grant insert on public.import_batches,public.import_rows to authenticated;
create policy imports_append on public.import_batches for insert to authenticated
  with check(private.is_admin() and created_by=(select auth.uid()));
create policy import_rows_append on public.import_rows for insert to authenticated
  with check(private.is_admin() and exists(select 1 from public.import_batches b where b.id=batch_id and b.created_by=(select auth.uid())));

comment on table public.balance_references is 'Existing OC/NF textual references only. No purchasing, approval or receiving workflow.';
comment on table public.contract_balances is 'Independent recorded balances. No movement ledger, automatic increments or transfers.';
