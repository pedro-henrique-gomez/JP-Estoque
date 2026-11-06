import type { CellValue, Spreadsheet } from "./import-types";

export const limits = {
  bytes: 10 * 1024 * 1024,
  rows: 10000,
  columns: 200,
  sheets: 50,
};
function delimiter(text: string): string {
  let quoted = false;
  const counts = new Map([
    [";", 0],
    [",", 0],
    ["\t", 0],
  ]);
  const scores = new Map(counts);
  let lines = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && /[\r\n]/.test(char)) {
      counts.forEach((count, key) => {
        scores.set(key, Math.max(scores.get(key)!, count));
        counts.set(key, 0);
      });
      if (char === "\r" && text[i + 1] === "\n") i++;
      if (++lines >= 100) break;
    } else if (!quoted && counts.has(char))
      counts.set(char, counts.get(char)! + 1);
  }
  counts.forEach((count, key) =>
    scores.set(key, Math.max(scores.get(key)!, count)),
  );
  return [...scores].sort((a, b) => b[1] - a[1])[0][0];
}
export function parseCsv(text: string): string[][] {
  text = text.replace(/^\ufeff/, "");
  const separator = delimiter(text);
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && char === separator) {
      row.push(value);
      value = "";
    } else if (!quoted && /[\r\n]/.test(char)) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += char;
    if (row.length > limits.columns || rows.length > limits.rows + 100)
      throw new Error("Planilha excede os limites de linhas/colunas.");
  }
  if (quoted) throw new Error("CSV com aspas não fechadas.");
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows.some((row) => row.length > limits.columns))
    throw new Error("Mais de 200 colunas no arquivo.");
  return rows;
}
export async function readSpreadsheet(file: File): Promise<Spreadsheet> {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name))
    throw new Error("Selecione um arquivo .xlsx, .xls ou .csv.");
  if (file.size > limits.bytes) throw new Error("Arquivo maior que 10 MB.");
  if (/\.csv$/i.test(file.name))
    return {
      fileName: file.name,
      sheets: [{ name: "CSV", rows: parseCsv(await file.text()) }],
    };
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellFormula: true,
    cellHTML: false,
    cellNF: true,
    cellDates: true,
    sheetRows: limits.rows + 101,
  });
  if (!workbook.SheetNames.length || workbook.SheetNames.length > limits.sheets)
    throw new Error("Arquivo sem abas ou com mais de 50 abas.");
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(
      sheet["!fullref"] || sheet["!ref"] || "A1",
    );
    if (range.e.r >= limits.rows + 100 || range.e.c >= limits.columns)
      throw new Error(
        `Aba ${name}: limite de 10.000 registros (+100 cabeçalhos) e 200 colunas.`,
      );
    const rows: CellValue[][] = [];
    for (let r = 0; r <= range.e.r; r++) {
      const row: CellValue[] = [];
      for (let c = 0; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        row.push(
          !cell
            ? ""
            : cell.f
              ? { error: "Fórmula não aceita; converta em valor." }
              : cell.t === "e"
                ? { error: "Célula com erro de Excel." }
                : cell.t === "d"
                  ? { error: "Data não aceita neste campo." }
                  : cell.t === "n" && cell.z && /^0{2,}$/.test(cell.z)
                    ? XLSX.utils.format_cell(cell)
                    : (cell.v ?? ""),
        );
      }
      rows.push(row);
    }
    return { name, rows };
  });
  return { fileName: file.name, sheets };
}
