import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { localOnlyEnvironment } from "../integration-tests/preflight.mjs";
const fixture = JSON.parse(process.env.JP_ONLINE_FIXTURE || "{}");
async function login(page, role = "owner") {
  await page.goto("/code/html/index.html");
  await expect(page.locator("#onlineLogin")).toBeVisible();
  await page.locator("#email").fill(fixture.users[role].email);
  await page.locator("#password").fill(fixture.users[role].password);
  await page.locator("#loginForm button").click();
  await expect(page.locator("#onlineInventory")).toBeVisible();
}
async function open(page, role = "owner") {
  await login(page, role);
  await page.locator("#onlineAdmin").click();
  await expect(page.locator("#onlineAdminMessage")).toContainText(
    "Cadastros online disponíveis",
  );
}
async function token(page) {
  return page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("jp_online_v07_56321")).access_token,
  );
}
async function auth(request, role) {
  const r = await request.post(
    fixture.api + "/auth/v1/token?grant_type=password",
    {
      headers: { apikey: fixture.anon },
      data: {
        email: fixture.users[role].email,
        password: fixture.users[role].password,
      },
    },
  );
  expect(r.status()).toBe(200);
  return (await r.json()).access_token;
}
const headers = (t) => ({
  apikey: fixture.anon,
  Authorization: `Bearer ${t}`,
  Prefer: "return=representation",
});
async function api(request, t, path, method = "get", data) {
  return request[method](fixture.api + "/rest/v1/" + path, {
    headers: headers(t),
    ...(data ? { data } : {}),
  });
}
async function rows(request, t, path) {
  const r = await api(request, t, path);
  expect(r.status()).toBe(200);
  return r.json();
}
async function confirm(page) {
  await expect(page.locator("#adminConfirmationSummary")).toBeVisible();
  await page.locator("#confirmAdminChange").click();
}
async function save(page) {
  await page
    .getByRole("button", { name: "Salvar cadastro", exact: true })
    .click();
  await confirm(page);
  await expect(page.locator("#onlineAdminMessage")).toContainText(
    "Alteração confirmada",
  );
}
async function tab(page, label) {
  await page
    .locator(".online-admin-nav")
    .getByRole("button", { name: label, exact: true })
    .click();
}
const record = (page, marker) =>
  page.locator(".online-admin-record").filter({ hasText: marker });
async function fill(page, values) {
  for (const [key, value] of Object.entries(values)) {
    const field = page.locator("#onlineAdminForm").locator(`[name="${key}"]`);
    if ((await field.evaluate((n) => n.tagName)) === "SELECT")
      await field.selectOption(value);
    else await field.fill(value);
  }
}
async function db(action) {
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
    { env: localOnlyEnvironment(process.env, p.workspace), windowsHide: true },
  );
  const s = JSON.parse(stdout);
  if (
    new URL(s.DB_URL).hostname !== "127.0.0.1" ||
    new URL(s.DB_URL).port !== "56322"
  )
    throw Error("Nonlocal DB rejected");
  const client = new pg.Client({ connectionString: s.DB_URL });
  await client.connect();
  try {
    await action(client);
  } finally {
    await client.end();
  }
}

for (const role of [
  "reader",
  "coordinator",
  "director",
  "warehouse",
  "planning",
])
  test(`administration denied by UI and real RLS for ${role}`, async ({
    page,
    request,
  }) => {
    await login(page, role);
    const t = await token(page);
    await page.locator("#onlineAdmin").click();
    await expect(page.locator("#onlineAdminMessage")).toContainText(
      "não autorizado",
    );
    await expect(page.locator("#onlineAdminContent")).toBeEmpty();
    const marker = "DENIED-" + randomUUID();
    for (const [table, data] of [
      [
        "products",
        { code: marker, description: "Ficticio negado", unit: "un" },
      ],
      ["contracts", { name: marker }],
      ["suppliers", { name: marker }],
      ["locations", { contract_id: fixture.a, code: marker }],
    ])
      expect((await api(request, t, table, "post", data)).status()).toBe(403);
    const admin = await auth(request, "administrator"),
      product = (await rows(request, admin, "products?code=eq.ONLINE-A"))[0];
    expect(
      await (
        await api(request, t, "products?id=eq." + product.id, "patch", {
          description: marker,
        })
      ).json(),
    ).toEqual([]);
    expect(
      await (
        await api(request, t, "products?id=eq." + product.id, "delete")
      ).json(),
    ).toEqual([]);
    expect(
      (await rows(request, admin, "products?id=eq." + product.id))[0]
        .description,
    ).toBe("Material online A");
    expect(
      (
        await api(request, t, "rpc/admin_set_user_contract", "post", {
          target_id: fixture.users["no-contract"].id,
          target_contract: fixture.b,
          authorized: true,
        })
      ).status(),
    ).toBe(403);
    expect(await rows(request, t, "audit_events?select=id")).toEqual([]);
  });

