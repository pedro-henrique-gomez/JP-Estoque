import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

const html = readFileSync("code/html/index.html", "utf8");
function changeUser(id) {
  const select = document.getElementById("demoUser");
  select.value = id;
  select.dispatchEvent(new Event("change"));
}
const byId = (id) => document.getElementById(id);
beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  document.documentElement.innerHTML = html.replace(/<!doctype html>/i, "");
  vi.stubGlobal("alert", vi.fn());
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  vi.stubGlobal("edit", (...args) => window.edit(...args));
  await import("../code/js/script.js");
});
afterEach(() => vi.unstubAllGlobals());

describe("interface e funcionalidades preservadas", () => {
  it("consulta, detalhes e opções respeitam contratos; troca fecha detalhes", () => {
    expect(byId("statProducts").textContent).toBe("2");
    expect([...byId("contract").options].map((o) => o.value)).toEqual([
      "",
      "Contrato A",
    ]);
    window.detail(3);
    expect(byId("modal").classList.contains("hidden")).toBe(true);
    window.detail(1);
    expect(byId("modal").classList.contains("hidden")).toBe(false);
    changeUser("demo-2");
    expect(byId("modal").classList.contains("hidden")).toBe(true);
    expect(byId("rows").textContent).toContain("Cabo flexível");
    expect(byId("rows").textContent).not.toContain("Disjuntor");
    expect(byId("adminRows").textContent).toBe("");
    changeUser("demo-5");
    expect(byId("statProducts").textContent).toBe("7");
    expect(byId("adminArea").classList.contains("hidden")).toBe(true);
    expect(byId("permissionRows").children.length).toBe(7);
  });
  it("inativo e sem vínculos não consultam nem editam", () => {
    for (const id of ["demo-inativo", "demo-sem-contratos"]) {
      changeUser(id);
      expect(byId("statProducts").textContent).toBe("0");
      window.edit(1);
      expect(byId("modal").classList.contains("hidden")).toBe(true);
      expect(byId("supplierCards").textContent).toBe("");
    }
  });
  it("admin edita e restaura; troca de perfil invalida formulário e importação", () => {
    changeUser("demo-7");
    expect(byId("adminArea").classList.contains("hidden")).toBe(false);
    window.edit(1);
    const form = byId("editForm");
    form.elements.namedItem("name").value = "Material editado";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(byId("rows").textContent).toContain("Material editado");
    expect(localStorage.getItem("jp_estoque_demo_v02")).toContain(
      "Material editado",
    );
    byId("reset").click();
    expect(byId("rows").textContent).toContain("Disjuntor bipolar");
    window.edit(1);
    changeUser("demo-1");
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(byId("rows").textContent).not.toContain("Material editado");
    expect(byId("previewArea").classList.contains("hidden")).toBe(true);
  });
  it("busca, fornecedores e exportação mantêm o escopo de consulta", () => {
    byId("search").value = "sensor";
    byId("search").dispatchEvent(new Event("input"));
    expect(byId("statProducts").textContent).toBe("1");
    const blobs = [];
    vi.stubGlobal(
      "Blob",
      class {
        constructor(parts) {
          blobs.push(parts.join(""));
        }
      },
    );
    URL.createObjectURL = vi.fn(() => "blob:demo");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    byId("exportConsult").click();
    expect(blobs[0]).toContain("Sensor indutivo");
    expect(blobs[0]).not.toContain("Cabo flexível");
    document.querySelector('[data-page="fornecedores"]').click();
    expect(byId("fornecedores").classList.contains("hidden")).toBe(false);
  });
  it("importa CSV com mapeamento e prévia; nega contrato desconhecido", async () => {
    changeUser("demo-7");
    const file = {
      name: "teste.csv",
      text: async () =>
        "codigo;material;contrato;quantidade\nTEST-1;Material importado;Contrato A;5",
    };
    await byId("file").onchange({ target: { files: [file] } });
    byId("preview").click();
    expect(byId("commit").disabled).toBe(false);
    byId("commit").click();
    expect(byId("rows").textContent).toContain("Material importado");
    await byId("file").onchange({
      target: {
        files: [
          {
            ...file,
            text: async () =>
              "codigo;material;contrato;quantidade\nTEST-2;Inválido;Contrato X;2",
          },
        ],
      },
    });
    byId("preview").click();
    expect(byId("commit").disabled).toBe(true);
    changeUser("demo-1");
    byId("commit").click();
    expect(byId("rows").textContent).not.toContain("TEST-2");
  });
  it("mantém leitura Excel, atualização existente e bloqueio de duplicados", async () => {
    changeUser("demo-7");
    vi.stubGlobal("XLSX", {
      read: vi.fn(() => ({
        SheetNames: ["Planilha"],
        Sheets: { Planilha: {} },
      })),
      utils: {
        sheet_to_json: vi.fn(() => [
          ["codigo", "material", "contrato", "quantidade"],
          ["ELE-001", "Disjuntor atualizado", "Contrato A", 99],
        ]),
      },
    });
    const file = {
      name: "teste.xlsx",
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    await byId("file").onchange({ target: { files: [file] } });
    byId("preview").click();
    expect(byId("previewRows").textContent).toContain("Atualizar");
    byId("commit").click();
    expect(byId("rows").textContent).toContain("Disjuntor atualizado");
    const csv = {
      name: "duplicados.csv",
      text: async () =>
        "codigo;material;contrato;quantidade\nDUP;Teste;Contrato A;1\nDUP;Teste;Contrato A;2",
    };
    await byId("file").onchange({ target: { files: [csv] } });
    byId("preview").click();
    byId("commit").click();
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("duplicados"));
    expect(byId("rows").textContent).not.toContain("DUP");
  });
});
