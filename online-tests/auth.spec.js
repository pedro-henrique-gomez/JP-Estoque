import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { localOnlyEnvironment } from "../integration-tests/preflight.mjs";
const fixture = JSON.parse(process.env.JP_ONLINE_FIXTURE || "{}"),
  path = "/code/html/index.html";
async function login(page, role = "reader") {
  await page.goto(path);
  await expect(page.locator("#onlineLogin")).toBeVisible();
  await page
    .getByLabel("Email", { exact: true })
    .fill(fixture.users[role].email);
  await page
    .getByLabel("Senha", { exact: true })
    .fill(fixture.users[role].password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}
async function database(action) {
  const p = JSON.parse(
    await readFile(".integration-local/current.json", "utf8"),
  );
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      join(process.cwd(), "node_modules/supabase/dist/supabase.js"),
      "status",
      "--workdir",
      p.workspace,
      "--output",
      "json",
    ],
    { windowsHide: true, env: localOnlyEnvironment(process.env, p.workspace) },
  );
  const status = JSON.parse(stdout);
  if (
    new URL(status.DB_URL).hostname !== "127.0.0.1" ||
    new URL(status.DB_URL).port !== "56322"
  )
    throw Error("Nonlocal DB rejected");
  const db = new pg.Client({ connectionString: status.DB_URL });
  await db.connect();
  try {
    return await action(db);
  } finally {
    await db.end();
  }
}
const session = (page) =>
  page.evaluate(() => {
    const raw = sessionStorage.getItem("jp_online_v07_56321");
    return raw ? JSON.parse(raw) : null;
  });

