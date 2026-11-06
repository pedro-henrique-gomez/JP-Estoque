import { mountImport } from "../ts/import-interface.ts";
import { codeKey, globalFields } from "../ts/inventory.ts";
import { canManage, hasPermission } from "../ts/access.ts";
import {
  currentDemoUser,
  canReadMaterial,
  mountDemoAccess,
  refreshDemoAccess,
} from "../ts/demo-access.ts";
import { demoStorage } from "../ts/demo-storage.ts";
import {
  contracts,
  demoUserFixtures,
  demoContractFixtures,
} from "../ts/demo-data.ts";
import { demoAdminStorage } from "../ts/demo-admin-storage.ts";
import { DemoAdministration } from "../ts/demo-administration.ts";
import { mountAdministration } from "../ts/admin-interface.ts";
import { mountInterface } from "../ts/interface.ts";

const ui = mountInterface(() => {
  document.getElementById("search").value = "";
  document.getElementById("contract").value = "";
  document.getElementById("category").value = "";
  render();
});

const seed = [
  {
    id: 1,
    code: "ELE-001",
    name: "Disjuntor bipolar 20A",
    category: "Elétrica",
    contract: "Contrato A",
    qty: 60,
    unit: "un",
    location: "Corredor 01 · E02 · P03",
    brand: "Schneider",
    model: "20A bipolar",
    supplier: "Obramax",
    oc: "OC-00245",
    nf: "000154",
  },
  {
    id: 2,
    code: "AUT-002",
    name: "Sensor indutivo M18",
    category: "Automação",
    contract: "Contrato A",
    qty: 12,
    unit: "un",
    location: "Corredor 02 · E01 · P01",
    brand: "WEG",
    model: "M18 PNP",
    supplier: "Distribuidor técnico",
    oc: "OC-00246",
    nf: "000155",
  },
  {
    id: 3,
    code: "ELE-003",
    name: "Cabo flexível 2,5 mm²",
    category: "Elétrica",
    contract: "Contrato B",
    qty: 250,
    unit: "m",
    location: "Corredor 01 · E04 · P02",
    brand: "Prysmian",
    model: "750V",
    supplier: "Obramax",
    oc: "OC-00247",
    nf: "000156",
  },
  {
    id: 4,
    code: "HID-004",
    name: "Joelho PVC soldável 25 mm",
    category: "Hidráulica",
    contract: "Contrato C",
    qty: 95,
    unit: "un",
    location: "Corredor 03 · E01 · P02",
    brand: "Tigre",
    model: "25 mm",
    supplier: "Obramax",
    oc: "OC-00248",
    nf: "000157",
  },
  {
    id: 5,
    code: "CIV-005",
    name: "Cimento CP II 50 kg",
    category: "Civil",
    contract: "Contrato D",
    qty: 28,
    unit: "saco",
    location: "Depósito · Setor 04",
    brand: "Votoran",
    model: "CP II",
    supplier: "Fornecedor civil",
    oc: "OC-00249",
    nf: "000158",
  },
  {
    id: 6,
    code: "ELE-001",
    name: "Disjuntor bipolar 20A",
    category: "Elétrica",
    contract: "Contrato C",
    qty: 14,
    unit: "un",
    location: "Corredor 02 · E03 · P01",
    brand: "Schneider",
    model: "20A bipolar",
    supplier: "Obramax",
    oc: "OC-00250",
    nf: "000159",
  },
  {
    id: 7,
    code: "AUT-006",
    name: "Contator tripolar 25A",
    category: "Automação",
    contract: "Contrato B",
    qty: 7,
    unit: "un",
    location: "Corredor 02 · E02 · P02",
    brand: "WEG",
    model: "25A",
    supplier: "Distribuidor técnico",
    oc: "OC-00251",
    nf: "000160",
  },
];
const suppliers = [
  {
    id: "fornecedor-1",
    name: "Obramax",
    areas: "Civil, elétrica e hidráulica",
    contact: "Contato não informado",
  },
  {
    name: "Distribuidor técnico",
    id: "fornecedor-2",
    areas: "Automação e elétrica",
    contact: "Contato não informado",
  },
  {
    name: "Fornecedor civil",
    id: "fornecedor-3",
    areas: "Construção civil",
    contact: "Contato não informado",
  },
];
const initial = demoStorage.load(seed);
const demoSupplierFixtures = structuredClone(suppliers);
const seedContractIds = new Map(
  contracts.map((contract) => [contract.name, contract.id]),
);
const seedSupplierIds = new Map(
  suppliers.map((supplier) => [supplier.name, supplier.id]),
);
let data = initial.materials,
  updated = initial.updated;
