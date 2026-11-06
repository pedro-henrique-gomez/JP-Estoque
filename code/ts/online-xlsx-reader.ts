import {
  hardImportLimits,
  type ImportLimits,
  type OnlineWorkbook,
} from "./online-import-types";
export async function readOnlineWorkbook(
  file: File,
  limits: ImportLimits = hardImportLimits,
  signal?: AbortSignal,
): Promise<OnlineWorkbook> {
  if (!/\.xlsx$/i.test(file.name) || file.size > limits.bytes || !file.size)
    throw Error("Selecione .xlsx dentro do limite de tamanho.");
  const buffer = await file.arrayBuffer();
  const sha256 = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  if (signal?.aborted) throw Error("Leitura cancelada.");
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./online-xlsx-worker.ts", import.meta.url),
      { type: "module" },
    );
    const cleanup = () => {
      clearTimeout(timeout);
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(Error("Leitura cancelada."));
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(Error("Tempo de leitura excedido."));
    }, limits.timeout);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event) => {
      cleanup();
      if (event.data.error) reject(Error(event.data.error));
      else resolve({ fileName: file.name, sha256, sheets: event.data.sheets });
    };
    worker.onerror = () => {
      cleanup();
      reject(Error("Não foi possível ler a planilha com segurança."));
    };
    worker.postMessage({ buffer, limits }, [buffer]);
  });
}