test("protected initial page and wrong login preserve localStorage", async ({
  page,
}) => {
  await page.goto(path);
  await expect(page.locator("#onlineLogin")).toBeVisible();
  await expect(page.locator("#onlineInventory")).toBeHidden();
  await expect(page.locator("#demoSimulator")).toHaveCount(0);
  for (const privatePath of [
    "/.integration-local/current.json",
    "/.INTEGRATION-LOCAL/current.json",
    "/online-tests/environment.mjs",
    "/.env.example",
  ]) {
    const privateResponse = await page.request.get(privatePath);
    expect(privateResponse.status()).toBe(403);
  }
  await page.evaluate(() => {
    localStorage.setItem("jp_estoque_demo_v02", "existing-stock-unchanged");
    localStorage.setItem(
      "jp_estoque_admin_demo_v02",
      "existing-admin-unchanged",
    );
  });
  await expect(page.locator("#onlineAdmin")).toBeHidden();
  const denied = await page.request.post(
    fixture.api + "/rest/v1/rpc/stock_context",
    { headers: { apikey: fixture.anon }, data: {} },
  );
  expect([401, 403]).toContain(denied.status());
  await page
    .getByLabel("Email", { exact: true })
    .fill(fixture.users.reader.email);
  await page.getByLabel("Senha", { exact: true }).fill("wrong-test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("#onlineStatus")).toContainText("Email ou senha");
  await expect(page.locator("#onlineInventory")).toBeHidden();
  const saved = await page.evaluate(() => [
    localStorage.getItem("jp_estoque_demo_v02"),
    localStorage.getItem("jp_estoque_admin_demo_v02"),
  ]);
  expect(saved).toEqual([
    "existing-stock-unchanged",
    "existing-admin-unchanged",
  ]);
});

test("real login, RLS isolation, references, filters and responsive details", async ({
  page,
}) => {
  await login(page);
  await expect(page.locator("#onlineInventory")).toBeVisible();
  await expect(page.locator("#onlineResults")).toContainText("ONLINE-A");
  await expect(page.locator("#onlineResults")).not.toContainText("ONLINE-B");
  await expect(page.locator("#contract option")).toHaveCount(2);
  await page
    .getByLabel("Pesquisar material, código, fabricante, OC ou NF", {
      exact: true,
    })
    .fill("NF-ONLINE-a");
  await expect(page.locator(".online-material")).toHaveCount(1);
  await page.getByRole("button", { name: "Ver detalhes de ONLINE-A" }).click();
  await expect(page.locator("#detailBody")).toContainText("1.250001");
  await expect(page.locator("#detailBody")).toContainText("NF-ONLINE-a");
  await expect(page.locator("#detailBody")).toContainText("Local ficticio");
  await page.keyboard.press("Escape");
  await expect(page.locator("#onlineDetail")).not.toBeVisible();
  await page.locator("#search").fill("does-not-exist");
  await expect(page.locator("#onlineResults")).toContainText(
    "Nenhum material encontrado",
  );
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.locator(".online-material")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const s = await session(page);
  const headers = {
    apikey: fixture.anon,
    Authorization: `Bearer ${s.access_token}`,
  };
  const response = await page.request.get(
    fixture.api + "/rest/v1/contracts?id=eq." + fixture.b,
    { headers },
  );
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual([]);
  const promotion = await page.request.post(
    fixture.api + "/rest/v1/rpc/admin_save_profile",
    {
      headers,
      data: {
        target_id: fixture.users.reader.id,
        new_name: "Ficticio",
        new_email: fixture.users.reader.email,
        new_role: "proprietario",
        new_active: true,
      },
    },
  );
  expect(promotion.status()).toBe(403);
});

test("verified session recovery ignores forged local identity and logout protects pages", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("jp_estoque_demo_v02", "stock-preserved");
    localStorage.setItem("jp_estoque_admin_demo_v02", "admin-preserved");
    window.onlineLocalWrites = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage) window.onlineLocalWrites.push(key);
      return original.call(this, key, value);
    };
  });
  await login(page);
  await expect(page.locator("#onlineInventory")).toBeVisible();
  await page.evaluate(
    ({ owner }) => {
      const key = "jp_online_v07_56321";
      const s = JSON.parse(sessionStorage.getItem(key));
      s.user.id = owner;
      s.user.app_metadata = { role: "proprietario" };
      sessionStorage.setItem(key, JSON.stringify(s));
    },
    { owner: fixture.users.owner.id },
  );
  await page.reload();
  await expect(page.locator("#onlineInventory")).toBeVisible();
  await expect(page.locator("#onlineResults")).not.toContainText("ONLINE-B");
  await expect(page.locator("#onlineAdmin")).toBeHidden();
  await expect(page.locator("#stockNav-users")).toBeHidden();
  const denied = await page.request.post(
    fixture.api + "/rest/v1/rpc/stock_admin_snapshot",
    {
      headers: {
        apikey: fixture.anon,
        Authorization: "Bearer " + (await session(page)).access_token,
      },
      data: {},
    },
  );
  expect(denied.status()).toBe(403);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.locator("#onlineLogin")).toBeVisible();
  await expect(page.locator("#onlineInventory")).toBeHidden();
  await expect.poll(async () => (await session(page)) === null).toBe(true);
  expect(
    await page.evaluate(() => ({
      onlyTransientSdkProbe: window.onlineLocalWrites.every((key) =>
        key.startsWith("lswt-"),
      ),
      keys: Object.keys(localStorage).sort(),
      stock: localStorage.getItem("jp_estoque_demo_v02"),
      admin: localStorage.getItem("jp_estoque_admin_demo_v02"),
    })),
  ).toEqual({
    onlyTransientSdkProbe: true,
    keys: ["jp_estoque_admin_demo_v02", "jp_estoque_demo_v02"],
    stock: "stock-preserved",
    admin: "admin-preserved",
  });
  await page.reload();
  await expect(page.locator("#onlineLogin")).toBeVisible();
});

test("inactive user and user without contracts have explicit messages", async ({
  page,
}) => {
  await login(page, "inactive");
  await expect(page.locator("#onlineStatus")).toContainText("Usuário inativo");
  await expect(page.locator("#onlineInventory")).toBeHidden();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page
    .getByLabel("Email", { exact: true })
    .fill(fixture.users["no-contract"].email);
  await page
    .getByLabel("Senha", { exact: true })
    .fill(fixture.users["no-contract"].password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("#onlineResults")).toContainText(
    "Nenhum contrato autorizado",
  );
});