let importReports = initial.importReports || [];
const administration = new DemoAdministration(
  currentDemoUser,
  () => data,
  suppliers,
);
let renderAdministration = () => {};
const storageBlocked = () =>
  ["incompatible", "unavailable"].includes(demoStorage.load().state) ||
  ["incompatible", "unavailable"].includes(demoAdminStorage.inspect().state);
function save(action, before = null, after = null) {
  if (action) administration.record(action, "Materiais", before, after);
  updated = new Date().toLocaleString("pt-BR");
  if (!demoStorage.save(data, updated, importReports))
    alert(
      "Armazenamento local indisponível. Alterações mantidas apenas nesta sessão de teste.",
    );
  if (!administration.persist())
    alert(
      "Não foi possível salvar os cadastros administrativos de teste neste navegador.",
    );
  render();
  renderAdministration();
}
function visibleData() {
  return data.filter((row) => canReadMaterial(row.contract));
}
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}
function options(el, arr, all) {
  const val = el.value;
  el.innerHTML =
    (all ? '<option value="">Todos</option>' : "") +
    arr.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if ([...el.options].some((o) => o.value === val)) el.value = val;
}
function filtered() {
  const q = document.getElementById("search").value.toLowerCase().trim(),
    c = document.getElementById("contract").value,
    g = document.getElementById("category").value;
  return visibleData().filter(
    (r) =>
      (!c || r.contract === c) &&
      (!g || r.category === g) &&
      (!q ||
        [r.code, r.name, r.brand, r.model, r.oc, r.nf, r.location].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(q),
        )),
  );
}
function render() {
  options(
    document.getElementById("contract"),
    [...new Set(visibleData().map((r) => r.contract))].sort(),
    true,
  );
  options(
    document.getElementById("category"),
    [...new Set(visibleData().map((r) => r.category))].sort(),
    true,
  );
  const r = filtered();
  document.getElementById("resultsCount").textContent =
    `${r.length} registro${r.length === 1 ? "" : "s"} de saldo nos contratos autorizados`;
  document.getElementById("statProducts").textContent = r.length;
  document.getElementById("statContracts").textContent = new Set(
    r.map((x) => x.contract),
  ).size;
  document.getElementById("statDate").textContent = updated;
  const status = document.getElementById("dataStatus");
  const user = currentDemoUser();
  status.textContent = storageBlocked()
    ? "Dados locais incompatíveis ou armazenamento indisponível. As chaves existentes foram preservadas; gravações bloqueadas. Não limpe o localStorage para resolver."
    : !administration.users.length
      ? "Nenhum usuário cadastrado. Os materiais existentes foram preservados; não há perfil selecionado para consulta."
      : !contracts.length
        ? "Nenhum contrato cadastrado. Dados preservados; cadastre contratos na área administrativa."
        : !data.length
          ? "Nenhum material cadastrado nesta base. O carregamento de dados fictícios exige uma escolha explícita; selecione Proprietário ou Administrador para habilitá-lo."
          : !visibleData().length
            ? `A base contém materiais, mas o perfil selecionado não possui acesso a eles${user?.status === "inativo" ? " porque está inativo" : ""}. Nenhum registro foi apagado.`
            : !r.length
              ? "Nenhum resultado para a pesquisa e os filtros atuais."
              : "Base carregada. A consulta exibe somente os materiais autorizados para o perfil selecionado.";
  const loadDemo = document.getElementById("loadDemo");
  loadDemo.hidden = data.length > 0;
  loadDemo.disabled =
    storageBlocked() ||
    (!canManage(user) &&
      (administration.users.length > 0 || contracts.length > 0));
  document.getElementById("add").disabled =
    storageBlocked() || !canManage(user);
  document.getElementById("reset").disabled =
    storageBlocked() || !canManage(user);
  document.getElementById("rows").innerHTML = r.length
    ? r
        .map(
          (x) =>
            `<tr><td data-label="Código" class="code">${esc(x.code)}</td><td data-label="Material"><span class="material-title">${esc(x.name)}</span><span class="material-meta">${esc(x.category || "Categoria não informada")} · ${esc(x.brand || "Fabricante não informado")}</span></td><td data-label="Contrato">${esc(x.contract)}</td><td data-label="Saldo"><span class="balance">${esc(x.qty)}</span> ${esc(x.unit)}</td><td data-label="Localização">${esc(x.location || "Não informada")}</td><td data-label="Detalhes"><button class="linkbtn" aria-label="Visualizar ${esc(x.name)}" onclick="detail(${x.id})">Visualizar</button></td></tr>`,
        )
        .join("")
    : `<tr><td colspan="6" class="empty"><strong>${!data.length ? "Sua base ainda não tem materiais" : !visibleData().length ? "Nenhum material disponível para este perfil" : "Nenhum material encontrado"}</strong><span>${!data.length ? "Os dados existentes são preservados. Para testar, use o carregamento explícito de dados fictícios." : !visibleData().length ? "Confira o perfil e os contratos autorizados no simulador de demonstração." : "Experimente outro código, descrição ou fabricante, ou limpe os filtros da pesquisa."}</span></td></tr>`;
  document.getElementById("adminRows").innerHTML = (
    canManage(currentDemoUser()) ? data : []
  )
    .map(
      (x) =>
        `<tr><td class="code">${esc(x.code)}</td><td>${esc(x.name)}</td><td>${esc(x.contract)}</td><td>${esc(x.qty)} ${esc(x.unit)}</td><td><button class="btn alt smallbtn" onclick="edit(${x.id})">Editar</button> <button class="btn danger smallbtn" onclick="removeMaterial(${x.id})">Excluir</button></td></tr>`,
    )
    .join("");
  document.getElementById("supplierCards").innerHTML = suppliers
    .filter((s) => visibleData().some((row) => row.supplier === s.name))
    .map(
      (s) =>
        `<div class="card"><h3>${esc(s.name)}</h3><p><b>Atuação:</b> ${esc(s.areas)}</p><p><b>Contato:</b> ${esc(s.contact)}</p></div>`,
    )
    .join("");
}
function showModal(title, body) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = body;
  ui.open();
}
function hideModal() {
  ui.close();
}
window.detail = (id) => {
  const x = data.find((v) => v.id === id);
  if (!x || !canReadMaterial(x.contract)) return;
  const balances = visibleData().filter(
    (material) => codeKey(material.code) === codeKey(x.code),
  );
  showModal(
    x.name,
    `<div class="detail">${[
      ["Código", x.code],
      ["Descrição", x.name],
      ["Categoria", x.category],
      ["Fabricante", x.brand],
      ["Unidade", x.unit],
      ["Modelo / referência", x.model],
      ["Última atualização disponível", updated],
    ]
      .map(
        ([a, b]) =>
          `<div><small>${esc(a)}</small><b>${esc(b || "Não informado")}</b></div>`,
      )
      .join(
        "",
      )}</div><h3 class="section-title">Saldos por contrato</h3><p class="subtle">Somente contratos autorizados para o perfil selecionado.</p><div class="contract-balances">${balances
      .map(
        (balance) =>
          `<article class="contract-card"><header><h4>${esc(balance.contract)}</h4><span class="balance">${esc(balance.qty)} ${esc(balance.unit)}</span></header><dl>${[
            ["Localização", balance.location],
            ["Fornecedor", balance.supplier],
            ["OC de referência", balance.oc],
            ["NF de referência", balance.nf],
          ]
            .map(
              ([label, value]) =>
                `<div><dt>${esc(label)}</dt><dd>${esc(value || "Não informado")}</dd></div>`,
            )
            .join("")}</dl></article>`,
      )
      .join(
        "",
      )}</div><p class="subtle">Saldo registrado na base local; não representa consulta em tempo real.</p>`,
  );
};
const fields = [
  ["code", "Código"],
  ["name", "Descrição do material"],
  ["category", "Categoria"],
  ["contract", "Contrato"],
  ["qty", "Quantidade"],
  ["unit", "Unidade"],
  ["location", "Localização"],
  ["brand", "Fabricante"],
  ["model", "Modelo"],
  ["supplier", "Fornecedor"],
  ["oc", "OC"],
  ["nf", "NF"],
];
window.edit = (id) => {
  if (storageBlocked() || !canManage(currentDemoUser())) return;
  const x = data.find((r) => r.id === id) || {
    id: 0,
    code: "",
    name: "",
    category: "",
    contract: contracts[0]?.name ?? "",
    qty: 0,
    unit: "un",
    location: "",
    brand: "",
    model: "",
    supplier: "",
    oc: "",
    nf: "",
  };
  showModal(
    x.id ? "Editar material" : "Cadastrar material",
    `<form id="editForm"><div class="formgrid">${fields.map(([key, label]) => `<div class="${key === "name" ? "wide" : ""}"><label class="label" for="material-${key}">${label}</label><input id="material-${key}" name="${key}" ${["code", "name", "contract", "qty"].includes(key) ? "required" : ""} ${key === "qty" ? 'type="number" min="0" step="any"' : ""} value="${esc(x[key])}"></div>`).join("")}</div><p><button class="btn" type="submit">Salvar cadastro</button></p></form>`,
  );
  const contractInput = document.querySelector('#editForm [name="contract"]');
  const contractSelect = document.createElement("select");
  contractSelect.id = contractInput.id;
  contractSelect.name = "contract";
  contractSelect.required = true;
  contracts.forEach((contract) =>
    contractSelect.add(new Option(contract.name, contract.name)),
  );
  contractSelect.value = x.contract;
  contractInput.replaceWith(contractSelect);
  document.getElementById("editForm").onsubmit = (e) => {
    e.preventDefault();
    if (storageBlocked() || !canManage(currentDemoUser())) return;
    const fd = new FormData(e.target),
      v = Object.fromEntries(fd.entries());
    v.qty = Number(v.qty);
    if (!contracts.some((contract) => contract.name === v.contract)) {
      alert("Informe um contrato cadastrado.");
      return;
    }
    if (!Number.isFinite(v.qty) || v.qty < 0) {
      alert("Quantidade inválida");
      return;
    }
    v.id = x.id || Math.max(0, ...data.map((z) => z.id)) + 1;
    const duplicate = data.find(
      (z) =>
        z.id !== v.id &&
        z.code.trim().toLowerCase() === v.code.trim().toLowerCase() &&
        z.contract.trim().toLowerCase() === v.contract.trim().toLowerCase(),
    );
    if (duplicate) {
      alert(
        "Já existe esse código neste contrato. Edite o registro existente.",
      );
      return;
    }
    const before = x.id ? structuredClone(x) : null;
    data
      .filter((item) => codeKey(item.code) === codeKey(v.code))
      .forEach((item) =>
        globalFields.forEach((field) => (item[field] = v[field])),
      );
    if (x.id) data = data.map((z) => (z.id === x.id ? v : z));
    else data.push(v);
    save(x.id ? "Material editado" : "Material cadastrado", before, v);
    hideModal();
  };
};
window.removeMaterial = (id) => {
  if (storageBlocked() || !hasPermission(currentDemoUser(), "delete_materials"))
    return;
  const material = data.find((item) => item.id === id);
  if (!material || !confirm(`Excluir o material fictício ${material.code}?`))
    return;
  data = data.filter((item) => item.id !== id);
  save("Material excluído", material);
};
document.querySelectorAll("[data-page]").forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll("[data-page]")
        .forEach((n) => n.classList.remove("active"));
      b.classList.add("active");
      const p = b.dataset.page;
      ["consulta", "fornecedores", "admin"].forEach((s) =>
        document.getElementById(s).classList.toggle("hidden", s !== p),
      );
      document.getElementById("heading").textContent = {
        consulta: "Consulta de materiais",
        fornecedores: "Fornecedores",
        admin: "Área administrativa",
      }[p];
      document.getElementById("subtitle").textContent = {
        consulta: "Encontre materiais, saldos e localizações por contrato.",
        fornecedores: "Referências de fornecedores cadastrados.",
        admin: "Gerencie os dados demonstrativos do terminal.",
      }[p];
    }),
);
["search", "contract", "category"].forEach((id) =>
  document
    .getElementById(id)
    .addEventListener(id === "search" ? "input" : "change", render),
);
document.getElementById("close").onclick = hideModal;
document.getElementById("modal").onclick = (e) => {
  if (e.target.id === "modal") hideModal();
};
document.getElementById("add").onclick = () => window.edit(0);
document.getElementById("reset").onclick = () => {
  if (storageBlocked() || !canManage(currentDemoUser())) return;
  if (confirm("Restaurar todos os registros fictícios neste navegador?")) {
    const before = structuredClone(data);
    data = structuredClone(seed).flatMap((material) => {
      const contract = contracts.find(
        (contract) => contract.id === seedContractIds.get(material.contract),
      );
      if (!contract) return [];
      return [
        {
          ...material,
          contract: contract.name,
          supplier:
            suppliers.find(
              (supplier) =>
                supplier.id === seedSupplierIds.get(material.supplier),
            )?.name ?? "",
        },
      ];
    });
    save("Materiais restaurados", before, data);
  }
};
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll("[data-tab]")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      document.getElementById("adminFormHost").replaceChildren();
      document
        .querySelectorAll("[data-admin-panel]")
        .forEach((panel) =>
          panel.classList.toggle("hidden", panel.id !== b.dataset.tab),
        );
    }),
);
function csvEscape(v) {
  const s = String(v ?? "");
  return '"' + s.replaceAll('"', '""') + '"';
}
document.getElementById("exportConsult").onclick = () => {
  const headers = [
    "Código",
    "Material",
    "Categoria",
    "Contrato",
    "Quantidade",
    "Unidade",
    "Localização",
    "Marca",
    "Modelo",
    "Fornecedor",
    "OC",
    "NF",
  ];
  const lines = [
    headers,
    ...filtered().map((x) => [
      x.code,
      x.name,
      x.category,
      x.contract,
      x.qty,
      x.unit,
      x.location,
      x.brand,
      x.model,
      x.supplier,
      x.oc,
      x.nf,
    ]),
  ];
  const blob = new Blob(
    ["\ufeff" + lines.map((r) => r.map(csvEscape).join(";")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "jp-estoque-consulta.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
document.getElementById("loadDemo").onclick = () => {
  if (data.length || storageBlocked()) return;
  if (
    !canManage(currentDemoUser()) &&
    (administration.users.length || contracts.length)
  )
    return;
  if (
    !confirm(
      "Carregar dados fictícios somente na base de materiais vazia? Cadastros existentes não serão substituídos.",
    )
  )
    return;
  const previous = {
    users: structuredClone(administration.users),
    contracts: structuredClone(contracts),
    suppliers: structuredClone(suppliers),
  };
  const rollback = () => {
    administration.users.splice(
      0,
      administration.users.length,
      ...previous.users,
    );
    contracts.splice(0, contracts.length, ...previous.contracts);
    suppliers.splice(0, suppliers.length, ...previous.suppliers);
  };
  if (!administration.users.length && !contracts.length)
    administration.users.push(...structuredClone(demoUserFixtures));
  if (!contracts.length)
    contracts.push(...structuredClone(demoContractFixtures));
  if (!suppliers.length)
    suppliers.push(...structuredClone(demoSupplierFixtures));
  const materials = structuredClone(seed).flatMap((material) => {
    const contract = contracts.find(
      (contract) => contract.id === seedContractIds.get(material.contract),
    );
    return contract ? [{ ...material, contract: contract.name }] : [];
  });
  const date = new Date().toLocaleString("pt-BR");
  if (!materials.length || !demoStorage.save(materials, date, importReports)) {
    rollback();
    document.getElementById("dataStatus").textContent =
      "Não foi possível carregar os dados fictícios: armazenamento indisponível ou contratos personalizados sem correspondência. Nada foi substituído.";
    return;
  }
  data = materials;
  updated = date;
  if (!administration.persist())
    alert(
      "Materiais de teste salvos, mas não foi possível persistir os cadastros administrativos.",
    );
  refreshDemoAccess();
};
renderAdministration = mountAdministration(
  administration,
  currentDemoUser,
  () => {
    save();
    refreshDemoAccess();
  },
);
const importer = mountImport({
  currentUser: currentDemoUser,
  getContext: () => ({ materials: data, contracts }),
  getReports: () => importReports,
  apply: (materials, report) => {
    const nextReports = [...importReports, report];
    const timestamp = new Date().toLocaleString("pt-BR");
    if (!demoStorage.save(materials, timestamp, nextReports)) return false;
    const before = data;
    data = materials;
    updated = timestamp;
    importReports = nextReports;
    administration.record(
      "Importacao de planilha",
      report.fileName,
      { materials: before },
      { report, materials },
    );
    if (!administration.persist())
      alert(
        "Falha ao salvar o historico administrativo. O relatorio da importacao foi preservado.",
      );
    render();
    renderAdministration();
    return true;
  },
});
mountDemoAccess(() => {
  hideModal();
  importer.reset();
  document.getElementById("file").value = "";
  document.getElementById("mapping").classList.add("hidden");
  document.getElementById("previewArea").classList.add("hidden");
  render();
  renderAdministration();
  document.querySelector(".brand b").textContent =
    administration.settings.systemName;
});
