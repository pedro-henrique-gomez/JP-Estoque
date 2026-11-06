import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import * as XLSX from "xlsx";
import { localOnlyEnvironment } from "../integration-tests/preflight.mjs";
const f = JSON.parse(process.env.JP_ONLINE_FIXTURE || "{}");
async function auth(request, role = "owner") {
  const r = await request.post(f.api + "/auth/v1/token?grant_type=password", {
    headers: { apikey: f.anon },
    data: { email: f.users[role].email, password: f.users[role].password },
  });
  expect(r.status()).toBe(200);
  return (await r.json()).access_token;
}
async function api(request, t, path, method = "get", data) {
  return request[method](f.api + "/rest/v1/" + path, {
    headers: {
      apikey: f.anon,
      Authorization: "Bearer " + t,
      Prefer: "return=representation",
    },
    ...(data !== undefined ? { data } : {}),
  });
}
async function rows(request, t, path) {
  const r = await api(request, t, path);
  expect(r.status()).toBe(200);
  return r.json();
}
async function rpc(request, t, name, data) {
  return api(request, t, "rpc/admin_import_" + name, "post", data);
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
    { windowsHide: true, env: localOnlyEnvironment(process.env, p.workspace) },
  );
  const s = JSON.parse(stdout);
  if (
    new URL(s.DB_URL).hostname !== "127.0.0.1" ||
    new URL(s.DB_URL).port !== "56322"
  )
    throw Error("Local test DB required");
  const c = new pg.Client({ connectionString: s.DB_URL });
  await c.connect();
  try {
    return await action(c);
  } finally {
    await c.end();
  }
}
const source = (code, quantity = "1.250001", line = 2) => ({
  line,
  code,
  description: "Material ficticio " + code,
  unit: "m",
  quantity,
  action: "add",
  discard: false,
  decided: true,
});
const payload = (destination, rr) => ({
  destination,
  file_name: "ficticio.xlsx",
  file_sha256: "a".repeat(64),
  sheet_name: "Dados",
  rows: rr,
});
async function setup(request) {
  const t = await auth(request),
    suffix = randomUUID().slice(0, 8),
    name = "Importacao ficticia " + suffix;
  const c = await api(request, t, "contracts", "post", { name });
  expect(c.status()).toBe(201);
  const id = (await c.json())[0].id;
  return { t, id, name, code: "IMP-" + suffix.toUpperCase() };
}
async function preview(request, t, p) {
  const r = await rpc(request, t, "preview", { request: p });
  expect(r.status()).toBe(200);
  return r.json();
}
async function commit(request, t, p) {
  const r = await rpc(request, t, "commit", { preview_token: p.token });
  expect(r.status()).toBe(200);
  return r.json();
}
function xlsx(data, sheets) {
  const b = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(b, XLSX.utils.aoa_to_sheet(data), "Dados");
  if (sheets)
    XLSX.utils.book_append_sheet(b, XLSX.utils.aoa_to_sheet(sheets), "Outra");
  return XLSX.write(b, { type: "buffer", bookType: "xlsx" });
}
async function open(page) {
  await page.goto("/code/html/index.html");
  await page.locator("#email").fill(f.users.owner.email);
  await page.locator("#password").fill(f.users.owner.password);
  await page.locator("#loginForm button").click();
  await expect(page.locator("#onlineInventory")).toBeVisible();
  await page.locator("#onlineAdmin").click();
  await expect(page.locator("#onlineAdminMessage")).toContainText(
    "Cadastros online",
  );
  await page
    .getByRole("button", { name: "Importação de saldos", exact: true })
    .click();
}
async function upload(page, id, buffer) {
  await page.locator("#onlineImportFile").setInputFiles({
    name: "ficticio.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await expect(page.locator("#onlineImportSetup")).toBeVisible();
  await page.locator("#onlineImportDestination").selectOption(id);
}
async function uiPreview(page) {
  await page.locator("#onlineImportPreview").click();
  await expect(page.locator("#onlineImportStatus")).toContainText(/Prévia/);
}
async function apply(page) {
  await page.locator("#onlineImportApply").click();
  await expect(page.locator("#onlineImportConfirmation")).toBeVisible();
  await page.locator("#onlineImportAcknowledge").check();
  await page.locator("#onlineImportCommit").click();
  await expect(page.locator("#onlineImportStatus")).toContainText(
    "Lote confirmado",
  );
}
const counts = async () =>
  db(
    async (c) =>
      (
        await c.query(
          "select (select count(*) from products)::text p,(select count(*) from contract_balances)::text b,(select count(*) from import_batches)::text batches,(select count(*) from import_rows)::text rows,(select count(*) from audit_events)::text audit,(select count(*) from private.import_receipts)::text receipts",
        )
      ).rows[0],
  );

test("xlsx UI exact snapshot, explicit confirmation, references and preserved absent stock", async ({
  page,
  request,
}) => {
  const s = await setup(request);
  const p = await api(request, s.t, "products", "post", {
    code: s.code + "-KEEP",
    description: "Ausente ficticio",
    unit: "m",
  });
  const product = (await p.json())[0];
  const seeded = await api(request, s.t, "rpc/stock_post", "post", {
    request: {
      kind: "entrada",
      product_id: product.id,
      contract_id: s.id,
      quantity: "11.111111",
      expected_quantity: "0",
      idempotency_key: randomUUID(),
    },
  });
  expect(seeded.status()).toBe(200);
  await api(request, s.t, "locations", "post", {
    contract_id: s.id,
    code: "L-IMP",
    description: "Local ficticio",
  });
  const before = await rows(request, s.t, "import_batches?select=id");
  await open(page);
  await upload(
    page,
    s.id,
    xlsx([
      [
        "codigo",
        "descricao",
        "unidade",
        "quantidade",
        "localizacao",
        "fornecedor",
        "oc",
        "nf",
      ],
      [
        s.code,
        "Cabo ficticio",
        "m",
        "999999999999999999.999999",
        "L-IMP",
        "Fornecedor ficticio a",
        "OC-FICTICIA",
        "NF-FICTICIA",
      ],
    ]),
  );
  await uiPreview(page);
  expect((await rows(request, s.t, "import_batches?select=id")).length).toBe(
    before.length,
  );
  await page.locator("#onlineImportNew").selectOption("add");
  await uiPreview(page);
  await expect(page.locator("#onlineImportApply")).toBeVisible();
  await apply(page);
  const balances = await rows(
    request,
    s.t,
    `contract_balances_api?contract_id=eq.${s.id}`,
  );
  expect(balances.map((b) => b.quantity).sort()).toEqual([
    "11.111111",
    "999999999999999999.999999",
  ]);
  const refs = await rows(
    request,
    s.t,
    `balance_references?contract_id=eq.${s.id}`,
  );
  expect(refs.map((r) => r.kind).sort()).toEqual(["nf", "oc"]);
  const download = page.waitForEvent("download");
  await page.locator("#onlineImportExport").click();
  const d = await download;
  const report = JSON.parse(await readFile(await d.path(), "utf8"));
  expect(report.actor).toBe(f.users.owner.id);
  expect(report.applied).toBe(1);
  expect(JSON.stringify(report)).not.toContain("jpimp1:");
  expect(report.rows[0].quantity).toBe("999999999999999999.999999");
  expect(
    (await rows(request, s.t, `audit_events?entity_id=eq.${report.batch_id}`))
      .length,
  ).toBeGreaterThan(0);
});

test("xlsx UI rejects corrupted incompatible and oversized files without writes", async ({
  page,
  request,
}) => {
  const s = await setup(request),
    before = await counts();
  await open(page);
  for (const [name, buffer] of [
    ["fake.xlsx", Buffer.from("codigo;saldo\nA;1")],
    ["old.xls", Buffer.from("not Excel")],
    ["corrupt.xlsx", Buffer.from([80, 75, 3, 4, 0])],
    ["large.xlsx", Buffer.alloc(2097153)],
  ]) {
    await page
      .locator("#onlineImportFile")
      .setInputFiles({ name, mimeType: "application/octet-stream", buffer });
    await expect(page.locator("#onlineImportStatus")).not.toHaveText(/Lendo/);
    await expect(page.locator("#onlineImportSetup")).toBeHidden();
  }
  expect(await counts()).toEqual(before);
});

test("xlsx UI chooses sheet, corrects mapping and explicitly discards invalid duplicates", async ({
  page,
  request,
}) => {
  const s = await setup(request);
  await open(page);
  await upload(
    page,
    s.id,
    xlsx(
      [["Nada"], ["ignorar"]],
      [
        ["identificador", "descricao", "unidade", "quantidade", "contrato"],
        [s.code, "Material ficticio", "m", "1.000001", s.name],
        [s.code, "Duplicado", "m", "1", s.name],
        ["BAD", "Negativo", "m", "-1", s.name],
        ["FOREIGN", "Outro contrato", "m", "1", "Nao autorizado"],
      ],
    ),
  );
  await page.locator("#onlineImportSheet").selectOption("1");
  await page.locator("#onlineMap-code").selectOption("0");
  await uiPreview(page);
  await page
    .getByLabel("Decisão da linha 2", { exact: true })
    .selectOption("add");
  for (const line of [3, 4, 5])
    await page.getByLabel("Descartar linha " + line, { exact: true }).check();
  await uiPreview(page);
  await expect(page.locator("#onlineImportSummary")).toContainText(
    "0 inválidas",
  );
  await apply(page);
  const balance = await rows(
    request,
    s.t,
    `contract_balances_api?contract_id=eq.${s.id}`,
  );
  expect(balance).toHaveLength(1);
  expect(balance[0].quantity).toBe("1.000001");
  const batches = await rows(
    request,
    s.t,
    "import_batches?order=created_at.desc&limit=1",
  );
  const rr = await rows(
    request,
    s.t,
    `import_rows?batch_id=eq.${batches[0].id}`,
  );
  expect(rr.filter((r) => r.status === "ignored")).toHaveLength(3);
});

test("server validates decimals, destination, shape and bounded resources", async ({
  request,
}) => {
  const s = await setup(request),
    before = await counts();
  for (const q of [
    "-1",
    "NaN",
    "1e3",
    "1.0000001",
    "1000000000000000000",
    "",
  ]) {
    const p = await preview(request, s.t, payload(s.id, [source(s.code, q)]));
    expect(p.ready).toBe(false);
    const r = await rpc(request, s.t, "commit", { preview_token: p.token });
    expect(r.status()).toBe(400);
  }
  for (const pp of [
    payload(
      s.id,
      Array.from({ length: 501 }, (_, i) => source(s.code + i, "1", i + 2)),
    ),
    { ...payload(s.id, [source(s.code)]), unexpected: true },
    payload(randomUUID(), [source(s.code)]),
    payload(s.id, [{ ...source(s.code), unknown: "x" }]),
    { ...payload(s.id, [source(s.code)]), file_name: "../bad.xlsx" },
  ]) {
    const r = await rpc(request, s.t, "preview", { request: pp });
    expect(r.ok()).toBe(false);
  }
  const p = await preview(
    request,
    s.t,
    payload(s.id, [
      {
        ...source(s.code),
        quantity: 1,
        contract: "Other contract",
        supplier: "Not found",
        location: "Other",
      },
    ]),
  );
  expect(p.ready).toBe(false);
  expect(p.rows[0].errors.length).toBeGreaterThan(3);
  expect(await counts()).toEqual(before);
});

test("real JWT role denial, actor-bound signatures and private API isolation", async ({
  request,
}) => {
  const s = await setup(request),
    p = await preview(request, s.t, payload(s.id, [source(s.code)]));
  for (const role of [
    "reader",
    "coordinator",
    "director",
    "warehouse",
    "planning",
    "inactive",
    "no-contract",
  ]) {
    const t = await auth(request, role);
    expect(
      (
        await rpc(request, t, "preview", {
          request: payload(s.id, [source(s.code)]),
        })
      ).status(),
    ).toBe(403);
    expect(
      (await rpc(request, t, "commit", { preview_token: p.token })).status(),
    ).toBe(403);
  }
  const other = await auth(request, "administrator");
  expect(
    (await rpc(request, other, "commit", { preview_token: p.token })).status(),
  ).toBe(403);
  const tampered = p.token.slice(0, -1) + (p.token.endsWith("0") ? "1" : "0");
  expect(
    (await rpc(request, s.t, "commit", { preview_token: tampered })).status(),
  ).toBe(403);
  const ap = await preview(
    request,
    other,
    payload(s.id, [source(s.code + "-ADMIN")]),
  );
  expect((await commit(request, other, ap)).actor).toBe(
    f.users.administrator.id,
  );
  expect((await api(request, s.t, "import_signing_key")).ok()).toBe(false);
  expect((await api(request, s.t, "rpc/import_actor", "post", {})).ok()).toBe(
    false,
  );
  expect(
    (
      await api(request, s.t, "import_batches", "post", {
        created_by: f.users.owner.id,
        source_file: "forged.xlsx",
      })
    ).status(),
  ).toBe(403);
});

test("parallel confirmation and reimport return original receipt without reapplying", async ({
  request,
}) => {
  const s = await setup(request),
    data = payload(s.id, [source(s.code)]),
    p = await preview(request, s.t, data);
  const replies = await Promise.all([
    commit(request, s.t, p),
    commit(request, s.t, p),
  ]);
  expect(replies[0].batch_id).toBe(replies[1].batch_id);
  expect(replies.filter((r) => r.reused)).toHaveLength(1);
  const again = await commit(request, s.t, p);
  expect(again.reused).toBe(true);
  data.rows[0].action = "replace";
  data.file_sha256 = "b".repeat(64);
  const fresh = await preview(request, s.t, data);
  expect(fresh.duplicate.batch_id).toBe(again.batch_id);
  expect((await commit(request, s.t, fresh)).reused).toBe(true);
  expect(
    await rows(request, s.t, `import_batches?summary->>destination=eq.${s.id}`),
  ).toHaveLength(1);
});

test("failure on second row rolls back entire snapshot and audit through real HTTP", async ({
  request,
}) => {
  const s = await setup(request),
    p = await preview(
      request,
      s.t,
      payload(s.id, [source(s.code), source(s.code + "-LATE", "2", 3)]),
    ),
    before = await counts();
  await db((c) =>
    c.query(
      "create function private.v09_http_fail() returns trigger language plpgsql as $$ begin if new.code like '%-LATE' then raise exception 'Fictitious failure on later row'; end if; return new; end $$; create trigger v09_http_fail before insert on public.products for each row execute function private.v09_http_fail()",
    ),
  );
  try {
    const r = await rpc(request, s.t, "commit", { preview_token: p.token });
    expect(r.ok()).toBe(false);
    expect(await counts()).toEqual(before);
  } finally {
    await db((c) =>
      c.query(
        "drop trigger v09_http_fail on public.products;drop function private.v09_http_fail()",
      ),
    );
  }
});

test("concurrent stock edit invalidates preview; explicit refreshed replacement succeeds", async ({
  request,
}) => {
  const s = await setup(request),
    data = payload(s.id, [source(s.code)]),
    first = await preview(request, s.t, data);
  await commit(request, s.t, first);
  data.rows[0].quantity = "8.123456";
  data.rows[0].action = "replace";
  const p = await preview(request, s.t, data);
  const balances = await rows(
    request,
    s.t,
    `contract_balances?contract_id=eq.${s.id}`,
  );
  const edit = await api(request, s.t, "rpc/stock_post", "post", {
    request: {
      kind: "entrada",
      product_id: balances[0].product_id,
      contract_id: s.id,
      quantity: "7.75",
      expected_quantity: "1.250001",
      idempotency_key: randomUUID(),
    },
  });
  expect(edit.status()).toBe(200);
  const stale = await rpc(request, s.t, "commit", { preview_token: p.token });
  expect((await stale.json()).code).toBe("40001");
  expect(
    (
      await rows(request, s.t, `contract_balances_api?contract_id=eq.${s.id}`)
    )[0].quantity,
  ).toBe("9.000001");
  const fresh = await preview(request, s.t, data);
  expect(fresh.rows[0].before.quantity).toBe("9.000001");
  await db(async (c) => {
    await c.query("begin; lock table public.products in row exclusive mode");
    try {
      const locked = await rpc(request, s.t, "commit", {
        preview_token: fresh.token,
      });
      expect((await locked.json()).code).toBe("55P03");
    } finally {
      await c.query("rollback");
    }
  });
  await commit(request, s.t, fresh);
  expect(
    (
      await rows(request, s.t, `contract_balances_api?contract_id=eq.${s.id}`)
    )[0].quantity,
  ).toBe("8.123456");
});

test("server expiration and role revocation reject existing genuine sessions", async ({
  request,
}) => {
  const s = await setup(request);
  await db((c) =>
    c.query("update private.import_signing_key set ttl_seconds=1"),
  );
  try {
    const p = await preview(request, s.t, payload(s.id, [source(s.code)]));
    await new Promise((r) => setTimeout(r, 2400));
    expect(
      (await rpc(request, s.t, "commit", { preview_token: p.token })).status(),
    ).toBe(403);
  } finally {
    await db((c) =>
      c.query("update private.import_signing_key set ttl_seconds=600"),
    );
  }
  const p = await preview(request, s.t, payload(s.id, [source(s.code)]));
  await db((c) =>
    c.query("update public.profiles set role='diretor' where id=$1", [
      f.users.owner.id,
    ]),
  );
  try {
    expect(
      (await rpc(request, s.t, "commit", { preview_token: p.token })).status(),
    ).toBe(403);
  } finally {
    await db((c) =>
      c.query("update public.profiles set role='proprietario' where id=$1", [
        f.users.owner.id,
      ]),
    );
  }
});

test("history export survives reload, RLS isolates reports and logs cannot be forged", async ({
  page,
  request,
}) => {
  const s = await setup(request),
    p = await preview(request, s.t, payload(s.id, [source(s.code)])),
    r = await commit(request, s.t, p);
  await open(page);
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  const button = page
    .locator(".online-admin-record")
    .filter({ hasText: r.batch_id })
    .getByRole("button", { name: /Exportar relat.rio do lote/ });
  await expect(button).toBeVisible();
  const download = page.waitForEvent("download");
  await button.click();
  const file = await download;
  const report = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(report.batch_id).toBe(r.batch_id);
  expect(report.rows[0].quantity).toBe("1.250001");
  const reader = await auth(request, "reader");
  expect(
    await rows(request, reader, `import_rows?batch_id=eq.${r.batch_id}`),
  ).toEqual([]);
  expect(
    await rows(request, reader, `import_batches?id=eq.${r.batch_id}`),
  ).toEqual([]);
  expect(
    await rows(request, reader, `contract_balances_api?contract_id=eq.${s.id}`),
  ).toEqual([]);
  expect(
    (
      await api(request, s.t, "import_rows", "post", {
        batch_id: r.batch_id,
        source_line: 7,
        contract_id: s.id,
        status: "success",
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await api(request, s.t, `import_batches?id=eq.${r.batch_id}`, "patch", {
        source_file: "tampered.xlsx",
      })
    ).status(),
  ).toBe(403);
});