test("owner sees all contracts and approved administration without stock or import controls", async ({
  page,
}) => {
  await login(page, "owner");
  await expect(page.locator(".online-material")).toHaveCount(2);
  await page.locator("#contract").selectOption(fixture.b);
  await expect(page.locator(".online-material")).toHaveCount(1);
  await expect(page.locator("#onlineResults")).toContainText("ONLINE-B");
  await page.locator("#onlineAdmin").click();
  await expect(page.locator("#onlineAdminMessage")).toContainText(
    "Perfil administrativo confirmado",
  );
  await expect(page.locator("#onlineAdminMessage")).toContainText(
    "Cadastros online disponíveis",
  );
  await expect(
    page.getByRole("button", { name: /movimentar|Editar saldo/i }),
  ).toHaveCount(0);
});

test("revocation affects the existing browser session on next query", async ({
  page,
}) => {
  await login(page);
  await expect(page.locator(".online-material")).toHaveCount(1);
  try {
    await database((db) =>
      db.query("delete from public.user_contracts where user_id=$1", [
        fixture.users.reader.id,
      ]),
    );
    await page.getByRole("button", { name: "Atualizar consulta" }).click();
    await expect(page.locator("#onlineResults")).toContainText(
      "Nenhum contrato autorizado",
    );
    await database((db) =>
      db.query("update public.profiles set active=false where id=$1", [
        fixture.users.reader.id,
      ]),
    );
    await page.getByRole("button", { name: "Atualizar consulta" }).click();
    await expect(page.locator("#onlineStatus")).toContainText(
      "Usuário inativo",
    );
    await expect(page.locator("#onlineResults")).toBeEmpty();
    await expect(page.locator("#onlineInventory")).toBeHidden();
  } finally {
    await database(async (db) => {
      await db.query("update public.profiles set active=true where id=$1", [
        fixture.users.reader.id,
      ]);
      await db.query(
        "insert into public.user_contracts(user_id,contract_id) values($1,$2) on conflict do nothing",
        [fixture.users.reader.id, fixture.a],
      );
    });
  }
});

test("network failure removes stale protected data and retry recovers", async ({
  page,
  context,
}) => {
  await login(page);
  await expect(page.locator(".online-material")).toHaveCount(1);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Atualizar consulta" }).click();
  await expect(page.locator("#onlineResults")).toBeEmpty();
  await expect(page.locator("#onlineStatus")).toContainText(
    /conexão|indisponível/i,
    { timeout: 30000 },
  );
  await context.setOffline(false);
  await page.getByRole("button", { name: "Atualizar consulta" }).click();
  await expect(page.locator(".online-material")).toHaveCount(1);
});

test("invalidated refresh session returns to login on recovery", async ({
  page,
}) => {
  await login(page);
  await expect(page.locator(".online-material")).toHaveCount(1);
  const s = await session(page);
  const response = await page.request.post(
    fixture.api + "/auth/v1/logout?scope=global",
    {
      headers: {
        apikey: fixture.anon,
        Authorization: `Bearer ${s.access_token}`,
      },
    },
  );
  expect(response.ok()).toBe(true);
  // Only cached scheduling metadata is expired; never forge the signed JWT.
  await page.evaluate(() => {
    const key = "jp_online_v07_56321",
      s = JSON.parse(sessionStorage.getItem(key));
    s.expires_at = 0;
    sessionStorage.setItem(key, JSON.stringify(s));
  });
  await page.reload();
  await expect(page.locator("#onlineLogin")).toBeVisible();
  await expect(page.locator("#onlineInventory")).toBeHidden();
  await expect(page.locator("#onlineResults")).toBeEmpty();
});

test("SDK automatically renews legitimate tokens and keeps consultation working", async ({
  page,
}) => {
  test.setTimeout(180000);
  const renewalResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/auth/v1/token?grant_type=refresh_token") &&
      r.status() === 200,
    { timeout: 150000 },
  );
  await login(page);
  await page.bringToFront();
  await expect(page.locator(".online-material")).toHaveCount(1);
  const before = await session(page);
  const renewal = await renewalResponse;
  expect(renewal.ok()).toBe(true);
  await expect
    .poll(async () => {
      const after = await session(page);
      return !!after && after.access_token !== before.access_token;
    })
    .toBe(true);
  await page.reload();
  await expect(page.locator(".online-material")).toHaveCount(1);
});
