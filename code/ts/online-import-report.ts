export function downloadOnlineImportReport(report: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "jp-importacao-relatorio.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
