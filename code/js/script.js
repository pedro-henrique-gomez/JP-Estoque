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
    name: "Obramax",
    areas: "Civil, elétrica e hidráulica",
    contact: "Contato não informado",
  },
  {
    name: "Distribuidor técnico",
    areas: "Automação e elétrica",
    contact: "Contato não informado",
  },
  {
    name: "Fornecedor civil",
    areas: "Construção civil",
    contact: "Contato não informado",
  },
];
const K = "jp_estoque_demo_v01",
  T = "jp_estoque_updated_v01";
let data = load(),
  updated = localStorage.getItem(T) || "Dados demonstrativos",
  adminUnlocked = false,
  sourceRows = [],
  sourceHeaders = [],
  staged = [];
function load() {
  try {
    const x = JSON.parse(localStorage.getItem(K));
    return Array.isArray(x) ? x : structuredClone(seed);
  } catch {
    return structuredClone(seed);
  }
}
function save() {
  localStorage.setItem(K, JSON.stringify(data));
  updated = new Date().toLocaleString("pt-BR");
  localStorage.setItem(T, updated);
  render();
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
  return data.filter(
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
    [...new Set(data.map((r) => r.contract))].sort(),
    true,
  );
  options(
    document.getElementById("category"),
    [...new Set(data.map((r) => r.category))].sort(),
    true,
  );
  const r = filtered();
  document.getElementById("statProducts").textContent = r.length;
  document.getElementById("statContracts").textContent = new Set(
    r.map((x) => x.contract),
  ).size;
  document.getElementById("statDate").textContent = updated;
  document.getElementById("rows").innerHTML = r.length
    ? r
        .map(
          (x) =>
            `<tr><td class="code">${esc(x.code)}</td><td><b>${esc(x.name)}</b><br><span class="muted">${esc(x.category)}</span></td><td>${esc(x.contract)}</td><td><b>${esc(x.qty)}</b> ${esc(x.unit)}</td><td>${esc(x.location)}</td><td><button class="linkbtn" onclick="detail(${x.id})">Visualizar</button></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="6" class="empty">Nenhum material encontrado.</td></tr>';
  document.getElementById("adminRows").innerHTML = data
    .map(
      (x) =>
        `<tr><td class="code">${esc(x.code)}</td><td>${esc(x.name)}</td><td>${esc(x.contract)}</td><td>${esc(x.qty)} ${esc(x.unit)}</td><td><button class="btn alt smallbtn" onclick="edit(${x.id})">Editar</button></td></tr>`,
    )
    .join("");
  document.getElementById("supplierCards").innerHTML = suppliers
    .map(
      (s) =>
        `<div class="card"><h3>${esc(s.name)}</h3><p><b>Atuação:</b> ${esc(s.areas)}</p><p><b>Contato:</b> ${esc(s.contact)}</p></div>`,
    )
    .join("");
}
function showModal(title, body) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = body;
  document.getElementById("modal").classList.remove("hidden");
}
function hideModal() {
  document.getElementById("modal").classList.add("hidden");
}
window.detail = (id) => {
  const x = data.find((v) => v.id === id);
  if (!x) return;
  showModal(
    x.name,
    `<div class="detail">${[
      ["Código", x.code],
      ["Categoria", x.category],
      ["Contrato", x.contract],
      ["Saldo registrado", x.qty + " " + x.unit],
      ["Localização", x.location],
      ["Fabricante", x.brand],
      ["Modelo / referência", x.model],
      ["Fornecedor", x.supplier],
      ["OC de referência", x.oc],
      ["NF de referência", x.nf],
      ["Atualização da base", updated],
    ]
      .map(
        ([a, b]) =>
          `<div><small>${esc(a)}</small><b>${esc(b || "Não informado")}</b></div>`,
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
  if (!adminUnlocked) return;
  const x = data.find((r) => r.id === id) || {
    id: 0,
    code: "",
    name: "",
    category: "",
    contract: "Contrato A",
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
    `<form id="editForm"><div class="formgrid">${fields.map(([key, label]) => `<div class="${key === "name" ? "wide" : ""}"><label class="label">${label}</label><input name="${key}" ${["code", "name", "contract", "qty"].includes(key) ? "required" : ""} ${key === "qty" ? 'type="number" min="0" step="any"' : ""} value="${esc(x[key])}"></div>`).join("")}</div><p><button class="btn" type="submit">Salvar cadastro</button></p></form>`,
  );
  document.getElementById("editForm").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      v = Object.fromEntries(fd.entries());
    v.qty = Number(v.qty);
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
    if (x.id) data = data.map((z) => (z.id === x.id ? v : z));
    else data.push(v);
    save();
    hideModal();
  };
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
        consulta: "Terminal de consulta",
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
document.getElementById("unlock").onclick = () => {
  if (document.getElementById("adminCode").value !== "JP2026") {
    alert("Código incorreto");
    return;
  }
  adminUnlocked = true;
  document.getElementById("adminLock").classList.add("hidden");
  document.getElementById("adminArea").classList.remove("hidden");
};
document.getElementById("add").onclick = () => edit(0);
document.getElementById("reset").onclick = () => {
  if (confirm("Restaurar todos os registros fictícios neste navegador?")) {
    data = structuredClone(seed);
    save();
  }
};
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll("[data-tab]")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      ["records", "import"].forEach((x) =>
        document
          .getElementById(x)
          .classList.toggle("hidden", x !== b.dataset.tab),
      );
    }),
);
function csvRows(text) {
  const out = [];
  let row = [],
    cur = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (ch === "," || ch === ";" || ch === "\t")) {
      row.push(cur);
      cur = "";
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      if (row.some((x) => x.trim())) out.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) out.push(row);
  return out;
}
function detectDelimiter(text) {
  const l = text.split(/\r?\n/)[0] || "";
  return [";", ",", "\t"].sort(
    (a, b) => l.split(b).length - l.split(a).length,
  )[0];
}
function parseCsv(text) {
  const d = detectDelimiter(text);
  const rows = csvRows(text);
  if (d !== ",")
    return rows.map((r) => {
      if (r.length === 1) {
        return csvRows(r[0].replaceAll(d, ","))[0];
      }
      return r;
    });
  return rows;
}
function parseCSVStrict(text) {
  const delim = detectDelimiter(text),
    out = [];
  let row = [],
    cur = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && ch === delim) {
      row.push(cur);
      cur = "";
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      if (row.some((v) => v.trim())) out.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((v) => v.trim())) out.push(row);
  return out;
}
const aliases = {
  code: ["codigo", "código", "cod", "sku"],
  name: ["material", "produto", "descrição", "descricao", "nome"],
  category: ["categoria", "grupo"],
  contract: ["contrato", "obra", "centro de custo"],
  qty: ["quantidade", "qtd", "saldo", "estoque"],
  unit: ["unidade", "und", "un"],
  location: ["localização", "localizacao", "posição", "posicao", "endereco"],
  brand: ["marca", "fabricante"],
  model: ["modelo", "referencia", "referência"],
  supplier: ["fornecedor", "distribuidor"],
  oc: ["oc", "ordem de compra"],
  nf: ["nf", "nota fiscal"],
};
document.getElementById("file").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  document.getElementById("previewArea").classList.add("hidden");
  document.getElementById("importMessage").textContent = "";
  try {
    let matrix;
    if (/\.csv$/i.test(f.name)) matrix = parseCSVStrict(await f.text());
    else {
      if (!window.XLSX) await loadSheetJS();
      const workbook = XLSX.read(await f.arrayBuffer(), {
        type: "array",
      });
      matrix = XLSX.utils.sheet_to_json(
        workbook.Sheets[workbook.SheetNames[0]],
        { header: 1, defval: "" },
      );
    }
    if (matrix.length < 2) throw Error("Arquivo sem registros suficientes");
    sourceHeaders = matrix[0].map((x) => String(x).trim());
    sourceRows = matrix.slice(1).filter((r) => r.some((v) => String(v).trim()));
    document.getElementById("mapFields").innerHTML = fields
      .map(([k, label]) => {
        const match = sourceHeaders.findIndex((h) =>
          (aliases[k] || []).some((a) =>
            h
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .includes(a.normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
          ),
        );
        return `<div><label class="label">${label}</label><select data-map="${k}"><option value="">Não importar</option>${sourceHeaders.map((h, i) => `<option value="${i}" ${i === match ? "selected" : ""}>${esc(h)}</option>`).join("")}</select></div>`;
      })
      .join("");
    document.getElementById("mapping").classList.remove("hidden");
  } catch (err) {
    document.getElementById("importMessage").textContent =
      "Erro: " + err.message;
  }
};
function loadSheetJS() {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload = resolve;
    s.onerror = () =>
      reject(
        Error(
          "Não foi possível carregar o leitor Excel. Conecte-se à internet ou exporte como CSV.",
        ),
      );
    document.head.appendChild(s);
  });
}
document.getElementById("preview").onclick = () => {
  const m = {};
  document.querySelectorAll("[data-map]").forEach((s) => {
    if (s.value !== "") m[s.dataset.map] = Number(s.value);
  });
  if (
    m.code === undefined ||
    m.name === undefined ||
    m.contract === undefined ||
    m.qty === undefined
  ) {
    alert("Associe Código, Material, Contrato e Quantidade.");
    return;
  }
  staged = sourceRows.map((r, i) => {
    const x = {};
    fields.forEach(
      ([k]) => (x[k] = m[k] === undefined ? "" : String(r[m[k]] ?? "").trim()),
    );
    x.qty = Number(String(x.qty).replace(",", "."));
    x.id = 0;
    x._line = i + 2;
    x._error =
      !x.code || !x.name || !x.contract || !Number.isFinite(x.qty) || x.qty < 0;
    x._existing = data.find(
      (y) =>
        y.code.toLowerCase() === x.code.toLowerCase() &&
        y.contract.toLowerCase() === x.contract.toLowerCase(),
    );
    return x;
  });
  const invalid = staged.filter((x) => x._error).length,
    dups = staged.filter((x) => x._existing).length;
  document.getElementById("previewInfo").textContent =
    `${staged.length} linhas analisadas · ${invalid} inválidas · ${dups} registros já existentes (serão atualizados) · ${staged.length - invalid - dups} possíveis novos registros. Revise antes de confirmar.`;
  document.getElementById("previewRows").innerHTML = staged
    .slice(0, 100)
    .map(
      (x) =>
        `<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td><td>${esc(x.contract)}</td><td>${esc(x.qty)}</td><td>${x._error ? "Inválido" : x._existing ? "Atualizar" : "Novo"}</td></tr>`,
    )
    .join("");
  document.getElementById("previewArea").classList.remove("hidden");
  document.getElementById("commit").disabled = !!invalid;
};
document.getElementById("commit").onclick = () => {
  if (staged.some((x) => x._error)) {
    alert("Corrija as linhas inválidas antes de importar.");
    return;
  }
  const keys = new Set();
  if (
    staged.some((x) => {
      const k = x.code.toLowerCase() + "|" + x.contract.toLowerCase();
      if (keys.has(k)) return true;
      keys.add(k);
      return false;
    })
  ) {
    alert(
      "Há códigos duplicados para o mesmo contrato no arquivo. Corrija antes de importar.",
    );
    return;
  }
  if (
    !confirm(
      `Confirmar importação de ${staged.length} registros? Saldos existentes poderão ser substituídos.`,
    )
  )
    return;
  staged.forEach((x) => {
    const { id, _line, _error, _existing, ...v } = x;
    if (_existing) {
      Object.assign(
        _existing,
        Object.fromEntries(
          Object.entries(v).filter(([k, val]) => val !== "" || k === "qty"),
        ),
      );
    } else data.push({ ...v, id: Math.max(0, ...data.map((z) => z.id)) + 1 });
  });
  save();
  document.getElementById("previewArea").classList.add("hidden");
  document.getElementById("mapping").classList.add("hidden");
  document.getElementById("file").value = "";
  document.getElementById("importMessage").innerHTML =
    '<div class="success">Importação concluída neste navegador. Consulte os registros no terminal.</div>';
};
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
render();
