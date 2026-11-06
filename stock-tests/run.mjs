import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { chromium } from "@playwright/test";
import { prepareOnlineFixture } from "../online-tests/environment.mjs";
import {
  localOnlyEnvironment,
  redactDiagnostic,
} from "../integration-tests/preflight.mjs";
const exec = promisify(execFile),
  cases = [],
  p = JSON.parse(await readFile(".integration-local/current.json", "utf8")),
  env = localOnlyEnvironment(process.env, p.workspace);
let fixture,
  db,
  browser,
  server,
  tokens = {},
  A,
  B,
  P,
  entry,
  exit;
async function check(name, fn) {
  const t = performance.now();
  try {
    await fn();
    cases.push({
      name,
      status: "passed",
      ms: Math.round(performance.now() - t),
    });
    console.log("PASS " + name);
  } catch (e) {
    cases.push({ name, status: "failed", code: e.code || "ASSERTION" });
    throw e;
  }
}
async function api(role, path, method = "GET", data) {
  const r = await fetch(fixture.api + path, {
    method,
    headers: {
      apikey: fixture.anon,
      Authorization: "Bearer " + tokens[role],
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const rest = (role, path, method, data) =>
  api(role, "/rest/v1/" + path, method, data);
const rpc = (role, name, request) =>
  rest(role, "rpc/" + name, "POST", request === undefined ? {} : { request });
async function ok(role, name, request) {
  const r = await rpc(role, name, request);
  assert.ok(
    [200, 204].includes(r.status),
    JSON.stringify({ name, status: r.status, code: r.body?.code }),
  );
  return r.body;
}
async function create(table, data) {
  const r = await rest("owner", table, "POST", data);
  assert.equal(r.status, 201);
  return r.body[0];
}
const balance = async (id = A) =>
  (
    await rest(
      "owner",
      `contract_balances_api?contract_id=eq.${id}&product_id=eq.${P}`,
    )
  ).body[0].quantity;
async function request(kind = "saida", quantity = "1.000001", expected) {
  return {
    kind,
    contract_id: A,
    product_id: P,
    quantity,
    expected_quantity: expected ?? (await balance()),
    idempotency_key: randomUUID(),
    ...(kind === "saida"
      ? {
          destination: "Bloco ficticio A",
          recipient: "Retirante Ficticio Completo",
          recipient_company: "Empresa Ficticia",
        }
      : { oc: "OC-FICTICIA-PARCIAL", nf: "NF-FICTICIA" }),
    notes: "Teste ficticio",
  };
}
async function link(user_id, contract_id, authorized) {
  const r = await rest("owner", "rpc/admin_set_user_contract", "POST", {
    target_id: user_id,
    target_contract: contract_id,
    authorized,
  });
  assert.equal(r.status, 204);
}
const override = (user_id, permission, decision) =>
  ok("owner", "stock_set_override", { user_id, permission, decision });
try {
  ({ fixture } = await prepareOnlineFixture());
  const status = JSON.parse(
    (
      await exec(
        process.execPath,
        [
          "node_modules/supabase/dist/supabase.js",
          "status",
          "--workdir",
          p.workspace,
          "--output",
          "json",
        ],
        { env, windowsHide: true },
      )
    ).stdout,
  );
  assert.equal(new URL(status.DB_URL).hostname, "127.0.0.1");
  assert.equal(new URL(status.DB_URL).port, "56322");
  db = new pg.Client({ connectionString: status.DB_URL });
  await db.connect();
  for (const [role, u] of Object.entries(fixture.users)) {
    const r = await fetch(fixture.api + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: fixture.anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email: u.email, password: u.password }),
    });
    assert.equal(r.status, 200);
    tokens[role] = (await r.json()).access_token;
  }
  A = (
    await create("contracts", { name: "Contrato movimento A " + randomUUID() })
  ).id;
  B = (
    await create("contracts", { name: "Contrato movimento B " + randomUUID() })
  ).id;
  P = (
    await create("products", {
      code: "MOVE-" + randomUUID().slice(0, 8),
      description: "Cabo flexivel ficticio 2,5 mm2",
      unit: "m",
    })
  ).id;
  for (const [contract_id, quantity] of [
    [A, "100.000000"],
    [B, "250.000000"],
  ])
    await db.query(
      "insert into public.contract_balances(product_id,contract_id,quantity) values($1,$2,$3)",
      [P, contract_id, quantity],
    );
  await link(fixture.users.warehouse.id, A, true);
  await check(
    "warehouse has genuine Auth identity default permissions and scoped context",
    async () => {
      const c = await ok("warehouse", "stock_context");
      assert.equal(c.actor.id, fixture.users.warehouse.id);
      assert.ok(c.permissions.includes("saida.registrar"));
      assert.ok(c.contracts.some((c) => c.id === A));
      assert.ok(!c.contracts.some((c) => c.id === B));
      assert.ok(c.balances.every((b) => b.contract_id !== B));
    },
  );
  await check(
    "unprivileged inactive director and foreign-contract requests are denied",
    async () => {
      for (const role of [
        "reader",
        "coordinator",
        "planning",
        "director",
        "inactive",
        "no-contract",
      ])
        assert.equal(
          (await rpc(role, "stock_post", await request())).status,
          403,
        );
      assert.equal(
        (
          await rpc("warehouse", "stock_post", {
            ...(await request()),
            contract_id: B,
          })
        ).status,
        403,
      );
    },
  );
  await check(
    "positive fractional entry and multiple partial receipts share existing OC",
    async () => {
      entry = await ok(
        "warehouse",
        "stock_post",
        await request("entrada", "10.125001"),
      );
      const another = await ok(
        "warehouse",
        "stock_post",
        await request("entrada", "0.000001"),
      );
      assert.equal(entry.actor_id, fixture.users.warehouse.id);
      assert.equal(entry.oc, another.oc);
      assert.equal(await balance(), "110.125002");
      assert.equal(await balance(B), "250.000000");
    },
  );
  await check(
    "warehouse issues without administrator approval and produces traceable receipt",
    async () => {
      exit = await ok("warehouse", "stock_post", await request("saida", "30"));
      assert.equal(exit.quantity, "30.000000");
      assert.equal(exit.after_quantity, "80.125002");
      assert.equal(exit.actor_id, fixture.users.warehouse.id);
      assert.equal(exit.recipient, "Retirante Ficticio Completo");
      assert.ok(exit.occurred_at);
      assert.equal(await balance(B), "250.000000");
    },
  );
  await check(
    "zero negative high precision missing fields and forged actor are rejected atomically",
    async () => {
      const before = await balance();
      for (const patch of [
        { quantity: "0" },
        { quantity: "-1" },
        { quantity: "1.0000001" },
        { quantity: 1 },
        { quantity: "999999999999999999.999999" },
        { recipient: "" },
        { destination: "" },
        { recipient_company: "" },
        { actor_id: fixture.users.owner.id },
      ]) {
        const r = await rpc("warehouse", "stock_post", {
          ...(await request()),
          ...patch,
        });
        assert.ok(r.status >= 400);
      }
      assert.equal(await balance(), before);
    },
  );
  await check(
    "repeated request key returns original result and rejects changed content",
    async () => {
      const r = await request("entrada", "1.000001");
      const [one, two] = await Promise.all([
        ok("warehouse", "stock_post", r),
        ok("warehouse", "stock_post", r),
      ]);
      assert.equal(one.id, two.id);
      assert.deepEqual([one.reused, two.reused].sort(), [false, true]);
      assert.equal(
        (await rpc("warehouse", "stock_post", { ...r, quantity: "2" })).status,
        400,
      );
    },
  );
  await check(
    "concurrent exits cannot overspend and stale confirmation cannot overwrite",
    async () => {
      const before = await balance();
      const req1 = await request("saida", "50", before),
        req2 = await request("saida", "50", before);
      const replies = await Promise.all([
        rpc("warehouse", "stock_post", req1),
        rpc("warehouse", "stock_post", req2),
      ]);
      assert.equal(replies.filter((r) => r.status === 200).length, 1);
      assert.equal(replies.find((r) => r.status !== 200).body.code, "40001");
      assert.equal(await balance(), "31.125003");
    },
  );
  await check(
    "direct insert update and delete are denied even to managers",
    async () => {
      for (const role of ["owner", "administrator", "warehouse"])
        for (const [method, path, data] of [
          ["POST", "stock_movements", { actor_id: fixture.users[role].id }],
          ["PATCH", "stock_movements?id=eq." + exit.id, { quantity: "1" }],
          ["DELETE", "stock_movements?id=eq." + exit.id, undefined],
          [
            "POST",
            "contract_balances",
            { contract_id: A, product_id: P, quantity: "1" },
          ],
          [
            "PATCH",
            `contract_balances?contract_id=eq.${A}&product_id=eq.${P}`,
            { quantity: "999" },
          ],
          [
            "DELETE",
            `contract_balances?contract_id=eq.${A}&product_id=eq.${P}`,
            undefined,
          ],
        ])
          assert.equal((await rest(role, path, method, data)).status, 403);
    },
  );
  await check(
    "failed ledger insert rolls back balance and audit after balance update",
    async () => {
      const before = await balance(),
        count = (
          await db.query("select count(*)::int n from public.audit_events")
        ).rows[0].n;
      await db.query(
        "create function private.stock_fail_test() returns trigger language plpgsql as $$ begin raise exception 'Fictitious ledger failure';end $$;create trigger stock_fail_test before insert on public.stock_movements for each row execute function private.stock_fail_test()",
      );
      try {
        assert.ok(
          (await rpc("warehouse", "stock_post", await request("entrada", "1")))
            .status >= 400,
        );
        assert.equal(await balance(), before);
        assert.equal(
          (await db.query("select count(*)::int n from public.audit_events"))
            .rows[0].n,
          count,
        );
      } finally {
        await db.query(
          "drop trigger stock_fail_test on public.stock_movements;drop function private.stock_fail_test()",
        );
      }
    },
  );
  await check(
    "reversal appends opposite event preserves original and is idempotent",
    async () => {
      const req = {
        movement_id: exit.id,
        reason: "Retirada ficticia cancelada",
        idempotency_key: randomUUID(),
      };
      const reversed = await ok("owner", "stock_reverse", req);
      assert.equal(reversed.reversal_of, exit.id);
      assert.equal(reversed.kind, "entrada");
      assert.equal(await balance(), "61.125003");
      assert.equal((await ok("owner", "stock_reverse", req)).id, reversed.id);
      assert.ok(
        (
          await rpc("owner", "stock_reverse", {
            ...req,
            idempotency_key: randomUUID(),
          })
        ).status >= 400,
      );
      const history = await ok("owner", "stock_history", {
        movement_id: exit.id,
      });
      assert.equal(history.rows[0].reversal.reason, req.reason);
      assert.equal(history.rows[0].quantity, "30.000000");
    },
  );
  await check(
    "reversal requires permission and cannot remove more stock than available",
    async () => {
      assert.equal(
        (
          await rpc("warehouse", "stock_reverse", {
            movement_id: entry.id,
            reason: "Tentativa negada",
            idempotency_key: randomUUID(),
          })
        ).status,
        403,
      );
      const huge = await ok(
        "warehouse",
        "stock_post",
        await request("entrada", "100"),
      );
      await ok("warehouse", "stock_post", await request("saida", "150"));
      assert.ok(
        (
          await rpc("owner", "stock_reverse", {
            movement_id: huge.id,
            reason: "Estorno insuficiente",
            idempotency_key: randomUUID(),
          })
        ).status >= 400,
      );
    },
  );
  await check(
    "custom roles assign shared defaults while individual denial affects one user only",
    async () => {
      const role = await ok("owner", "stock_save_role", {
        name: "Almoxarife Lider ficticio",
        permissions: [
          "estoque.visualizar",
          "entrada.visualizar",
          "entrada.registrar",
          "saida.visualizar",
          "saida.registrar",
          "historico.visualizar_proprio",
          "relatorios.exportar",
        ],
      });
      await ok("owner", "stock_assign_role", {
        user_id: fixture.users["no-contract"].id,
        role_id: role,
      });
      const unlinked = await ok("no-contract", "stock_context");
      assert.ok(unlinked.permissions.includes("entrada.registrar"));
      assert.deepEqual(unlinked.contracts, []);
      assert.deepEqual(unlinked.products, []);
      assert.equal(
        (await rpc("no-contract", "stock_post", await request("entrada", "1")))
          .status,
        403,
      );
      await ok("owner", "stock_assign_role", {
        user_id: fixture.users["no-contract"].id,
        role_id: "",
      });
      for (const u of ["warehouse", "reader"])
        await ok("owner", "stock_assign_role", {
          user_id: fixture.users[u].id,
          role_id: role,
        });
      await override(fixture.users.warehouse.id, "saida.registrar", "deny");
      assert.ok(
        !(await ok("warehouse", "stock_context")).permissions.includes(
          "saida.registrar",
        ),
      );
      assert.ok(
        (await ok("reader", "stock_context")).permissions.includes(
          "saida.registrar",
        ),
      );
      assert.equal(
        (await rpc("warehouse", "stock_post", await request())).status,
        403,
      );
      await override(fixture.users.warehouse.id, "saida.registrar", "inherit");
      await ok("owner", "stock_save_role", {
        id: role,
        name: "Cargo Lider Renomeado",
        permissions: [
          "estoque.visualizar",
          "entrada.visualizar",
          "entrada.registrar",
          "saida.visualizar",
          "saida.registrar",
          "historico.visualizar_proprio",
          "relatorios.exportar",
        ],
      });
      assert.equal(
        (await ok("warehouse", "stock_context")).role,
        "Cargo Lider Renomeado",
      );
      for (const u of ["warehouse", "reader"])
        await ok("owner", "stock_assign_role", {
          user_id: fixture.users[u].id,
          role_id: "",
        });
    },
  );
  await check(
    "stock denial also applies to direct SQL-backed stock API",
    async () => {
      await override(fixture.users.warehouse.id, "estoque.visualizar", "deny");
      const r = await rest("warehouse", "contract_balances_api");
      assert.deepEqual(r.body, []);
      await override(
        fixture.users.warehouse.id,
        "estoque.visualizar",
        "inherit",
      );
    },
  );
  await check(
    'entry registration is independent of general stock and exit permissions',
    async()=>{
      const role=await ok('owner','stock_save_role',{name:'Entrada sem consulta ficticia',permissions:['entrada.registrar']});
      await ok('owner','stock_assign_role',{user_id:fixture.users.reader.id,role_id:role});await link(fixture.users.reader.id,A,true);
      try{const c=await ok('reader','stock_context');assert.deepEqual(c.permissions,['entrada.registrar']);const b=c.balances.find(b=>b.contract_id===A&&b.product_id===P);assert.ok(b);assert.deepEqual((await rest('reader','contract_balances_api')).body,[]);const posted=await ok('reader','stock_post',{...await request('entrada','0.000001',b.quantity)});assert.equal(posted.before_quantity,b.quantity);assert.equal(posted.after_quantity,await balance())}finally{await ok('owner','stock_assign_role',{user_id:fixture.users.reader.id,role_id:''});await link(fixture.users.reader.id,A,false)}
    },
  );
  await check(
    "administrators cannot grant themselves create owners or exceed their ceiling",
    async () => {
      assert.equal(
        (
          await rpc("administrator", "stock_set_override", {
            user_id: fixture.users.administrator.id,
            permission: "saida.registrar",
            decision: "allow",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await rpc("administrator", "stock_set_override", {
            user_id: fixture.users.owner.id,
            permission: "saida.registrar",
            decision: "deny",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await rest("administrator", "rpc/admin_save_profile", "POST", {
            target_id: fixture.users.reader.id,
            new_name: "Ficticio",
            new_email: fixture.users.reader.email,
            new_role: "proprietario",
            new_active: true,
          })
        ).status,
        403,
      );
      await override(fixture.users.administrator.id, "saida.registrar", "deny");
      try {
        assert.equal(
          (
            await rpc("administrator", "stock_set_override", {
              user_id: fixture.users.reader.id,
              permission: "saida.registrar",
              decision: "allow",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await rpc("administrator", "stock_save_role", {
              name: "Above ceiling ficticio",
              permissions: ["saida.registrar"],
            })
          ).status,
          403,
        );
      } finally {
        await override(
          fixture.users.administrator.id,
          "saida.registrar",
          "inherit",
        );
      }
    },
  );
  await check(
    "custom role cannot indirectly modify its own administrator",
    async () => {
      const c = await ok("administrator", "stock_context");
      const id = await ok("owner", "stock_save_role", {
        name: "Gestor proprio ficticio",
        permissions: c.permissions,
      });
      await ok("owner", "stock_assign_role", {
        user_id: fixture.users.administrator.id,
        role_id: id,
      });
      try {
        assert.equal(
          (
            await rpc("administrator", "stock_save_role", {
              id,
              name: "Autoadministracao negada",
              permissions: c.permissions,
            })
          ).status,
          403,
        );
      } finally {
        await ok("owner", "stock_assign_role", {
          user_id: fixture.users.administrator.id,
          role_id: "",
        });
      }
    },
  );
  await check(
    "management capabilities are independent without exposing users or elevating grants",
    async () => {
      const uid = fixture.users.administrator.id;
      const target = fixture.users.reader.id;
      const changed = ["permissoes.gerenciar", "usuarios.visualizar", "usuarios.gerenciar", "cargos.gerenciar"];
      try {
        await override(uid, "permissoes.gerenciar", "deny");
        await override(uid, "usuarios.visualizar", "deny");
        const role = await ok("administrator", "stock_save_role", {
          name: "Cargo independente ficticio", permissions: ["estoque.visualizar"],
        });
        const snapshot = await ok("administrator", "stock_admin_snapshot", { scope: "roles" });
        assert.ok(snapshot.roles.some(r => r.id === role));
        assert.deepEqual(snapshot.users, []);
        assert.deepEqual(snapshot.links, []);
        assert.equal((await rpc("administrator", "stock_admin_snapshot")).status, 403);
        await ok("administrator", "stock_assign_role", { user_id: target, role_id: role });
        assert.equal((await rpc("administrator", "stock_set_override", { user_id: target, permission: "saida.registrar", decision: "deny" })).status, 403);
        await override(uid, "permissoes.gerenciar", "inherit");
        await override(uid, "usuarios.visualizar", "inherit");
        await override(uid, "usuarios.gerenciar", "deny");
        await override(uid, "cargos.gerenciar", "deny");
        await ok("administrator", "stock_set_override", { user_id: target, permission: "saida.registrar", decision: "deny" });
        assert.equal((await rpc("administrator", "stock_assign_role", { user_id: target, role_id: "" })).status, 403);
        assert.equal((await rpc("administrator", "stock_save_role", { id: role, name: "Negado", permissions: [] })).status, 403);
      } finally {
        for (const cap of changed) await override(uid, cap, "inherit");
        await ok("owner", "stock_assign_role", { user_id: target, role_id: "" });
        await override(target, "saida.registrar", "inherit");
      }
    },
  );
  await check(
    "inactive targets cannot bypass administrator grant ceiling",
    async () => {
      await override(fixture.users.administrator.id, "saida.registrar", "deny");
      await override(fixture.users.warehouse.id, "saida.registrar", "deny");
      await db.query("update public.profiles set active=false where id=$1", [
        fixture.users.warehouse.id,
      ]);
      try {
        assert.equal(
          (
            await rpc("administrator", "stock_set_override", {
              user_id: fixture.users.warehouse.id,
              permission: "saida.registrar",
              decision: "inherit",
            })
          ).status,
          403,
        );
      } finally {
        await db.query("update public.profiles set active=true where id=$1", [
          fixture.users.warehouse.id,
        ]);
        await override(
          fixture.users.warehouse.id,
          "saida.registrar",
          "inherit",
        );
        await override(
          fixture.users.administrator.id,
          "saida.registrar",
          "inherit",
        );
      }
    },
  );
  await check(
    "contract revocation and permission revocation affect existing JWT immediately",
    async () => {
      await link(fixture.users.warehouse.id, A, false);
      assert.equal(
        (await rpc("warehouse", "stock_post", await request())).status,
        403,
      );
      assert.deepEqual(
        (await ok("warehouse", "stock_history", { contract_id: A })).rows,
        [],
      );
      await link(fixture.users.warehouse.id, A, true);
      await override(fixture.users.warehouse.id, "entrada.registrar", "deny");
      assert.equal(
        (await rpc("warehouse", "stock_post", await request("entrada", "1")))
          .status,
        403,
      );
      await override(
        fixture.users.warehouse.id,
        "entrada.registrar",
        "inherit",
      );
    },
  );
  await check(
    "history filters preserve contract isolation and permission changes are audited",
    async () => {
      const h = await ok("warehouse", "stock_history", {
        contract_id: A,
        product_id: P,
        kind: "saida",
        actor_id: fixture.users.warehouse.id,
        from: "2020-01-01T00:00:00Z",
        to: "2100-01-01T00:00:00Z",
      });
      assert.ok(h.rows.length > 0);
      assert.ok(h.rows.every((r) => r.kind === "saida" && r.contract_id === A));
      assert.deepEqual(
        (await ok("warehouse", "stock_history", { contract_id: B })).rows,
        [],
      );
      const a = await ok("owner", "stock_admin_snapshot");
      assert.ok(
        a.audit.some(
          (a) =>
            a.entity === "stock_user_permissions" &&
            a.actor_id === fixture.users.owner.id,
        ),
      );
      assert.equal(
        (await rpc("warehouse", "stock_admin_snapshot")).status,
        403,
      );
    },
  );
  await check(
    "maximum precision stock movement and receipt remain exact text",
    async () => {
      const product = await create("products", {
          code: "MAX-" + randomUUID().slice(0, 8),
          description: "Fracionario ficticio",
          unit: "m",
        }),
        maximum = "999999999999999999.999999";
      const incoming = await ok("owner", "stock_post", {
        ...(await request("entrada", maximum, "0")),
        product_id: product.id,
      });
      assert.equal(incoming.quantity, maximum);
      assert.equal(incoming.after_quantity, maximum);
      const outgoing = await ok("warehouse", "stock_post", {
        ...(await request("saida", maximum, maximum)),
        product_id: product.id,
      });
      assert.equal(outgoing.before_quantity, maximum);
      assert.equal(outgoing.after_quantity, "0.000000");
    },
  );
  await check(
    "export endpoint independently checks export permission and contract scope",
    async () => {
      assert.equal((await rpc("reader", "stock_report", {})).status, 403);
      const report = await ok("warehouse", "stock_report", { contract_id: A });
      assert.ok(report.rows.length);
      assert.ok(
        report.rows.every(
          (r) =>
            r.contract_id === A &&
            !("request_hash" in r) &&
            !("idempotency_key" in r),
        ),
      );
      await override(fixture.users.warehouse.id, "relatorios.exportar", "deny");
      try {
        assert.equal(
          (await rpc("warehouse", "stock_report", { contract_id: A })).status,
          403,
        );
      } finally {
        await override(
          fixture.users.warehouse.id,
          "relatorios.exportar",
          "inherit",
        );
      }
    },
  );
  await check(
    "catalog unit cannot silently change after movements",
    async () => {
      assert.ok(
        (await rest("owner", "products?id=eq." + P, "PATCH", { unit: "un" }))
          .status >= 400,
      );
    },
  );
  process.env.VITE_JP_ONLINE_LOCAL = "true";
  process.env.VITE_SUPABASE_URL = fixture.api;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = fixture.anon;
  const { createServer } = await import("vite");
  server = await createServer({
    server: { host: "127.0.0.1", port: 5193, strictPort: true },
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1360, height: 900 },
      ...(mobile ? { isMobile: true, hasTouch: true } : {}),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const login = async (role) => {
      await page.goto("http://127.0.0.1:5193/code/html/index.html");
      await page.locator("#email").fill(fixture.users[role].email);
      await page.locator("#password").fill(fixture.users[role].password);
      await page.locator("#loginForm button").click();
      await page.locator("#sessionControls").waitFor();
    };
    await check(
      `Chromium ${mobile ? "mobile" : "desktop"} real warehouse entry exit receipt and history`,
      async () => {
        await login("warehouse");
        await page.locator("#stockNav-entrada").click();
        await page.locator("#stock-contract_id").selectOption(A);
        await page.locator("#stock-product_id").selectOption(P);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.equal(
          await page.locator("#stock-actor").inputValue(),
          "Ficticio warehouse",
        );
        assert.equal(
          await page.locator("#stock-code").getAttribute("readonly"),
          "",
        );
        await page.locator("#stock-quantity").fill("1,000001");
        await page.locator("#stockReview").click();
        await page.locator("#stockConfirm").click();
        await page.waitForFunction(() =>
          document
            .querySelector("#stockStatus")
            ?.textContent?.includes("Movimentação confirmada"),
        );
        const row = page.locator("[data-movement-id]").last();
        const dl = page.waitForEvent("download");
        await row
          .getByRole("button", { name: "Baixar comprovante JSON" })
          .click();
        const file = await dl;
        const receipt = JSON.parse(await readFile(await file.path(), "utf8"));
        assert.equal(receipt.quantity, "1.000001");
        assert.equal(receipt.actor_id, fixture.users.warehouse.id);
        await page.locator("#stockNav-saida").click();
        await page.locator("#stock-contract_id").selectOption(A);
        await page.locator("#stock-product_id").selectOption(P);
        await page.locator("#stock-quantity").fill("0,000001");
        await page.locator("#stock-destination").fill("Bloco A ficticio");
        await page.locator("#stock-recipient").fill("Pessoa Ficticia Completa");
        await page.locator("#stock-recipient_company").fill("Empresa Ficticia");
        await page.locator("#stockReview").click();
        await page.locator("#stockConfirm").click();
        await page.waitForFunction(() =>
          document
            .querySelector("#stockStatus")
            ?.textContent?.includes("Movimentação confirmada"),
        );
        await page.locator("#stockNav-history").click();
        await page.locator("#stockHistoryFilters").waitFor();
        await page
          .locator("#onlineStockWorkspace")
          .filter({ hasText: "Pessoa Ficticia Completa" })
          .waitFor();
        assert.ok(
          (await page.locator("#onlineStockWorkspace").textContent()).includes(
            "Pessoa Ficticia Completa",
          ),
        );
        await override(fixture.users.warehouse.id, "historico.visualizar_proprio", "deny");
        try {
          await page.locator("#stockNav-reports").click();
          await page.locator('#stockNav-reports[aria-current="page"]').waitFor();
          await page.locator("#stockHistoryFilters").waitFor();
          assert.equal(await page.locator("#stockNav-history").isVisible(), false);
          assert.equal(await page.locator("#stockNav-reports").isVisible(), true);
        } finally {
          await override(fixture.users.warehouse.id, "historico.visualizar_proprio", "inherit");
        }
        await page.locator("#logoutOnline").click();
        await page.locator("#onlineLogin").waitFor();
        assert.equal(await page.locator("#stockMovementForm").count(), 0);
      },
    );
    await check(
      `Chromium ${mobile ? "mobile" : "desktop"} owner manages role and per-user permission with confirmation`,
      async () => {
        await login("owner");
        await page.locator("#stockNav-roles").click();
        const newRoleName = "Supervisor UI " + randomUUID().slice(0, 8);
        await page.locator("#stock-name").fill(newRoleName);
        await page
          .locator('#stockRoleForm input[name="estoque.visualizar"]')
          .check();
        await page.locator("#stockSaveRole").click();
        await page.locator("#stockConfirm").click();
        await page.waitForFunction(
          (name) =>
            [...document.querySelectorAll("#stock-id option")].some(
              (n) => n.textContent === name,
            ),
          newRoleName,
        );
        await page.locator("#stockNav-users").click();
        await page
          .locator("#stock-user_id")
          .selectOption(fixture.users.reader.id);
        await page
          .locator("#stock-permission")
          .selectOption("entrada.registrar");
        await page.locator("#stock-decision").selectOption("allow");
        await page
          .getByRole("button", { name: "Aplicar ajuste individual" })
          .click();
        await page.locator("#stockConfirm").click();
        await page.waitForFunction(
          () => document.querySelector("#stock-user_id")?.value === "",
        );
        assert.ok(
          (await ok("reader", "stock_context")).permissions.includes(
            "entrada.registrar",
          ),
        );
        await override(fixture.users.reader.id, "entrada.registrar", "inherit");
        await page.locator("#logoutOnline").click();
        await page.locator("#onlineLogin").waitFor();
      },
    );
    await check(
      `Chromium ${mobile ? "mobile" : "desktop"} reader cannot open operational or administrative menus`,
      async () => {
        await login("reader");
        assert.equal(
          await page.locator("#stockNav-entrada").isVisible(),
          false,
        );
        assert.equal(await page.locator("#stockNav-saida").isVisible(), false);
        assert.equal(await page.locator("#stockNav-users").isVisible(), false);
        assert.equal(await page.locator("#onlineAdmin").isVisible(), false);
      },
    );
    await context.close();
  }
} catch (e) {
  process.exitCode = 1;
  let safe = redactDiagnostic(String(e.message));
  for (const u of Object.values(fixture?.users || {}))
    safe = safe.replaceAll(u.password, "[REDACTED]");
  console.error(safe.slice(0, 2000));
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  if (db) await db.end();
  const report = {
    version: "1.1.0",
    realAuth: true,
    realPostgrest: true,
    realChromium: true,
    status: process.exitCode ? "failed" : "passed",
    pilotReady: false,
    executed: cases.length,
    blocked: process.exitCode ? Math.max(0, 29 - cases.length) : 0,
    passed: cases.filter((c) => c.status === "passed").length,
    failed: cases.filter((c) => c.status === "failed").length,
    cases,
    recordedAt: new Date().toISOString(),
  };
  await writeFile(
    "test-results/stock-results.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    "Stock scenarios: " +
      report.passed +
      " passed, " +
      report.failed +
      " failed",
  );
}
