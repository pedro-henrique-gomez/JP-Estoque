import { describe, it, expect, vi } from "vitest";
import * as XLSX from "xlsx";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { parseOnlineWorkbook } from "../code/ts/online-xlsx-parser";
import {
  hardImportLimits,
  onlineImportLimits,
} from "../code/ts/online-import-types";
import { createOnlineImport } from "../code/ts/data/online-import";
const buffer = (book) => {
  const b = XLSX.write(book, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
  });
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
function workbook(
  rows = [
    ["Codigo", "Descricao", "Unidade", "Quantidade"],
    ["TEST", "Ficticio", "m", "999999999999999999.999999"],
  ],
) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Ficticio");
  return book;
}
const asBuffer = (b) =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
describe("online XLSX isolated parser and resource boundaries", () => {
  it("preserves high precision decimal strings exactly", () =>
    expect(parseOnlineWorkbook(buffer(workbook()))[0].rows[1][3]).toEqual({
      text: "999999999999999999.999999",
    }));
  it("accepts ordinary small numeric fractions without evaluating formulas", () =>
    expect(
      parseOnlineWorkbook(
        buffer(
          workbook([
            ["C", "D", "U", "Q"],
            ["TEST", "Ficticio", "m", 1.250001],
          ]),
        ),
      )[0].rows[1][3].text,
    ).toBe("1.250001"));
  it("marks high precision numeric cells as unsafe", () =>
    expect(
      parseOnlineWorkbook(
        buffer(
          workbook([
            ["C", "D", "U", "Q"],
            ["TEST", "Ficticio", "m", 9999999999999999],
          ]),
        ),
      )[0].rows[1][3].error,
    ).toMatch(/texto/));
  it("rejects CSV disguised as xlsx", () =>
    expect(() =>
      parseOnlineWorkbook(
        asBuffer(
          strToU8("codigo,descricao,unidade,quantidade\nT,Ficticio,un,1"),
        ),
      ),
    ).toThrow());
  it("rejects truncated ZIP archives", () => {
    const b = new Uint8Array(buffer(workbook()));
    expect(() =>
      parseOnlineWorkbook(asBuffer(b.slice(0, b.length - 10))),
    ).toThrow();
  });
  it("rejects damaged file CRC/content", () => {
    const b = new Uint8Array(buffer(workbook()));
    b[80] ^= 0xff;
    expect(() => parseOnlineWorkbook(asBuffer(b))).toThrow();
  });
  it("checks compressed input size before parsing", () =>
    expect(() =>
      parseOnlineWorkbook(buffer(workbook()), {
        ...hardImportLimits,
        bytes: 64,
      }),
    ).toThrow(/limite/));
  it("checks maximum rows", () =>
    expect(() =>
      parseOnlineWorkbook(buffer(workbook([["C"], ["1"], ["2"], ["3"]])), {
        ...hardImportLimits,
        rows: 2,
      }),
    ).toThrow(/limite/i));
  it("checks maximum columns", () =>
    expect(() =>
      parseOnlineWorkbook(buffer(workbook()), {
        ...hardImportLimits,
        columns: 3,
      }),
    ).toThrow(/limite/i));
  it("checks number of sheets", () => {
    const b = workbook();
    XLSX.utils.book_append_sheet(b, XLSX.utils.aoa_to_sheet([["x"]]), "Outra");
    expect(() =>
      parseOnlineWorkbook(buffer(b), { ...hardImportLimits, sheets: 1 }),
    ).toThrow(/abas/);
  });
  it("marks formulas instead of taking their cached result", () => {
    const b = workbook();
    b.Sheets.Ficticio.D2 = { t: "n", v: 2, f: "1+1" };
    expect(parseOnlineWorkbook(buffer(b))[0].rows[1][3].error).toMatch(
      /Fórmula/,
    );
  });
  it("marks boolean/date/error cells", () => {
    const b = workbook();
    b.Sheets.Ficticio.D2 = { t: "b", v: true };
    expect(parseOnlineWorkbook(buffer(b))[0].rows[1][3].error).toBeTruthy();
  });
  it("rejects macros even when the extension says xlsx", () => {
    const parts = unzipSync(new Uint8Array(buffer(workbook())));
    parts["xl/vbaProject.bin"] = new Uint8Array([1, 2]);
    expect(() => parseOnlineWorkbook(asBuffer(zipSync(parts)))).toThrow(
      /permitido/,
    );
  });
  it("rejects XML entities and DTDs", () => {
    const parts = unzipSync(new Uint8Array(buffer(workbook())));
    parts["xl/workbook.xml"] = strToU8(
      '<!DOCTYPE x [<!ENTITY x "bad">]>' +
        new TextDecoder().decode(parts["xl/workbook.xml"]),
    );
    expect(() => parseOnlineWorkbook(asBuffer(zipSync(parts)))).toThrow(/XML/);
  });
  it("rejects excessive zip expansion before SheetJS", () => {
    const parts = unzipSync(new Uint8Array(buffer(workbook())));
    parts["xl/bomb.xml"] = strToU8("x".repeat(1000000));
    expect(() =>
      parseOnlineWorkbook(asBuffer(zipSync(parts, { level: 9 }))),
    ).toThrow(/Expansão/);
  });
  it("allows lowering configurable limits only", () => {
    expect(onlineImportLimits({ VITE_JP_IMPORT_MAX_ROWS: "20" }).rows).toBe(20);
    expect(() =>
      onlineImportLimits({ VITE_JP_IMPORT_MAX_ROWS: "501" }),
    ).toThrow();
    expect(() =>
      onlineImportLimits({ VITE_JP_IMPORT_MAX_COLUMNS: "0" }),
    ).toThrow();
  });
});
describe("import service unit checks, not real Auth evidence", () => {
  it("requires current verified administrator before sending RPC", async () => {
    const verify = vi.fn(async () => {
        throw Error("denied");
      }),
      client = { rpc: vi.fn() };
    await expect(
      createOnlineImport(client, verify).commit("opaque-token"),
    ).rejects.toThrow("denied");
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("calls approved RPCs with no actor or privileged key parameter", async () => {
    const client = {
        rpc: vi.fn(async () => ({ error: null, data: { ready: true } })),
      },
      verify = vi.fn(async () => {});
    const service = createOnlineImport(client, verify);
    const request = { destination: "unit-only", rows: [] };
    await service.preview(request);
    await service.commit("opaque-unit-token");
    expect(client.rpc).toHaveBeenCalledWith("admin_import_preview", {
      request,
    });
    expect(client.rpc).toHaveBeenCalledWith("admin_import_commit", {
      preview_token: "opaque-unit-token",
    });
    expect(verify).toHaveBeenCalledTimes(2);
  });
  it("does not automatically retry stale previews", async () => {
    const client = {
      rpc: vi.fn(async () => ({ error: { code: "40001" }, status: 409 })),
    };
    await expect(
      createOnlineImport(client, async () => {}).commit("opaque"),
    ).rejects.toMatchObject({ kind: "conflict" });
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects oversized structured payloads before network", async () => {
    const client = { rpc: vi.fn() };
    await expect(
      createOnlineImport(client, async () => {}).preview({
        rows: ["x".repeat(524289)],
      }),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(client.rpc).not.toHaveBeenCalled();
  });
});

it("report refuses a revoked administrator before reading protected history", async () => {
  const client = { from: vi.fn() };
  const service = createOnlineImport(client, async () => {
    throw Error("revoked");
  });
  await expect(service.report("unit-batch")).rejects.toThrow("revoked");
  expect(client.from).not.toHaveBeenCalled();
});
it("historical report keeps exact text decimals and rechecks current permission", async () => {
  const verify = vi.fn(async () => {});
  const batch = {
    data: {
      created_by: "unit-actor",
      source_file: "ficticio.xlsx",
      sheet_name: "Dados",
      created_at: "2026-11-06",
      summary: { kind: "balance_snapshot", applied: 1 },
    },
    error: null,
  };
  const rr = {
    data: [
      {
        status: "success",
        details: { line: 2, quantity: "999999999999999999.999999" },
      },
    ],
    error: null,
  };
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    single: async () => batch,
    limit: async () => rr,
  };
  const client = { from: vi.fn(() => query) };
  const report = await createOnlineImport(client, verify).report("unit-batch");
  expect(report.rows[0].quantity).toBe("999999999999999999.999999");
  expect(verify).toHaveBeenCalledTimes(2);
});
it("historical report does not return data after revocation during read", async () => {
  const verify = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(Error("revoked"));
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    single: async () => ({
      data: { summary: { kind: "balance_snapshot" } },
      error: null,
    }),
    limit: async () => ({ data: [], error: null }),
  };
  await expect(
    createOnlineImport({ from: () => query }, verify).report("unit-batch"),
  ).rejects.toThrow("revoked");
});
