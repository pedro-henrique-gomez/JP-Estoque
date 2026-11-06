import type { SupabaseClient } from "@supabase/supabase-js";
import { OnlineError } from "./online-error";
import type {
  OnlineImportPreview,
  OnlineImportRequest,
  ImportReceipt,
} from "../online-import-types";
function importError(error: { code?: string }, status: number) {
  if (error.code === "40001")
    return new OnlineError(
      "conflict",
      "Os dados mudaram desde a prévia. Gere uma nova prévia antes de confirmar.",
    );
  if (
    error.code === "22023" ||
    error.code === "22P02" ||
    error.code === "23503"
  )
    return new OnlineError(
      "validation",
      "Importação inválida: confira limites, campos, decisões e descarte explícito das linhas inválidas.",
    );
  if (error.code === "42501" || status === 403)
    return new OnlineError(
      "permission",
      "Importação negada, prévia expirada ou pertencente a outra sessão. Verifique a permissão e gere nova prévia.",
    );
  if (status === 401)
    return new OnlineError("session", "Sessão expirada. Entre novamente.");
  if (error.code === "55P03")
    return new OnlineError(
      "conflict",
      "Banco ocupado. Nenhum lote parcial foi aplicado; gere uma nova prévia.",
    );
  return new OnlineError(
    "connection",
    "Resultado não confirmado. Consulte os lotes e repita a confirmação da mesma prévia para recuperar o recibo, sem duplicar a importação.",
  );
}
export function createOnlineImport(
  client: SupabaseClient,
  verify: () => Promise<unknown>,
) {
  return {
    verify,
    async report(id: string): Promise<ImportReceipt> {
      await verify();
      const batch = await client
        .from("import_batches")
        .select("*")
        .eq("id", id)
        .single();
      if (batch.error) throw importError(batch.error, batch.status);
      if (batch.data.summary?.kind !== "balance_snapshot")
        throw new OnlineError(
          "validation",
          "Lote histórico anterior ao formato v0.9.",
        );
      const rows = await client
        .from("import_rows")
        .select("details,status")
        .eq("batch_id", id)
        .order("source_line")
        .limit(500);
      if (rows.error) throw importError(rows.error, rows.status);
      await verify();
      return {
        batch_id: id,
        actor: batch.data.created_by,
        file_name: batch.data.source_file,
        sheet_name: batch.data.sheet_name,
        date: batch.data.created_at,
        applied: batch.data.summary.applied,
        ignored: rows.data.filter((r) => r.status === "ignored").length,
        reused: true,
        rows: rows.data.map((r) => ({ ...r.details, status: r.status })),
      } as ImportReceipt;
    },
    async preview(request: OnlineImportRequest): Promise<OnlineImportPreview> {
      await verify();
      if (new TextEncoder().encode(JSON.stringify(request)).length > 524288)
        throw new OnlineError("validation", "Payload acima de 512 KiB.");
      const r = await client.rpc("admin_import_preview", { request });
      if (r.error) throw importError(r.error, r.status);
      return r.data as OnlineImportPreview;
    },
    async commit(token: string): Promise<ImportReceipt> {
      await verify();
      const r = await client.rpc("admin_import_commit", {
        preview_token: token,
      });
      if (r.error) throw importError(r.error, r.status);
      return r.data as ImportReceipt;
    },
  };
}
export type OnlineImportService = ReturnType<typeof createOnlineImport>;
