import { test, expect } from "@playwright/test";

const stockKey = "jp_estoque_demo_v02",
  adminKey = "jp_estoque_admin_demo_v02";
const path = "/code/html/index.html";
const material = {
  id: 42,
  code: "SALVO-042",
  name: "Material preservado",
  unit: "un",
  contract: "Obra personalizada",
  qty: 17,
  category: "Elétrica",
  brand: "Teste",
  model: "Modelo",
  location: "E01",
  supplier: "Fornecedor teste",
  oc: "Referência",
  nf: "123",
};
const admin = {
  users: [
    {
      id: "usuario-existente",
      name: "Usuário salvo",
      email: "salvo@example.invalid",
      role: "proprietario",
      status: "ativo",
      authorizedContractIds: [],
    },
  ],
  contracts: [{ id: "contrato-existente", name: "Obra personalizada" }],
  suppliers: [],
  settings: {
    systemName: "JP Estoque",
    supportEmail: "suporte@example.invalid",
  },
  history: [],
};
async function seed(context, values) {
  await context.addInitScript((values) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    Object.entries(values).forEach(([key, value]) =>
      localStorage.setItem(key, value),
    );
    sessionStorage.setItem("e2e-seeded", "yes");
  }, values);
}
test.beforeEach(async ({ page }) => {
  page.__errors = [];
  page.on("pageerror", (error) => page.__errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") page.__errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(page.__errors).toEqual([]);
});
async function selectUser(page, id) {
  const simulator = page.locator("#demoSimulator");
  if (!(await simulator.evaluate((element) => element.open)))
    await simulator.locator(":scope > summary").click();
  await page.locator("#demoUser").selectOption(id);
}
async function loadDemo(page) {
  await page.goto(path);
  await selectUser(page, "demo-7");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#loadDemo").click();
  await expect(page.locator("#statProducts")).toHaveText("7");
}

test("armazenamento vazio: usuários disponíveis, base vazia explícita e nenhum salvamento automático", async ({
  page,
}) => {
  await page.goto(path);
  await expect(page.locator("#demoUser option")).toHaveCount(9);
  await expect(page.locator("#demoUser")).toHaveValue("demo-1");
  await expect(page.locator("#dataStatus")).toContainText(
    "Nenhum material cadastrado",
  );
  await expect(page.locator("#statDate")).toHaveText(
    "Sem atualização registrada",
  );
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  await expect(page.locator("#loadDemo")).toBeVisible();
});
test("carregamento explícito não duplica fixtures; perfil, filtros e pesquisa funcionam", async ({
  page,
}) => {
  await loadDemo(page);
  await expect(page.locator("#loadDemo")).toBeHidden();
  await selectUser(page, "demo-1");
  await expect(page.locator("#statProducts")).toHaveText("2");
  await expect(page.locator("#contract option")).toHaveCount(2);
  await page.locator("#search").fill("sensor");
  await expect(page.locator("#statProducts")).toHaveText("1");
  await page.locator("#search").fill("");
  await selectUser(page, "demo-5");
  await page.locator("#contract").selectOption("Contrato B");
  await expect(page.locator("#statProducts")).toHaveText("2");
  await page.locator("#category").selectOption("Elétrica");
  await expect(page.locator("#statProducts")).toHaveText("1");
  await page.locator("#search").fill("inexistente");
  await expect(page.locator("#dataStatus")).toContainText("Nenhum resultado");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).materials.length,
      stockKey,
    ),
  ).toBe(7);
});
test("perfil inativo oculta registros sem apagá-los", async ({ page }) => {
  await loadDemo(page);
  const original = await page.evaluate(
    (key) => localStorage.getItem(key),
    stockKey,
  );
  await selectUser(page, "demo-inativo");
  await expect(page.locator("#statProducts")).toHaveText("0");
  await expect(page.locator("#dataStatus")).toContainText("inativo");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), stockKey),
  ).toBe(original);
});
test("IDs personalizados, materiais, contratos e data salvos permanecem intactos após reload", async ({
  page,
  context,
}) => {
  const stock = JSON.stringify({
      version: 3,
      materials: [material],
      updated: "Data preservada",
      importReports: [],
      extra: "campo mantido",
    }),
    settings = JSON.stringify(admin);
  await seed(context, { [stockKey]: stock, [adminKey]: settings });
  await page.goto(path);
  await expect(page.locator("#demoUser")).toHaveValue("usuario-existente");
  await expect(page.locator("#rows")).toContainText("Material preservado");
  await expect(page.locator("#contract option")).toHaveCount(2);
  await expect(page.locator("#statDate")).toHaveText("Data preservada");
  await page.reload();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), stockKey),
  ).toBe(stock);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), adminKey),
  ).toBe(settings);
  await expect(page.locator("#rows")).toContainText("Material preservado");
});
test("base legada sem data não some nem é regravada automaticamente", async ({
  page,
  context,
}) => {
  const legacy = JSON.stringify([material]);
  await seed(context, {
    jp_estoque_demo_v01: legacy,
    [adminKey]: JSON.stringify(admin),
  });
  await page.goto(path);
  await expect(page.locator("#rows")).toContainText("Material preservado");
  await expect(page.locator("#statDate")).toHaveText(
    "Data não informada na base salva",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("jp_estoque_demo_v01")),
  ).toBe(legacy);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), stockKey),
  ).toBe(null);
});
test("regressão: snapshot sem updated e IDs personalizados não oculta dados existentes", async ({
  page,
  context,
}) => {
  const original = JSON.stringify({ materials: [material] });
  await seed(context, {
    [stockKey]: original,
    [adminKey]: JSON.stringify(admin),
  });
  await page.goto(path);
  await expect(page.locator("#demoUser")).toHaveValue("usuario-existente");
  await expect(page.locator("#statProducts")).toHaveText("1");
  await expect(page.locator("#statContracts")).toHaveText("1");
  await expect(page.locator("#statDate")).toHaveText(
    "Data não informada na base salva",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), stockKey),
  ).toBe(original);
});
test("sem usuários com materiais existentes: sinaliza falta de seleção sem apagar material", async ({
  page,
  context,
}) => {
  const original = JSON.stringify({
    materials: [material],
    updated: "Data salva",
  });
  await seed(context, {
    [stockKey]: original,
    [adminKey]: JSON.stringify({ ...admin, users: [] }),
  });
  await page.goto(path);
  await expect(page.locator("#demoUser")).toBeDisabled();
  await expect(page.locator("#dataStatus")).toContainText("Nenhum usuário");
  await expect(page.locator("#loadDemo")).toBeHidden();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), stockKey),
  ).toBe(original);
});
test("sem contratos: informa a causa em vez de tratar a pesquisa como base apagada", async ({
  page,
  context,
}) => {
  const original = JSON.stringify({ ...admin, contracts: [] });
  await seed(context, {
    [adminKey]: original,
    [stockKey]: JSON.stringify({ materials: [], updated: "Base vazia" }),
  });
  await page.goto(path);
  await expect(page.locator("#dataStatus")).toContainText("Nenhum contrato");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), adminKey),
  ).toBe(original);
});
test("administração incompatível não inventa usuários nem sobrescreve dados", async ({
  page,
  context,
}) => {
  const incompatible = JSON.stringify({ users: "versão desconhecida" });
  await seed(context, {
    [adminKey]: incompatible,
    [stockKey]: JSON.stringify({
      materials: [material],
      updated: "Base existente",
    }),
  });
  await page.goto(path);
  await expect(page.locator("#dataStatus")).toContainText("incompatíveis");
  await expect(page.locator("#demoUser")).toBeDisabled();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), adminKey),
  ).toBe(incompatible);
});
test("JSON incompatível preservado, aviso explícito e carga de demonstração bloqueada", async ({
  page,
  context,
}) => {
  const incompatible = '{"materials": [conteudo invalido';
  await seed(context, { [stockKey]: incompatible });
  await page.goto(path);
  await expect(page.locator("#dataStatus")).toContainText("incompatíveis");
  await selectUser(page, "demo-7");
  await expect(page.locator("#loadDemo")).toBeDisabled();
  await page.reload();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), stockKey),
  ).toBe(incompatible);
});
test("versão futura não é sobrescrita", async ({ page, context }) => {
  const future = JSON.stringify({
    version: 99,
    materials: [material],
    updated: "Futuro",
  });
  await seed(context, { [stockKey]: future });
  await page.goto(path);
  await expect(page.locator("#dataStatus")).toContainText("incompatíveis");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), stockKey),
  ).toBe(future);
});
test("sem usuários e contratos: mensagem clara, sem exceção e sem fixtures automáticas", async ({
  page,
  context,
}) => {
  const empty = JSON.stringify({ ...admin, users: [], contracts: [] });
  await seed(context, {
    [adminKey]: empty,
    [stockKey]: JSON.stringify({ materials: [], updated: "Base vazia" }),
  });
  await page.goto(path);
  await expect(page.locator("#demoUser")).toBeDisabled();
  await expect(page.locator("#demoSummary")).toContainText("Nenhum usuário");
  await expect(page.locator("#dataStatus")).toContainText("Nenhum usuário");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), adminKey),
  ).toBe(empty);
  await expect(page.locator("#loadDemo")).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#loadDemo").click();
  await expect(page.locator("#demoUser option")).toHaveCount(9);
  await expect(page.locator("#statProducts")).toHaveText("2");
});
test("cadastro administrativo persiste após atualização da página", async ({
  page,
}) => {
  await loadDemo(page);
  await page.locator('[data-page="admin"]').click();
  await expect(page.locator("#adminArea")).toBeVisible();
  await page.locator("#add").click();
  await page.locator('#editForm [name="code"]').fill("NOVO-123");
  await page
    .locator('#editForm [name="name"]')
    .fill("Material criado no navegador");
  await page.locator('#editForm [name="qty"]').fill("9");
  await page.locator('#editForm [name="unit"]').fill("un");
  await page.locator('#editForm button[type="submit"]').click();
  await page.reload();
  await page.locator("#search").fill("NOVO-123");
  await expect(page.locator("#rows")).toContainText(
    "Material criado no navegador",
  );
  await selectUser(page, "demo-6");
  await page.locator('[data-page="admin"]').click();
  await page.locator('[data-tab="users"]').click();
  await expect(page.locator("#users")).toContainText("Ana Souza");
  await selectUser(page, "demo-5");
  await expect(page.locator("#adminArea")).toBeHidden();
});
