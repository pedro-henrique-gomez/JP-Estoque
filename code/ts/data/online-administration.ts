import type { SupabaseClient } from "@supabase/supabase-js";
import type { RemoteProfile } from "./contracts";
import { hasPermission } from "../access";
import { roles } from "../types";
import { OnlineError } from "./online-error";

export const administrativeEntities = {
  products: {
    label: "Materiais",
    fields: {
      code: "Código",
      description: "Descrição",
      unit: "Unidade",
      category: "Categoria",
      manufacturer: "Fabricante",
      model: "Modelo",
    },
    required: ["code", "description", "unit"],
  },
  contracts: {
    label: "Contratos",
    fields: { name: "Nome" },
    required: ["name"],
  },
  suppliers: {
    label: "Fornecedores",
    fields: { name: "Nome", areas: "Áreas", contact: "Contato" },
    required: ["name"],
  },
  locations: {
    label: "Localizações",
    fields: {
      contract_id: "Contrato",
      code: "Código",
      description: "Descrição",
    },
    required: ["contract_id", "code"],
  },
} as const;
export type AdministrativeEntity = keyof typeof administrativeEntities;
export interface AdministrativeRecord {
  id: string;
  [field: string]: unknown;
}
export interface UserContract {
  user_id: string;
  contract_id: string;
}
export interface AdministrativeSnapshot {
  profile: RemoteProfile;
  users: RemoteProfile[];
  links: UserContract[];
  products: AdministrativeRecord[];
  contracts: AdministrativeRecord[];
  suppliers: AdministrativeRecord[];
  locations: AdministrativeRecord[];
  audit: AdministrativeRecord[];
  imports: AdministrativeRecord[];
}
export function isOnlineAdministrator(profile: RemoteProfile) {
  return hasPermission(
    {
      ...profile,
      status: profile.active ? "ativo" : "inativo",
      authorizedContractIds: [],
    },
    "manage_users",
  );
}
export function administrativePayload(
  entity: AdministrativeEntity,
  input: Record<string, unknown>,
) {
  if (!Object.hasOwn(administrativeEntities, entity))
    throw new OnlineError("validation", "Cadastro não permitido nesta versão.");
  const definition = administrativeEntities[entity];
  const fields = Object.keys(definition.fields),
    payload: Record<string, string> = {};
  if (Object.keys(input).some((k) => !fields.includes(k)))
    throw new OnlineError("validation", "Campo não permitido neste cadastro.");
  for (const field of fields) {
    if (input[field] !== undefined && typeof input[field] !== "string")
      throw new OnlineError("validation", "Informe valores de texto válidos.");
    payload[field] = String(input[field] ?? "").trim();
  }
  if (definition.required.some((field) => !payload[field]))
    throw new OnlineError(
      "validation",
      "Preencha todos os campos obrigatórios.",
    );
  return payload;
}
export function administrativeFailure(
  error: { code?: string } | null,
  status: number,
): OnlineError {
  if (status === 401)
    return new OnlineError("session", "Sessão expirada. Entre novamente.");
  if (status === 403 || error?.code === "42501")
    return new OnlineError(
      "permission",
      "Acesso administrativo negado pelo servidor.",
    );
  if (error?.code === "23503")
    return new OnlineError(
      "conflict",
      "Registro vinculado a outros dados. Remova os vínculos permitidos antes de excluir ou alterar.",
    );
  if (error?.code === "23505")
    return new OnlineError(
      "conflict",
      "Já existe um cadastro com esse código ou nome.",
    );
  if (["23514", "23502", "22P02"].includes(error?.code || ""))
    return new OnlineError(
      "validation",
      "Dados inválidos. Confira unidade, campos obrigatórios e referências.",
    );
  return new OnlineError(
    "connection",
    "Operação não confirmada. Atualize os dados antes de tentar novamente; não há repetição automática.",
  );
}
export function createOnlineAdministration(
  client: SupabaseClient,
  verifiedProfile: () => Promise<RemoteProfile>,
) {
  async function verify() {
    const profile = await verifiedProfile();
    if (!isOnlineAdministrator(profile))
      throw new OnlineError(
        "permission",
        "Acesso administrativo não autorizado para este perfil.",
      );
    return profile;
  }
  async function read<T>(table: string, orders = ["id"]): Promise<T[]> {
    const rows: T[] = [];
    for (let start = 0; ; start += 300) {
      let query = client.from(table).select("*");
      for (const column of orders) query = query.order(column);
      const r = await query.range(start, start + 299);
      if (r.error) throw administrativeFailure(r.error, r.status);
      rows.push(...(r.data as T[]));
      if (r.data.length < 300) return rows;
    }
  }
  async function otherUser(id: string) {
    const profile = await verify();
    if (id === profile.id)
      throw new OnlineError(
        "permission",
        "Autoadministração proibida: outro gestor deve alterar seu perfil ou vínculos.",
      );
    return profile;
  }
  async function affected(result: {
    data: unknown[] | null;
    error: { code?: string } | null;
    status: number;
  }) {
    if (result.error) throw administrativeFailure(result.error, result.status);
    if (result.data?.length !== 1)
      throw new OnlineError(
        "permission",
        "Nenhuma alteração confirmada: registro indisponível ou permissão revogada.",
      );
  }
  return {
    verify,
    async snapshot(): Promise<AdministrativeSnapshot> {
      const profile = await verify();
      const [
        users,
        links,
        products,
        contracts,
        suppliers,
        locations,
        imports,
        auditResult,
      ] = await Promise.all([
        read<RemoteProfile>("profiles"),
        read<UserContract>("user_contracts", ["user_id", "contract_id"]),
        read<AdministrativeRecord>("products"),
        read<AdministrativeRecord>("contracts"),
        read<AdministrativeRecord>("suppliers"),
        read<AdministrativeRecord>("locations"),
        read<AdministrativeRecord>("import_batches"),
        client
          .from("audit_events")
          .select("*")
          .order("occurred_at", { ascending: false })
          .order("id")
          .limit(100),
      ]);
      if (auditResult.error)
        throw administrativeFailure(auditResult.error, auditResult.status);
      const confirmed = await verify();
      if (confirmed.id !== profile.id)
        throw new OnlineError(
          "session",
          "Sessão alterada. Reabra a administração.",
        );
      return {
        profile: confirmed,
        users,
        links,
        products,
        contracts,
        suppliers,
        locations,
        imports,
        audit: auditResult.data as AdministrativeRecord[],
      };
    },
    async save(
      entity: AdministrativeEntity,
      input: Record<string, unknown>,
      id?: string,
    ) {
      await verify();
      const payload = administrativePayload(entity, input);
      const result = id
        ? await client.from(entity).update(payload).eq("id", id).select("id")
        : await client.from(entity).insert(payload).select("id");
      await affected(result);
    },
    async remove(entity: AdministrativeEntity, id: string) {
      await verify();
      if (!Object.hasOwn(administrativeEntities, entity))
        throw new OnlineError("validation", "Cadastro não permitido.");
      await affected(
        await client.from(entity).delete().eq("id", id).select("id"),
      );
    },
    async setUserContract(id: string, contractId: string, authorized: boolean) {
      await otherUser(id);
      const r = await client.rpc("admin_set_user_contract", {
        target_id: id,
        target_contract: contractId,
        authorized,
      });
      if (r.error) throw administrativeFailure(r.error, r.status);
    },
    async saveProfile(profile: RemoteProfile) {
      await otherUser(profile.id);
      if (
        !roles.includes(profile.role) ||
        !profile.name.trim() ||
        !profile.email.trim()
      )
        throw new OnlineError("validation", "Confira os dados do usuário.");
      const r = await client.rpc("admin_save_profile", {
        target_id: profile.id,
        new_name: profile.name.trim(),
        new_email: profile.email.trim(),
        new_role: profile.role,
        new_active: profile.active,
      });
      if (r.error) throw administrativeFailure(r.error, r.status);
    },
  };
}
export type OnlineAdministration = ReturnType<
  typeof createOnlineAdministration
>;
