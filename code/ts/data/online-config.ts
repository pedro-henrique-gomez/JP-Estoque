export interface OnlineConfiguration {
  mode: "online";
  url: string;
  publicKey: string;
}
export type DevelopmentEnvironment = Record<string, unknown>;
export function localApiUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !["54321", "56321"].includes(url.port) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "Configure somente Supabase local: http://127.0.0.1:54321 ou :56321.",
    );
  return url;
}
/** This gate restricts the experimental transport, never authorizes a user. */
export function resolveOnlineConfiguration(
  env: DevelopmentEnvironment,
): OnlineConfiguration | null {
  if (env.VITE_JP_ONLINE_LOCAL !== "true") return null;
  if (env.DEV !== true)
    throw new Error(
      "Online experimental permitido somente no servidor de desenvolvimento.",
    );
  const url = localApiUrl(String(env.VITE_SUPABASE_URL || ""));
  const publicKey = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || "");
  if (!publicKey.startsWith("sb_publishable_")) {
    try {
      const payload = JSON.parse(
        atob(publicKey.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.role !== "anon") throw new Error();
    } catch {
      throw new Error(
        "Use somente chave pública publishable/anon local; segredos administrativos são proibidos.",
      );
    }
  }
  return Object.freeze({ mode: "online", url: url.origin, publicKey });
}
