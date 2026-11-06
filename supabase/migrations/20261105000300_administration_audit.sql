create function private.stamp_timestamps() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='INSERT' then new.created_at=clock_timestamp(); else new.created_at=old.created_at; end if;
  new.updated_at=clock_timestamp(); return new;
end;
$$;
revoke all on function private.stamp_timestamps() from public,anon,authenticated;

create function private.record_audit() returns trigger language plpgsql security definer set search_path = '' as $$
declare before_row jsonb; after_row jsonb; actor public.app_role;
begin
  if tg_op <> 'INSERT' then before_row=to_jsonb(old); end if;
  if tg_op <> 'DELETE' then after_row=to_jsonb(new); end if;
  select p.role into actor from public.profiles p where p.id=(select auth.uid());
  insert into public.audit_events(actor_id,actor_role,entity,entity_id,operation,before_data,after_data)
    values((select auth.uid()),actor,tg_table_name,
      coalesce(after_row->>'id',before_row->>'id',after_row->>'user_id',before_row->>'user_id','singleton'),
      tg_op,before_row,after_row);
  return null;
end;
$$;
revoke all on function private.record_audit() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['profiles','contracts','user_contracts','products','suppliers','locations','contract_balances','balance_references','import_batches','import_rows','system_settings'] loop
    execute format('create trigger stamp before insert or update on public.%I for each row execute function private.stamp_timestamps()',t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.record_audit()',t);
  end loop;
end $$;

-- These RPCs do not create Auth accounts. They manage existing Auth identities.
-- All parameters are untrusted; the actor is resolved from auth.uid() and DB state.
create function private.require_other_user_admin(target uuid) returns void language plpgsql security definer set search_path = '' as $$
declare actor_role public.app_role; actor_active boolean;
begin
  perform 1 from private.administration_mutex where singleton for update;
  select p.role,p.active into actor_role,actor_active from public.profiles p where p.id=(select auth.uid()) for update;
  if not coalesce(actor_active,false) or actor_role not in ('administrador','proprietario') then raise exception 'Active administrative permission required' using errcode='42501'; end if;
  if target is null or target=(select auth.uid()) then raise exception 'Self-administration is forbidden' using errcode='42501'; end if;
end;
$$;
revoke all on function private.require_other_user_admin(uuid) from public,anon,authenticated;

create function public.admin_save_profile(target_id uuid, new_name text, new_email text, new_role public.app_role, new_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare previous public.profiles;
begin
  perform private.require_other_user_admin(target_id);
  select * into previous from public.profiles where id=target_id for update;
  if found then
    if previous.active and previous.role in ('administrador','proprietario')
       and not (new_active and new_role in ('administrador','proprietario'))
       and not exists(select 1 from public.profiles p where p.id<>target_id and p.active and p.role in ('administrador','proprietario')) then
      raise exception 'At least one active administrator or owner must remain' using errcode='23514';
    end if;
    update public.profiles set name=new_name,email=new_email,role=new_role,active=new_active where id=target_id;
  else
    insert into public.profiles(id,name,email,role,active) values(target_id,new_name,new_email,new_role,new_active);
  end if;
end;
$$;
create function public.admin_set_user_contract(target_id uuid, target_contract uuid, authorized boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_other_user_admin(target_id);
  if authorized is null or target_contract is null then raise exception 'Contract and authorization required' using errcode='23502'; end if;
  if authorized then
    insert into public.user_contracts(user_id,contract_id) values(target_id,target_contract) on conflict do nothing;
  else
    delete from public.user_contracts where user_id=target_id and contract_id=target_contract;
  end if;
end;
$$;
revoke all on function public.admin_save_profile(uuid,text,text,public.app_role,boolean), public.admin_set_user_contract(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.admin_save_profile(uuid,text,text,public.app_role,boolean), public.admin_set_user_contract(uuid,uuid,boolean) to authenticated;
