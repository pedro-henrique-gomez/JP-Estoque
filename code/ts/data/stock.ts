import type { SupabaseClient } from "@supabase/supabase-js";
import { OnlineError } from "./online-error";
import type { StockPermission } from "../stock-permissions";
export interface StockContext {
  actor: { id: string; name: string };
  role: string;
  permissions: StockPermission[];
  server_time: string;
  contracts: { id: string; name: string }[];
  products: { id: string; code: string; description: string; unit: string }[];
  suppliers: { id: string; name: string }[];
  balances: {
    id: string;
    contract_id: string;
    product_id: string;
    quantity: string;
  }[];
}
export interface Movement {
  id: string;
  actor_id: string;
  actor_name: string;
  contract_id: string;
  contract_name: string;
  product_id: string;
  product_code: string;
  product_description: string;
  unit: string;
  kind: "entrada" | "saida";
  quantity: string;
  before_quantity: string;
  after_quantity: string;
  occurred_at: string;
  supplier_name: string;
  oc: string;
  nf: string;
  destination: string;
  recipient: string;
  recipient_company: string;
  notes: string;
  reversal_of: string | null;
  reversal_reason: string;
  reversed_by: string | null;
  reversal: {
    id: string;
    reason: string;
    actor_name: string;
    occurred_at: string;
  } | null;
  reused?: boolean;
}
export interface StockAdmin {
  users: {
    id: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
  }[];
  roles: { id: string; name: string; system_role: string | null }[];
  role_permissions: { role_id: string; permission: StockPermission }[];
  user_roles: { user_id: string; role_id: string }[];
  overrides: {
    user_id: string;
    permission: StockPermission;
    allowed: boolean;
  }[];
  contracts: { id: string; name: string }[];
  links: { user_id: string; contract_id: string }[];
  audit: Record<string, unknown>[];
}
export function createStockService(client: SupabaseClient) {
  async function invoke<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const r = await client.rpc(name, args);
    if (r.error) {
      const code = r.error.code;
      if (code === "PGRST202")
        throw new OnlineError(
          "validation",
          "O módulo operacional não está disponível no banco local. Aplique a migração 20261106000600_stock_movements.sql e atualize o schema da API. Os dados existentes não foram apagados.",
        );
      if (r.status === 401)
        throw new OnlineError("session", "Sessão expirada. Entre novamente.");
      if (code === "42501" || r.status === 403)
        throw new OnlineError(
          "permission",
          "Acesso negado pelo servidor. Atualize as permissões ou solicite acesso ao responsável.",
        );
      if (code === "40001")
        throw new OnlineError(
          "conflict",
          "O saldo mudou desde a consulta. Atualize e confira novamente antes de confirmar.",
        );
      if (code === "55P03")
        throw new OnlineError(
          "conflict",
          "Banco ocupado. Consulte o histórico antes de repetir a mesma confirmação.",
        );
      if (["22023", "22P02", "22003", "23514", "23503", "23505"].includes(code))
        throw new OnlineError(
          "validation",
          "Dados inválidos, saldo insuficiente, estorno indisponível ou registro já existente. Confira os campos e atualize a consulta.",
        );
      throw new OnlineError(
        "connection",
        "Resultado não confirmado. Consulte o histórico ou repita a mesma confirmação sem alterar o formulário; a chave evita duplicação.",
      );
    }
    return r.data as T;
  }
  const rpc = <T>(name: string, request?: Record<string, unknown>) =>
    invoke<T>(name, request === undefined ? {} : { request });
  return {
    context: () => rpc<StockContext>("stock_context"),
    post: (request: Record<string, unknown>) =>
      rpc<Movement>("stock_post", request),
    reverse: (request: Record<string, unknown>) =>
      rpc<Movement>("stock_reverse", request),
    history: (filters: Record<string, unknown> = {}) =>
      rpc<{
        rows: Movement[];
        offset: number;
        limit: number;
        actors: { id: string; name: string }[];
        products: { id: string; name: string }[];
      }>("stock_history", filters),
    report: (filters: Record<string, unknown> = {}) =>
      rpc<{ rows: Movement[]; offset: number; limit: number }>(
        "stock_report",
        filters,
      ),
    admin: () => rpc<StockAdmin>("stock_admin_snapshot"),
    roles: () => rpc<StockAdmin>("stock_admin_snapshot", { scope: "roles" }),
    saveRole: (request: Record<string, unknown>) =>
      rpc<string>("stock_save_role", request),
    assignRole: (request: Record<string, unknown>) =>
      rpc<void>("stock_assign_role", request),
    override: (request: Record<string, unknown>) =>
      rpc<void>("stock_set_override", request),
    link: (user_id: string, contract_id: string, allowed: boolean) =>
      invoke<void>("admin_set_user_contract", {
        target_id: user_id,
        target_contract: contract_id,
        authorized: allowed,
      }),
    status: (user: StockAdmin["users"][number], active: boolean) =>
      invoke<void>("admin_save_profile", {
        target_id: user.id,
        new_name: user.name,
        new_email: user.email,
        new_role: user.role,
        new_active: active,
      }),
  };
}
export type StockService = ReturnType<typeof createStockService>;
