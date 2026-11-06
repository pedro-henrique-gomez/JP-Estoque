import { test, expect } from "@playwright/test";

const stockKey = "jp_estoque_demo_v02";
const product = {
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
  supplier: "Fornecedor fictício",
  oc: "OC-REF",
  nf: "000154",
};
const snapshot = JSON.stringify({
  version: 3,
  materials: [product, { ...product, id: 2, contract: "Contrato C", qty: 14 }],
  updated: "05/11/2026, 15:00:00",
  importReports: [],
});
test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(
    ({ key, value }) => {
      if (!sessionStorage.getItem("ui-seeded")) {
        localStorage.setItem(key, value);
        sessionStorage.setItem("ui-seeded", "1");
      }
    },
    { key: stockKey, value: snapshot },
  );
  page.__errors = [];
  page.on("pageerror", (error) => page.__errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") page.__errors.push(message.text());
  });
  await page.goto("/code/html/index.html");
  await expect(page.locator("#statProducts")).toHaveText("1");
});
test.afterEach(async ({ page }) => expect(page.__errors).toEqual([]));
async function selectUser(page, id) {
  await page.locator("#demoSimulator > summary").click();
  await page.locator("#demoUser").selectOption(id);
}

test("pesquisa em destaque, simulador recolhido e layout sem transbordamento", async ({
  page,
}, info) => {
  await expect(page.locator("#demoSimulator")).not.toHaveAttribute("open");
  const search = await page.locator(".search-panel").boundingBox(),
    results = await page.locator(".results-panel").boundingBox();
  expect(search.y).toBeLessThan(results.y);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await expect(page.locator(".brand img")).toBeVisible();
  expect(
    await page
      .locator(".brand img")
      .evaluate((image) => image.complete && image.naturalWidth > 0),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/v04-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate((key) => localStorage.getItem(key), stockKey),
  ).toBe(snapshot);
});
test("simulador abre por teclado, altera perfil e recolhe sem perder seleção", async ({
  page,
}) => {
  await page.locator("#demoSimulator > summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#demoUser")).toBeVisible();
  await page.locator("#demoUser").selectOption("demo-6");
  await expect(page.locator("#statProducts")).toHaveText("2");
  await page.locator("#demoSimulator > summary").click();
  await expect(page.locator("#demoUser")).toBeHidden();
  await expect(page.locator("#demoActiveProfile")).toHaveText("Proprietário");
  await expect(page.locator("#statProducts")).toHaveText("2");
});
test("atalho de pesquisa, mensagem sem resultados e limpeza dos filtros", async ({
  page,
}) => {
  await page.keyboard.press("/");
  await expect(page.locator("#search")).toBeFocused();
  await page.locator("#search").fill("não existe");
  await expect(page.locator("#rows")).toContainText(
    "Nenhum material encontrado",
  );
  await page.locator("#clearFilters").click();
  await expect(page.locator("#search")).toHaveValue("");
  await expect(page.locator("#search")).toBeFocused();
  await expect(page.locator("#statProducts")).toHaveText("1");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), stockKey),
  ).toBe(snapshot);
});
test("detalhes acessíveis respeitam contratos, Escape e retorno do foco", async ({
  page,
}) => {
  const trigger = page.locator("#rows button").first();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Schneider");
  await expect(dialog).toContainText("05/11/2026, 15:00:00");
  await expect(dialog.locator(".contract-card")).toHaveCount(1);
  await expect(dialog.locator(".contract-card")).toContainText("Contrato A");
  await expect(page.locator("#close")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#close")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await selectUser(page, "demo-6");
  await page.locator("#rows button").first().click();
  await expect(dialog.locator(".contract-card")).toHaveCount(2);
  await expect(dialog).toContainText("Contrato C");
});
test("abas administrativas funcionam com setas, Home e End", async ({
  page,
}) => {
  await selectUser(page, "demo-7");
  await page.locator('[data-page="admin"]').click();
  const materials = page.getByRole("tab", { name: "Materiais", exact: true });
  await materials.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Importar Excel/CSV" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#import")).toBeVisible();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "Configurações", exact: true }),
  ).toBeFocused();
  await expect(page.locator("#settings")).toBeVisible();
  await page.keyboard.press("Home");
  await expect(materials).toBeFocused();
  await expect(page.locator("#records")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});
