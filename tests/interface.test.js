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
  for (const id of ["demo-6", "demo-7"]) {
    it(`${id} gerencia materiais, usuários, contratos, fornecedores e configurações`, () => {
      changeUser(id);
      expect(byId("adminArea").classList.contains("hidden")).toBe(false);
      window.edit(0);
      let form = byId("editForm");
      form.elements.namedItem("code").value = "TEST-ADMIN";
      form.elements.namedItem("name").value = "Material de teste";
      form.dispatchEvent(new Event("submit", { cancelable: true }));
      expect(byId("rows").textContent).toContain("Material de teste");
      const material = JSON.parse(
        localStorage.getItem("jp_estoque_demo_v02"),
      ).materials.find((item) => item.code === "TEST-ADMIN");
      window.removeMaterial(material.id);
      expect(byId("rows").textContent).not.toContain("Material de teste");
      const clickText = (panel, text) =>
        [...byId(panel).querySelectorAll("button")]
          .find((button) => button.textContent === text)
          .click();
      clickText("users", "Novo usuário");
      form = byId("administrationForm");
      form.elements.namedItem("name").value = "Pessoa teste";
      form.elements.namedItem("email").value = "pessoa@example.invalid";
      form.querySelector('[name="contracts"]').checked = true;
      form.dispatchEvent(new Event("submit", { cancelable: true }));
      expect(byId("users").textContent).toContain("Pessoa teste");
      clickText("users", "Editar Pessoa teste");
      form = byId("administrationForm");
      form.elements.namedItem("status").value = "inativo";
      form.elements.namedItem("role").value = "diretor";
      form.dispatchEvent(new Event("submit", { cancelable: true }));
      expect(byId("users").textContent).toContain("inativo");
      expect(byId("users").textContent).toContain("Diretor");
      clickText("contractsAdmin", "Novo contrato");
      form = byId("administrationForm");
      form.elements.namedItem("name").value = "Contrato E";
      form.dispatchEvent(new Event("submit", { cancelable: true }));
      expect(byId("contractsAdmin").textContent).toContain("Contrato E");
      expect(byId("permissionHead").textContent).toContain("Contrato E");
      clickText("contractsAdmin", "Excluir Contrato E");
      expect(byId("contractsAdmin").textContent).not.toContain("Contrato E");
      clickText("suppliersAdmin", "Novo fornecedor");
      form = byId("administrationForm");
      form.elements.namedItem("name").value = "Fornecedor teste";
      form.elements.namedItem("areas").value = "Elétrica";
      form.elements.namedItem("contact").value = "Teste";
      form.dispatchEvent(new Event("submit", { cancelable: true }));
      expect(byId("suppliersAdmin").textContent).toContain("Fornecedor teste");
      clickText("suppliersAdmin", "Excluir Fornecedor teste");
      expect(byId("suppliersAdmin").textContent).not.toContain(
        "Fornecedor teste",
      );
      clickText("settings", "Editar configurações");
      form = byId("administrationForm");
      form.elements.namedItem("systemName").value = "JP Estoque Teste";
      form.dispatchEvent(new Event("submit", { cancelable: true }));
      expect(document.querySelector(".brand b").textContent).toBe(
        "JP Estoque Teste",
      );
      expect(byId("history").textContent).toContain("Usuário criado");
      expect(byId("history").textContent).toContain("Material excluído");
      expect(byId("history").textContent).toContain(
        "Configurações atualizadas",
      );
      const snapshot = JSON.parse(
        localStorage.getItem("jp_estoque_admin_demo_v02"),
      );
      expect(
        snapshot.users.find((user) => user.name === "Pessoa teste").status,
      ).toBe("inativo");
      changeUser("demo-5");
      expect(byId("users").textContent).toBe("");
      expect(byId("history").textContent).toBe("");
      expect(byId("adminArea").classList.contains("hidden")).toBe(true);
    });
  }
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
        "codigo;material;unidade;contrato;quantidade\nTEST-1;Material importado;un;Contrato A;5",
    };
    await byId("file").onchange({ target: { files: [file] } });
    byId("preview").click();
    expect(byId("commit").disabled).toBe(true);
    byId("importPolicy").value = "add";
    byId("importPolicy").dispatchEvent(new Event("change"));
    expect(byId("commit").disabled).toBe(false);
    byId("commit").click();
    expect(byId("rows").textContent).toContain("Material importado");
    await byId("file").onchange({
      target: {
        files: [
          {
            ...file,
            text: async () =>
              "codigo;material;unidade;contrato;quantidade\nTEST-2;Inválido;un;Contrato X;2",
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
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["codigo", "material", "unidade", "contrato", "quantidade"],
        ["ELE-001", "Disjuntor atualizado", "un", "Contrato A", 99],
      ]),
      "Planilha",
    );
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = {
      name: "teste.xlsx",
      arrayBuffer: async () => bytes,
    };
    await byId("file").onchange({ target: { files: [file] } });
    byId("preview").click();
    expect(byId("previewRows").textContent).toContain("Atualizar");
    byId("importPolicy").value = "update";
    byId("importPolicy").dispatchEvent(new Event("change"));
    byId("commit").click();
    expect(byId("rows").textContent).toContain("Disjuntor atualizado");
    const csv = {
      name: "duplicados.csv",
      text: async () =>
        "codigo;material;unidade;contrato;quantidade\nDUP;Teste;un;Contrato A;1\nDUP;Teste;un;Contrato A;2",
    };
    await byId("file").onchange({ target: { files: [csv] } });
    byId("preview").click();
    byId("commit").click();
    expect(byId("previewRows").textContent).toContain("duplicados");
    expect(byId("commit").disabled).toBe(true);
    expect(byId("rows").textContent).not.toContain("DUP");
  });
  it("seleciona aba, detecta cabeçalho após título e invalida prévia ao remapear", async () => {
    changeUser("demo-6");
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Orientações"], ["Só testes"]]),
      "Leia primeiro",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["Materiais fictícios"],
        ["codigo", "material", "unidade", "contrato", "quantidade"],
        ["ABA-2", "Produto da segunda aba", "un", "Contrato B", 3],
      ]),
      "Materiais",
    );
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    await byId("file").onchange({
      target: {
        files: [{ name: "varias-abas.xlsx", arrayBuffer: async () => bytes }],
      },
    });
    byId("sheetSelect").value = "Materiais";
    byId("sheetSelect").dispatchEvent(new Event("change"));
    expect(byId("headerRow").value).toBe("2");
    byId("preview").click();
    expect(byId("previewRows").textContent).toContain("Produto da segunda aba");
    const column = document.querySelector('[data-map="name"]');
    column.dispatchEvent(new Event("change"));
    expect(byId("previewArea").classList.contains("hidden")).toBe(true);
    expect(byId("commit").disabled).toBe(true);
  });
  it("cancelar confirmação ou falha de armazenamento não aplica importação; relatório persiste ao concluir", async () => {
    changeUser("demo-7");
    const file = {
      name: "local.csv",
      text: async () =>
        "codigo;material;unidade;contrato;quantidade\nATOM;Produto atomicidade;un;Contrato A;8",
    };
    await byId("file").onchange({ target: { files: [file] } });
    byId("preview").click();
    byId("importPolicy").value = "add";
    byId("importPolicy").dispatchEvent(new Event("change"));
    confirm.mockReturnValueOnce(false);
    byId("commit").click();
    expect(byId("rows").textContent).not.toContain("Produto atomicidade");
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(() => {
        throw new Error("Quota");
      });
    byId("commit").click();
    expect(byId("rows").textContent).not.toContain("Produto atomicidade");
    expect(byId("importMessage").textContent).toContain("Nada foi aplicado");
    spy.mockRestore();
    byId("commit").click();
    expect(byId("rows").textContent).toContain("Produto atomicidade");
    expect(byId("importReports").textContent).toContain("local.csv");
    const saved = JSON.parse(localStorage.getItem("jp_estoque_demo_v02"));
    expect(
      saved.products.find((product) => product.code === "ATOM"),
    ).toBeTruthy();
    expect(saved.importReports[0].fileName).toBe("local.csv");
    expect(saved.importReports[0].added).toBe(1);
    expect(byId("history").textContent).toContain("local.csv");
  });
  it("descarta leitura pendente ao mudar de perfil e nega importação a Diretor", async () => {
    changeUser("demo-7");
    let resolve;
    const promise = new Promise((done) => (resolve = done));
    const loading = byId("file").onchange({
      target: { files: [{ name: "pendente.csv", text: () => promise }] },
    });
    changeUser("demo-5");
    resolve(
      "codigo;material;unidade;contrato;quantidade\nRACE;Não importar;un;Contrato A;1",
    );
    await loading;
    expect(byId("mapping").classList.contains("hidden")).toBe(true);
    expect(byId("commit").disabled).toBe(true);
    await byId("file").onchange({
      target: { files: [{ name: "negado.csv", text: async () => "" }] },
    });
    expect(byId("importMessage").textContent).toContain(
      "Somente Proprietário e Administrador",
    );
  });
});
