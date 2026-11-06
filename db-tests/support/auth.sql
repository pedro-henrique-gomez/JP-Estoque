-- TEST HARNESS ONLY. Never apply to a Supabase project; Auth owns these objects.
create role anon nologin nosuperuser nobypassrls noinherit;
create role authenticated nologin nosuperuser nobypassrls noinherit;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
revoke all on auth.users from public,anon,authenticated;
grant usage on schema auth,public to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
-- Model permissive platform defaults before migrations; hardening must remove both scopes.
alter default privileges grant all on tables to anon,authenticated;
alter default privileges in schema public grant all on tables to anon,authenticated;
alter default privileges grant all on sequences to anon,authenticated;
alter default privileges in schema public grant all on sequences to anon,authenticated;
alter default privileges grant execute on functions to public,anon,authenticated;
alter default privileges in schema public grant execute on functions to anon,authenticated;