for (const role of ["owner", "administrator"])
  test(`CRUD of global catalog contracts suppliers and locations for ${role} without balance changes`, async ({
    page,
    request,
  }) => {
    await open(page, role);
    const t = await token(page);
    const balances = JSON.stringify(
      await rows(request, t, "contract_balances_api?order=id"),
    );
    const marker = "TEST-" + randomUUID(),
      created = {};
    for (const [entity, label, values, display] of [
      ["contracts", "Contratos", { name: marker }, marker],
      [
        "suppliers",
        "Fornecedores",
        { name: marker, contact: "Contato ficticio", areas: "Teste" },
        marker,
      ],
      [
        "locations",
        "Localizações",
        { code: marker, description: "Local " + marker },
        "Local " + marker,
      ],
      [
        "products",
        "Materiais",
        {
          code: marker,
          description: "Material " + marker,
          unit: "un",
          manufacturer: "Ficticio",
          category: "Teste",
          model: "Modelo",
        },
        "Material " + marker,
      ],
    ]) {
      await tab(page, label);
      await page
        .getByRole("button", { name: "Novo cadastro", exact: true })
        .click();
      if (entity === "locations") values.contract_id = created.contracts;
      await fill(page, values);
      await page
        .getByRole("button", { name: "Salvar cadastro", exact: true })
        .click();
      await expect(page.locator("#adminConfirmationSummary")).toContainText(
        marker,
      );
      if (entity === "contracts") {
        await page.locator("#cancelAdminChange").click();
        expect(await rows(request, t, "contracts?name=eq." + marker)).toEqual(
          [],
        );
        await page
          .getByRole("button", { name: "Salvar cadastro", exact: true })
          .click();
      }
      await confirm(page);
      await expect(page.locator("#onlineAdminMessage")).toContainText(
        "Alteração confirmada",
      );
      const row = record(page, display);
      await expect(row).toHaveCount(1);
      created[entity] = await row.getAttribute("data-record-id");
      await row.getByRole("button", { name: "Editar", exact: true }).click();
      const field =
        entity === "products" || entity === "locations"
          ? "description"
          : "name";
      await fill(page, { [field]: display + " editado" });
      await save(page);
      await expect(record(page, display + " editado")).toHaveCount(1);
    }
    for (const [entity, label] of [
      ["locations", "Localizações"],
      ["products", "Materiais"],
      ["suppliers", "Fornecedores"],
      ["contracts", "Contratos"],
    ]) {
      await tab(page, label);
      await page
        .locator(`[data-record-id="${created[entity]}"]`)
        .getByRole("button", { name: "Excluir", exact: true })
        .click();
      await confirm(page);
      await expect(page.locator("#onlineAdminMessage")).toContainText(
        "Alteração confirmada",
      );
      expect(
        await rows(request, t, entity + "?id=eq." + created[entity]),
      ).toEqual([]);
    }
    expect(
      JSON.stringify(
        await rows(request, t, "contract_balances_api?order=id"),
      ) === balances,
    ).toBe(true);
    await tab(page, "Histórico");
    await expect(page.locator("#onlineAdminContent")).toContainText("products");
    const events = await rows(
      request,
      t,
      "audit_events?entity_id=eq." + created.products,
    );
    expect(events.map((e) => e.operation).sort()).toEqual([
      "DELETE",
      "INSERT",
      "UPDATE",
    ]);
    expect(events.every((e) => e.actor_id === fixture.users[role].id)).toBe(
      true,
    );
  });

