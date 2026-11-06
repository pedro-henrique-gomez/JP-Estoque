import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("demo treats stored HTML as text and neutralizes CSV formulas without rewriting data", async ({
  page,
  context,
}) => {
  const marker = '<img src=x onerror="window.__jpXss=1">';
  const material = {
    id: 71,
    code: "=1+1",
    name: marker,
    unit: "un",
    contract: "Ficticio",
    qty: 1.250001,
    category: "Teste",
    brand: "Ficticio",
    model: "",
    location: "A",
    supplier: "",
    oc: "",
    nf: "",
  };
  const stock = JSON.stringify({
      version: 3,
      materials: [material],
      updated: "Ficticio",
      importReports: [],
    }),
    admin = JSON.stringify({
      users: [
        {
          id: "ficticio",
          name: "Ficticio",
          email: "ficticio@example.invalid",
          role: "proprietario",
          status: "ativo",
          authorizedContractIds: [],
        },
      ],
      contracts: [{ id: "ficticio", name: "Ficticio" }],
      suppliers: [],
      settings: {
        systemName: "JP Estoque",
        supportEmail: "ficticio@example.invalid",
      },
      history: [],
    });
  await context.addInitScript(
    ({ stock, admin }) => {
      localStorage.setItem("jp_estoque_demo_v02", stock);
      localStorage.setItem("jp_estoque_admin_demo_v02", admin);
    },
    { stock, admin },
  );
  await page.goto("/code/html/index.html");
  await expect(page.locator("#rows")).toContainText(marker);
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  await page.locator("#rows button").click();
  await expect(page.locator("#modalBody")).toContainText(marker);
  expect(await page.evaluate(() => window.__jpXss)).toBeUndefined();
  await page.locator("#close").click();
  const download = page.waitForEvent("download");
  await page.locator("#exportConsult").click();
  const file = await download;
  expect(await readFile(await file.path(), "utf8")).toContain('"\'=1+1"');
  expect(
    await page.evaluate(() => localStorage.getItem("jp_estoque_demo_v02")),
  ).toBe(stock);
});
test("local server and preview suppress referrer and browser embedding", async ({
  request,
}) => {
  const r = await request.get("/code/html/index.html");
  expect(r.headers()["referrer-policy"]).toBe("no-referrer");
  expect(r.headers()["x-content-type-options"]).toBe("nosniff");
  expect(r.headers()["x-frame-options"]).toBe("DENY");
  expect(r.headers()["permissions-policy"]).toContain("camera=()");
});
