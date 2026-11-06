import { createStockService } from "./stock";
import { createClient } from "@supabase/supabase-js";
import type { OnlineConfiguration } from "./online-config";
import { localApiUrl } from "./online-config";
import type { RemoteProfile, RemoteProduct } from "./contracts";
import { OnlineError } from "./online-error";
import { createOnlineAdministration } from "./online-administration";
export { OnlineError } from "./online-error";
export interface OnlineContract {
  id: string;
  name: string;
}
export interface OnlineRow {
  id: string;
  product_id: string;
  contract_id: string;
  quantity: string;
  location_id: string | null;
  supplier_id: string | null;
  updated_at: string;
}
export interface OnlineLocation {
  id: string;
  code: string;
  description: string;
  contract_id: string;
}
export interface OnlineReference {
  id: string;
  balance_id: string;
  contract_id: string;
  kind: "oc" | "nf";
  reference: string;
}
export interface OnlineSupplier {
  id: string;
  name: string;
}
export interface OnlineSnapshot {
  profile: RemoteProfile;
  contracts: OnlineContract[];
  products: RemoteProduct[];
  balances: OnlineRow[];
  locations: OnlineLocation[];
  suppliers: OnlineSupplier[];
  references: OnlineReference[];
}
export function createOnlineBackend(
  configuration: OnlineConfiguration,
  storage: Storage,
) {
  const origin = localApiUrl(configuration.url).origin;
  const client = createClient(origin, configuration.publicKey, {
    auth: {
      storage,
      storageKey: `jp_online_v07_${new URL(origin).port}`,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      debug: false,
    },
    global: {
      fetch: async (input, init) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        if (url.origin !== origin || !/^\/(auth|rest)\/v1\//.test(url.pathname))
          throw new OnlineError("connection", "Destino de rede não permitido.");
        return fetch(input, {
          ...init,
          redirect: "error",
          signal: AbortSignal.any([
            AbortSignal.timeout(12000),
            ...(init?.signal ? [init.signal] : []),
          ]),
        });
      },
    },
  });
  async function verifiedProfile(): Promise<RemoteProfile> {
    const session = await client.auth.getSession();
    if (session.error && (!session.error.status || session.error.status >= 500))
      throw new OnlineError(
        "connection",
        "Não foi possível recuperar a sessão sem conexão com o Supabase local.",
      );
    if (!session.data.session)
      throw new OnlineError(
        "session",
        "Entre para consultar o ambiente local.",
      );
    const identity = await client.auth.getUser();
    if (identity.error) {
      if (
        identity.error.status &&
        [400, 401, 403].includes(identity.error.status)
      )
        throw new OnlineError(
          "session",
          "Sessão expirada ou inválida. Entre novamente.",
        );
      throw new OnlineError(
        "connection",
        "Sem conexão com o Supabase local. Tente novamente.",
      );
    }
    const result = await client
      .from("profiles")
      .select("id,name,email,role,active")
      .eq("id", identity.data.user.id)
      .maybeSingle();
    if (result.error)
      throw new OnlineError(
        "connection",
        "Não foi possível verificar as permissões no servidor local.",
      );
    if (!result.data)
      throw new OnlineError(
        "permission",
        "Usuário sem perfil autorizado. Solicite acesso ao responsável.",
      );
    if (!result.data.active)
      throw new OnlineError(
        "inactive",
        "Usuário inativo. Solicite a reativação ao responsável.",
      );
    return result.data as RemoteProfile;
  }
  async function list<T>(table: string, columns = "*"): Promise<T[]> {
    const all: T[] = [];
    for (let start = 0; ; start += 300) {
      const result = await client
        .from(table)
        .select(columns)
        .order("id")
        .range(start, start + 299);
      if (result.error)
        throw new OnlineError(
          result.status === 401 ? "session" : "connection",
          result.status === 401
            ? "Sessão expirada. Entre novamente."
            : "Consulta indisponível. Verifique a conexão e tente novamente.",
        );
      const rows = result.data as unknown as T[];
      all.push(...rows);
      if (rows.length < 300) return all;
    }
  }
  return {
    client,
    stock: createStockService(client),
    administration: createOnlineAdministration(client, verifiedProfile),
    async login(email: string, password: string) {
      const result = await client.auth.signInWithPassword({ email, password });
      if (result.error)
        throw new OnlineError(
          result.error.status && result.error.status < 500
            ? "session"
            : "connection",
          result.error.status && result.error.status < 500
            ? "Email ou senha inválidos, ou acesso indisponível."
            : "Sem conexão com o Supabase local.",
        );
    },
    async logout() {
      const result = await client.auth.signOut({ scope: "global" });
      if (result.error) {
        await client.auth.signOut({ scope: "local" });
        throw new OnlineError(
          "connection",
          "Sessão removida deste navegador. Não foi possível confirmar a revogação no servidor.",
        );
      }
    },
    async snapshot(): Promise<OnlineSnapshot> {
      const profile = await verifiedProfile();
      const [contracts, products, balances, locations, suppliers, references] =
        await Promise.all([
          list<OnlineContract>("contracts", "id,name"),
          list<RemoteProduct>("products"),
          list<OnlineRow>("contract_balances_api"),
          list<OnlineLocation>("locations"),
          list<OnlineSupplier>("suppliers", "id,name"),
          list<OnlineReference>("balance_references"),
        ]);
      const confirmed = await verifiedProfile();
      if (confirmed.id !== profile.id)
        throw new OnlineError(
          "session",
          "Sessão alterada. Consulte novamente.",
        );
      return {
        profile: confirmed,
        contracts,
        products,
        balances,
        locations,
        suppliers,
        references,
      };
    },
  };
}
