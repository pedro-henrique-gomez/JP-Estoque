-- Text quantities preserve numeric precision through a future JSON API.
-- Invoker security is essential: the underlying table's RLS must apply.
create view public.contract_balances_api with (security_invoker=true,security_barrier=true) as
select id,product_id,contract_id,quantity::text as quantity,location_id,supplier_id,created_at,updated_at
from public.contract_balances;
revoke all on public.contract_balances_api from public,anon,authenticated;
grant select on public.contract_balances_api to authenticated;