test("links use RPC and revoke access in an existing legitimate session", async ({
  page,
  request,
}) => {
  await open(page);
  const target = fixture.users["no-contract"],
    targetToken = await auth(request, "no-contract");
  await tab(page, "Usuários e vínculos");
  const user = () => page.locator(`[data-user-id="${target.id}"]`);
  await user()
    .getByRole("button", { name: "Autorizar Contrato ficticio A", exact: true })
    .click();
  await confirm(page);
  await expect(page.locator("#onlineAdminMessage")).toContainText(
    "Alteração confirmada",
  );
  expect(
    (await rows(request, targetToken, "contracts")).map((c) => c.id),
  ).toEqual([fixture.a]);
  await user()
    .getByRole("button", { name: "Revogar Contrato ficticio A", exact: true })
    .click();
  await confirm(page);
  await expect(page.locator("#onlineAdminMessage")).toContainText(
    "Alteração confirmada",
  );
  expect(await rows(request, targetToken, "contracts")).toEqual([]);
});

test("profile RPC maintains self-administration restrictions and can manage other users", async ({
  page,
  request,
}) => {
  await open(page);
  const t = await token(page);
  await tab(page, "Usuários e vínculos");
  const own = page.locator(`[data-user-id="${fixture.users.owner.id}"]`);
  await expect(
    own.getByRole("button", { name: "Salvar perfil" }),
  ).toBeDisabled();
  await expect(
    own.getByRole("button", { name: "Autorizar Contrato ficticio A" }),
  ).toBeDisabled();
  for (const role of ["owner", "administrator"]) {
    const a = await auth(request, role);
    expect(
      (
        await api(request, a, "rpc/admin_save_profile", "post", {
          target_id: fixture.users[role].id,
          new_name: "Ficticio",
          new_email: fixture.users[role].email,
          new_role: "proprietario",
          new_active: true,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await api(
          request,
          a,
          "profiles?id=eq." + fixture.users[role].id,
          "patch",
          { role: "proprietario" },
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await api(request, a, "user_contracts", "post", {
          user_id: fixture.users[role].id,
          contract_id: fixture.a,
        })
      ).status(),
    ).toBe(403);
  }
  const target = fixture.users["no-contract"],
    article = () => page.locator(`[data-user-id="${target.id}"]`);
  await article().getByLabel("Status", { exact: true }).selectOption("false");
  await article().getByRole("button", { name: "Salvar perfil" }).click();
  await confirm(page);
  await expect(page.locator("#onlineAdminMessage")).toContainText(
    "Alteração confirmada",
  );
  expect(
    (await rows(request, t, "profiles?id=eq." + target.id))[0].active,
  ).toBe(false);
  await article().getByLabel("Status", { exact: true }).selectOption("true");
  await article().getByRole("button", { name: "Salvar perfil" }).click();
  await confirm(page);
  await expect(page.locator("#onlineAdminMessage")).toContainText(
    "Alteração confirmada",
  );
  expect(
    (await rows(request, t, "profiles?id=eq." + target.id))[0].active,
  ).toBe(true);
});

test("audit immutable even for both managers and integrity errors preserve existing data", async ({
  page,
  request,
}) => {
  await open(page);
  const t = await token(page);
  await tab(page, "Contratos");
  await record(page, "Contrato ficticio A")
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await confirm(page);
  await expect(page.locator("#onlineAdminMessage")).toContainText(
    "Registro vinculado",
  );
  expect((await rows(request, t, "contracts?id=eq." + fixture.a)).length).toBe(
    1,
  );
  await tab(page, "Materiais");
  await page.getByRole("button", { name: "Novo cadastro" }).click();
  await fill(page, {
    code: "ONLINE-A",
    description: "Duplicado ficticio",
    unit: "un",
  });
  await page.getByRole("button", { name: "Salvar cadastro" }).click();
  await confirm(page);
  await expect(page.locator("#onlineAdminMessage")).toContainText("Já existe");
  expect((await rows(request, t, "products?code=eq.ONLINE-A")).length).toBe(1);
  for (const role of ["owner", "administrator"]) {
    const a = await auth(request, role);
    for (const [method, data] of [
      ["post", { entity: "forjado", operation: "INSERT" }],
      ["patch", { entity: "forjado" }],
      ["delete", undefined],
    ])
      expect(
        (
          await api(request, a, "audit_events?id=not.is.null", method, data)
        ).status(),
      ).toBe(403);
  }
});

test("revoked manager cannot submit the form or bypass it through HTTP", async ({
  page,
  request,
}) => {
  await open(page);
  const t = await token(page),
    marker = "REVOKED-" + randomUUID();
  await page.getByRole("button", { name: "Novo cadastro" }).click();
  await fill(page, {
    code: marker,
    description: "Ficticio revogado",
    unit: "un",
  });
  try {
    await db((c) =>
      c.query("update public.profiles set role='diretor' where id=$1", [
        fixture.users.owner.id,
      ]),
    );
    await page.getByRole("button", { name: "Salvar cadastro" }).click();
    await confirm(page);
    await expect(page.locator("#onlineAdminMessage")).toContainText(
      "não autorizado",
    );
    await expect(page.locator("#onlineAdminContent")).toBeEmpty();
    expect(
      (
        await api(request, t, "products", "post", {
          code: marker,
          description: "Ficticio",
          unit: "un",
        })
      ).status(),
    ).toBe(403);
    const a = await auth(request, "administrator");
    expect(await rows(request, a, "products?code=eq." + marker)).toEqual([]);
  } finally {
    await db((c) =>
      c.query("update public.profiles set role='proprietario' where id=$1", [
        fixture.users.owner.id,
      ]),
    );
  }
});

test("zero affected rows are never presented as a successful update", async ({
  page,
  request,
}) => {
  await open(page);
  const t = await token(page),
    marker = "STALE-" + randomUUID();
  await page.getByRole("button", { name: "Novo cadastro" }).click();
  await fill(page, { code: marker, description: marker, unit: "un" });
  await save(page);
  const row = record(page, marker),
    id = await row.getAttribute("data-record-id");
  await row.getByRole("button", { name: "Editar", exact: true }).click();
  await fill(page, { description: marker + " editado" });
  expect(
    (await api(request, t, "products?id=eq." + id, "delete")).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "Salvar cadastro" }).click();
  await confirm(page);
  await expect(page.locator("#onlineAdminMessage")).toContainText(
    "Nenhuma alteração confirmada",
  );
  await expect(page.locator("#onlineAdminContent")).toBeEmpty();
});

test("logout clears administrative drafts and preserves demo storage", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("jp_estoque_demo_v02", "existing-stock");
    localStorage.setItem(
      "jp_estoque_admin_demo_v02",
      "existing-administration",
    );
  });
  await open(page);
  await tab(page, "Contratos");
  const marker = "CANCELLED-" + randomUUID();
  await page.getByRole("button", { name: "Novo cadastro" }).click();
  await fill(page, { name: marker });
  await page.getByRole("button", { name: "Salvar cadastro" }).click();
  await expect(page.locator("#adminConfirmationSummary")).toContainText(marker);
  await page.keyboard.press("Escape");
  await page.locator("#logoutOnline").click();
  await expect(page.locator("#onlineLogin")).toBeVisible();
  await expect(page.locator("#onlineAdminContent")).toBeEmpty();
  await expect(page.locator("#adminConfirmationSummary")).toBeEmpty();
  expect(
    await page.evaluate(() => [
      localStorage.getItem("jp_estoque_demo_v02"),
      localStorage.getItem("jp_estoque_admin_demo_v02"),
    ]),
  ).toEqual(["existing-stock", "existing-administration"]);
  const a = await auth(request, "administrator");
  expect(await rows(request, a, "contracts?name=eq." + marker)).toEqual([]);
});
