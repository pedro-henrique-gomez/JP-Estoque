import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseCsv,
  readSpreadsheet,
  limits,
} from "../code/ts/spreadsheet-reader";

describe("leitura real de arquivos fictícios em memória", () => {
  for (const bookType of ["xlsx", "xls"])
    it(`lê ${bookType} com várias abas, títulos e zeros à esquerda`, async () => {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([["Notas"], ["Somente teste"]]),
        "Orientações",
      );
      const sheet = XLSX.utils.aoa_to_sheet([
        ["Título"],
        ["Código", "Descrição", "Unidade", "Contrato", "Quantidade"],
        [1, "Produto fictício", "un", "Contrato A", 2],
      ]);
      sheet.A3.z = "00000";
      XLSX.utils.book_append_sheet(workbook, sheet, "Materiais");
      const bytes = XLSX.write(workbook, { type: "array", bookType });
      const result = await readSpreadsheet({
        name: `teste.${bookType}`,
        size: bytes.byteLength,
        arrayBuffer: async () => bytes,
      });
      expect(result.sheets.map((sheet) => sheet.name)).toEqual([
        "Orientações",
        "Materiais",
      ]);
      expect(result.sheets[1].rows[2][0]).toBe("00001");
      expect(result.sheets[1].rows[2][4]).toBe(2);
    });
  it("não calcula fórmulas e identifica células de erro e datas", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = {
      A1: { t: "n", f: "1+1", v: 2 },
      B1: { t: "e", v: 7 },
      C1: { t: "d", v: new Date("2026-01-01T00:00:00Z") },
      "!ref": "A1:C1",
    };
    XLSX.utils.book_append_sheet(workbook, sheet, "Teste");
    const bytes = XLSX.write(workbook, {
      type: "array",
      bookType: "xlsx",
      cellDates: true,
    });
    const result = await readSpreadsheet({
      name: "formulas.xlsx",
      arrayBuffer: async () => bytes,
    });
    expect(result.sheets[0].rows[0][0].error).toContain("Fórmula");
    expect(result.sheets[0].rows[0][1].error).toContain("erro");
    expect(result.sheets[0].rows[0][2].error).toContain("Data");
  });
  it("CSV mantém vírgula decimal, delimitadores em aspas, aspas escapadas e linhas reais", () => {
    expect(
      parseCsv(
        '\ufeffCódigo;Descrição;Quantidade\r\n001;"Cabo; teste ""A""";1,5\r\n\r\n',
      ),
    ).toEqual([
      ["Código", "Descrição", "Quantidade"],
      ["001", 'Cabo; teste "A"', "1,5"],
      [""],
    ]);
    expect(() => parseCsv('a;b\n"aberto;b')).toThrow(/aspas/);
    expect(
      parseCsv("Título\nCódigo,Descrição,Unidade\n001,Produto,un")[1],
    ).toEqual(["Código", "Descrição", "Unidade"]);
  });
  it("rejeita extensão não suportada e arquivo excessivo", async () => {
    await expect(readSpreadsheet({ name: "teste.pdf" })).rejects.toThrow(
      /xlsx/,
    );
    await expect(
      readSpreadsheet({ name: "teste.xlsx", size: limits.bytes + 1 }),
    ).rejects.toThrow(/10 MB/);
  });
});
