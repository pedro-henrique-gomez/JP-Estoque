import { parseOnlineWorkbook } from "./online-xlsx-parser";
import type { ImportLimits } from "./online-import-types";
self.onmessage = (
  event: MessageEvent<{ buffer: ArrayBuffer; limits: ImportLimits }>,
) => {
  try {
    self.postMessage({
      sheets: parseOnlineWorkbook(event.data.buffer, event.data.limits),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Arquivo inválido.",
    });
  }
};
