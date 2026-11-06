// Required integrated scenarios. None is marked passed by a readiness check.
export const requiredCases = [
  ["login-correct", "Login correto via GoTrue"],
  ["login-incorrect", "Login incorreto via GoTrue"],
  ["jwt-valid", "JWT legítimo emitido pelo Auth e aceito pelo PostgREST"],
  ["jwt-invalid", "JWT inválido negado pela API"],
  ["jwt-expired", "JWT legítimo expirado negado sem refazer sua assinatura"],
  ["refresh", "Renovação real de sessão e tokens"],
  ["logout", "Logout e revogação da renovação de sessão"],
  ["inactive", "Perfil desativado sem acesso de negócio"],
  ["no-contract", "Usuário sem contrato sem acesso de negócio"],
  ["metadata", "Alteração real de user_metadata sem elevar privilégios"],
  ["self-promotion", "Tentativa de autopromoção negada por HTTP"],
  ["cross-contract", "Contrato não autorizado negado pela API"],
  ["rpc-allowed", "RPC administrativa permitida ao gestor legítimo"],
  ["rpc-denied", "RPC administrativa negada ao leitor e ao próprio alvo"],
  ["revocation", "Vínculo/status revogado em sessão já existente"],
  ["api-exposure", "Tabelas, views, funções e relacionamentos sem vazamento"],
  ["history", "Histórico administrativo imutável pela API"],
  ["profile-matrix", "Matriz dos sete perfis e inativos com JWTs reais"],
].map(([id, name]) => ({ id, name }));

export function blockedReport(evidence) {
  const reason = evidence.runtimeReady
    ? "HTTP_SUITE_PENDING_REAL_STACK_EXECUTION"
    : "LOCAL_RUNTIME_UNAVAILABLE";
  return {
    version: "0.6.0",
    status: "blocked",
    reason,
    executed: 0,
    passed: 0,
    failed: 0,
    blocked: requiredCases.length,
    evidence,
    cases: requiredCases.map((test) => ({
      ...test,
      status: "blocked",
      reason,
    })),
    limits: [
      "No real Supabase Auth/PostgREST/JWT checks were executed.",
      "Native PostgreSQL tests do not count as integrated authentication tests.",
    ],
  };
}
