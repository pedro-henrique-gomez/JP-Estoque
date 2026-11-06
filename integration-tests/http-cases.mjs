import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { requiredCases } from "./cases.mjs";

export async function executeCases({ api, anon, service, db }) {
  assert.equal(new URL(api).hostname, "127.0.0.1");
  const evidence = [],
    users = {};
  const http = {};
  const password = randomBytes(24).toString("hex");
  async function request(
    path,
    { token = anon, method = "GET", body, admin = false, headers = {} } = {},
  ) {
    const response = await fetch(api + path, {
      method,
      headers: {
        apikey: admin ? service : anon,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    const key = `${method} ${path.split("?")[0]} ${response.status}`;
    http[key] = (http[key] ?? 0) + 1;
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: response.status, data };
  }
  const ok = (r) => {
    assert.ok(r.status >= 200 && r.status < 300, `Unexpected HTTP ${r.status}`);
    return r.data;
  };
  const denied = (r) =>
    assert.ok(
      [400, 401, 403, 404, 406].includes(r.status),
      `Expected denial, received ${r.status}`,
    );
  async function login(u) {
    const data = ok(
      await request("/auth/v1/token?grant_type=password", {
        method: "POST",
        body: { email: u.email, password },
      }),
    );
    assert.ok(data.access_token && data.refresh_token);
    return data;
  }
  async function token(u) {
    if (!u.session || u.session.expires_at * 1000 - Date.now() < 15000)
      u.session = await login(u);
    return u.session.access_token;
  }
  const rest = async (u, path, opts = {}) =>
    request("/rest/v1/" + path, { ...opts, token: await token(u) });
  const rows = async (u, table) => ok(await rest(u, table + "?select=*"));
  const roles = [
    "funcionario_autorizado",
    "almoxarife",
    "coordenador",
    "planejamento",
    "diretor",
    "administrador",
    "proprietario",
  ];
  for (const role of [...roles, "inactive", "no-contract", "target"]) {
    const email = `${role}-${randomUUID()}@example.invalid`;
    const identity = ok(
      await request("/auth/v1/admin/users", {
        admin: true,
        token: service,
        method: "POST",
        body: { email, password, email_confirm: true },
      }),
    );
    assert.ok(identity.id);
    users[role] = { id: identity.id, email };
    await db.query(
      "insert into public.profiles(id,name,email,role,active) values($1,$2,$3,$4,$5)",
      [
        identity.id,
        `Ficticio ${role}`,
        email,
        roles.includes(role) ? role : "funcionario_autorizado",
        role !== "inactive",
      ],
    );
  }
  const ids = {};
  for (const key of [
    "a",
    "b",
    "pa",
    "pb",
    "sa",
    "sb",
    "la",
    "lb",
    "ba",
    "bb",
    "ra",
    "rb",
    "batch",
    "row",
  ])
    ids[key] = randomUUID();
  for (const suffix of ["a", "b"]) {
    await db.query("insert into public.contracts(id,name) values($1,$2)", [
      ids[suffix],
      `Ficticio contrato ${suffix}`,
    ]);
    await db.query(
      "insert into public.products(id,code,description,unit) values($1,$2,$3,'m')",
      [ids["p" + suffix], `TEST-${suffix}`, `Material ficticio ${suffix}`],
    );
    await db.query("insert into public.suppliers(id,name) values($1,$2)", [
      ids["s" + suffix],
      `Fornecedor ficticio ${suffix}`,
    ]);
    await db.query(
      "insert into public.locations(id,contract_id,code) values($1,$2,$3)",
      [ids["l" + suffix], ids[suffix], `L-${suffix}`],
    );
    await db.query(
      "insert into public.contract_balances(id,product_id,contract_id,quantity,location_id,supplier_id) values($1,$2,$3,1.250001,$4,$5)",
      [
        ids["b" + suffix],
        ids["p" + suffix],
        ids[suffix],
        ids["l" + suffix],
        ids["s" + suffix],
      ],
    );
    await db.query(
      "insert into public.balance_references(id,balance_id,contract_id,kind,reference) values($1,$2,$3,'nf',$4)",
      [
        ids["r" + suffix],
        ids["b" + suffix],
        ids[suffix],
        `NF-FICTICIA-${suffix}`,
      ],
    );
  }
  for (const role of [...roles, "inactive"])
    await db.query(
      "insert into public.user_contracts(user_id,contract_id) values($1,$2)",
      [users[role].id, ids.a],
    );
  await db.query(
    "insert into public.import_batches(id,created_by,source_file,sheet_name) values($1,$2,'ficticio.xlsx','teste')",
    [ids.batch, users.administrador.id],
  );
  await db.query(
    "insert into public.import_rows(id,batch_id,source_line,contract_id,product_id,status) values($1,$2,1,$3,$4,'success')",
    [ids.row, ids.batch, ids.b, ids.pb],
  );
  await db.query(
    "insert into public.system_settings(system_name,support_email) values('Ficticio','teste@example.invalid')",
  );
  await db.query("notify pgrst, 'reload schema'");
  const reader = users.funcionario_autorizado,
    admin = users.administrador;
  const rpc = (u, name, body) =>
    rest(u, "rpc/" + name, { method: "POST", body });
  const profile = (u, role = "funcionario_autorizado", active = true) => ({
    target_id: u.id,
    new_name: "Ficticio alvo",
    new_email: u.email,
    new_role: role,
    new_active: active,
  });
  const expiredSession = await login(users.target);
  ok(
    await request("/rest/v1/contracts", { token: expiredSession.access_token }),
  );
  const checks = {
    "login-correct": async () => {
      reader.session = await login(reader);
      assert.equal(reader.session.user.id, reader.id);
    },
    "login-incorrect": async () =>
      denied(
        await request("/auth/v1/token?grant_type=password", {
          method: "POST",
          body: { email: reader.email, password: password + "wrong" },
        }),
      ),
    "jwt-valid": async () =>
      assert.equal((await rows(reader, "contracts"))[0].id, ids.a),
    "jwt-invalid": async () => {
      const t = await token(reader);
      const parts = t.split(".");
      parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
      denied(await request("/rest/v1/contracts", { token: parts.join(".") }));
    },
    refresh: async () => {
      const s = await login(users.target);
      const next = ok(
        await request("/auth/v1/token?grant_type=refresh_token", {
          method: "POST",
          body: { refresh_token: s.refresh_token },
        }),
      );
      assert.ok(next.access_token && next.refresh_token);
      ok(await request("/auth/v1/user", { token: next.access_token }));
    },
    logout: async () => {
      const s = await login(users.target);
      ok(
        await request("/auth/v1/logout?scope=global", {
          method: "POST",
          token: s.access_token,
        }),
      );
      denied(
        await request("/auth/v1/token?grant_type=refresh_token", {
          method: "POST",
          body: { refresh_token: s.refresh_token },
        }),
      );
    },
    inactive: async () => {
      for (const t of [
        "contracts",
        "products",
        "contract_balances",
        "suppliers",
        "locations",
        "balance_references",
        "import_batches",
        "audit_events",
      ])
        assert.deepEqual(await rows(users.inactive, t), []);
      denied(
        await rpc(users.inactive, "admin_save_profile", profile(users.target)),
      );
    },
    "no-contract": async () => {
      for (const t of [
        "contracts",
        "products",
        "contract_balances",
        "suppliers",
        "locations",
        "balance_references",
      ])
        assert.deepEqual(await rows(users["no-contract"], t), []);
    },
    metadata: async () => {
      ok(
        await request("/auth/v1/user", {
          method: "PUT",
          token: await token(reader),
          body: {
            data: { role: "proprietario", active: true, contracts: [ids.b] },
          },
        }),
      );
      reader.session = await login(reader);
      assert.equal(reader.session.user.user_metadata.role, "proprietario");
      const forgedMetadata = await request("/auth/v1/user", {
        method: "PUT",
        token: await token(reader),
        body: { app_metadata: { role: "proprietario" }, role: "service_role" },
      });
      if (forgedMetadata.status >= 400) denied(forgedMetadata);
      const identity = ok(
        await request("/auth/v1/user", { token: await token(reader) }),
      );
      assert.notEqual(identity.app_metadata.role, "proprietario");
      assert.equal(identity.role, "authenticated");
      assert.equal((await rows(reader, "contracts")).length, 1);
      assert.equal(
        (await rows(reader, "profiles"))[0].role,
        "funcionario_autorizado",
      );
      denied(
        await rpc(
          reader,
          "admin_save_profile",
          profile(users.target, "proprietario"),
        ),
      );
    },
    "self-promotion": async () => {
      for (const u of [reader, admin, users.proprietario]) {
        denied(
          await rest(u, `profiles?id=eq.${u.id}`, {
            method: "PATCH",
            body: { role: "proprietario" },
          }),
        );
        denied(await rpc(u, "admin_save_profile", profile(u, "proprietario")));
      }
    },
    "cross-contract": async () => {
      for (const table of [
        "contracts",
        "locations",
        "contract_balances",
        "balance_references",
      ]) {
        const key = table === "contracts" ? "id" : "contract_id";
        assert.deepEqual(
          ok(await rest(reader, `${table}?${key}=eq.${ids.b}&select=*`)),
          [],
        );
      }
      denied(
        await rest(reader, "contract_balances", {
          method: "POST",
          body: { product_id: ids.pb, contract_id: ids.b, quantity: 1 },
        }),
      );
    },
    "rpc-allowed": async () => {
      for (const u of [admin, users.proprietario]) {
        ok(await rpc(u, "admin_save_profile", profile(users.target)));
        ok(
          await rpc(u, "admin_set_user_contract", {
            target_id: users.target.id,
            target_contract: ids.a,
            authorized: true,
          }),
        );
        assert.equal((await rows(users.target, "contracts")).length, 1);
      }
    },
    "rpc-denied": async () => {
      for (const u of [reader, users.diretor, admin]) {
        const target = u === admin ? admin : users.target;
        denied(
          await rpc(u, "admin_save_profile", profile(target, "proprietario")),
        );
        denied(
          await rpc(u, "admin_set_user_contract", {
            target_id: target.id,
            target_contract: ids.b,
            authorized: true,
          }),
        );
      }
    },
    revocation: async () => {
      const t = await token(reader);
      ok(
        await rpc(admin, "admin_set_user_contract", {
          target_id: reader.id,
          target_contract: ids.a,
          authorized: false,
        }),
      );
      assert.deepEqual(
        ok(await request("/rest/v1/contract_balances?select=*", { token: t })),
        [],
      );
      ok(
        await rpc(admin, "admin_set_user_contract", {
          target_id: reader.id,
          target_contract: ids.a,
          authorized: true,
        }),
      );
      assert.equal(
        ok(await request("/rest/v1/contract_balances?select=*", { token: t }))
          .length,
        1,
      );
      ok(
        await rpc(
          admin,
          "admin_save_profile",
          profile(reader, "funcionario_autorizado", false),
        ),
      );
      assert.deepEqual(
        ok(await request("/rest/v1/contracts?select=*", { token: t })),
        [],
      );
      denied(
        await request("/rest/v1/rpc/admin_save_profile", {
          token: t,
          method: "POST",
          body: profile(users.target),
        }),
      );
      ok(await rpc(admin, "admin_save_profile", profile(reader)));
      const administrativeToken = await token(admin);
      ok(
        await rpc(
          users.proprietario,
          "admin_save_profile",
          profile(admin, "administrador", false),
        ),
      );
      denied(
        await request("/rest/v1/rpc/admin_save_profile", {
          method: "POST",
          token: administrativeToken,
          body: profile(users.target),
        }),
      );
      assert.deepEqual(
        ok(await request("/rest/v1/contracts", { token: administrativeToken })),
        [],
      );
      ok(
        await rpc(
          users.proprietario,
          "admin_save_profile",
          profile(admin, "administrador", true),
        ),
      );
    },
    "api-exposure": async () => {
      const expected = {
        contracts: ids.a,
        products: ids.pa,
        suppliers: ids.sa,
        locations: ids.la,
        contract_balances: ids.ba,
        balance_references: ids.ra,
        contract_balances_api: ids.ba,
      };
      for (const [table, id] of Object.entries(expected)) {
        const data = await rows(reader, table);
        assert.equal(data.length, 1, table);
        assert.equal(data[0].id, id, table);
        denied(await request("/rest/v1/" + table + "?select=*"));
      }
      for (const t of [
        "import_batches",
        "import_rows",
        "audit_events",
        "system_settings",
      ])
        assert.deepEqual(await rows(reader, t), []);
      assert.equal((await rows(reader, "profiles")).length, 1);
      assert.equal((await rows(reader, "user_contracts")).length, 1);
      const embed = ok(
        await rest(
          reader,
          "products?select=id,contract_balances(contract_id,quantity,locations(code),suppliers(name),balance_references(reference))",
        ),
      );
      assert.equal(embed.length, 1);
      assert.ok(
        embed[0].contract_balances.every((x) => x.contract_id === ids.a),
      );
      for (const fn of [
        "is_admin",
        "can_read_contract",
        "require_other_user_admin",
      ])
        denied(await rpc(reader, fn, { target: ids.b }));
      denied(
        await rest(reader, "administration_mutex?select=*", {
          headers: { "Accept-Profile": "private" },
        }),
      );
      const spec = ok(await rest(admin, ""));
      assert.equal(typeof spec, "object");
      assert.deepEqual(
        Object.keys(spec.paths)
          .filter((p) => p.startsWith("/rpc/"))
          .sort(),
        ["/rpc/admin_import_commit", "/rpc/admin_import_preview", "/rpc/admin_save_profile", "/rpc/admin_set_user_contract"],
      );
      assert.ok(
        !JSON.stringify(spec).includes("/rpc/require_other_user_admin"),
      );
    },
    history: async () => {
      assert.ok((await rows(admin, "audit_events")).length > 0);
      for (const u of [admin, users.proprietario, reader]) {
        denied(
          await rest(u, "audit_events", {
            method: "POST",
            body: { entity: "fake", operation: "INSERT" },
          }),
        );
        denied(
          await rest(u, "audit_events?id=not.is.null", {
            method: "PATCH",
            body: { entity: "fake" },
          }),
        );
        denied(
          await rest(u, "audit_events?id=not.is.null", { method: "DELETE" }),
        );
        denied(
          await rest(u, `import_rows?id=eq.${ids.row}`, { method: "DELETE" }),
        );
      }
    },
    "profile-matrix": async () => {
      for (const role of roles) {
        const u = users[role],
          all = ["diretor", "administrador", "proprietario"].includes(role);
        for (const table of [
          "contracts",
          "contract_balances",
          "contract_balances_api",
          "products",
          "suppliers",
          "locations",
          "balance_references",
        ])
          assert.equal(
            (await rows(u, table)).length,
            all ? 2 : 1,
            `${role}:${table}`,
          );
        const candidate = {
          code: "CRUD-" + role,
          description: "Material ficticio teste",
          unit: "un",
        };
        const result = await rest(u, "products", {
          method: "POST",
          body: candidate,
          headers: { Prefer: "return=representation" },
        });
        if (["administrador", "proprietario"].includes(role)) {
          const created = ok(result)[0];
          ok(
            await rest(u, `products?id=eq.${created.id}`, {
              method: "PATCH",
              body: { description: "Editado ficticio" },
            }),
          );
          ok(
            await rest(u, `products?id=eq.${created.id}`, { method: "DELETE" }),
          );
        } else denied(result);
      }
    },
    "jwt-expired": async () => {
      const payload = JSON.parse(
        Buffer.from(expiredSession.access_token.split(".")[1], "base64url"),
      );
      assert.equal(
        payload.exp - payload.iat,
        60,
        "Only the isolated 60-second TTL is allowed",
      );
      const deadline = payload.exp * 1000 + 32000;
      assert.ok(deadline - Date.now() < 95000, "Test TTL exceeds safe wait");
      while (Date.now() < deadline) {
        console.log(
          "Waiting for natural JWT expiration plus PostgREST clock skew",
        );
        await new Promise((r) =>
          setTimeout(r, Math.min(15000, deadline - Date.now())),
        );
      }
      const response = await request("/rest/v1/contracts", {
        token: expiredSession.access_token,
      });
      assert.equal(response.status, 401);
      assert.match(response.data.message, /expired/i);
    },
  };
  // Natural expiration runs last, after useful work. Credentials stay in memory.
  for (const id of [
    ...requiredCases.map((c) => c.id).filter((id) => id !== "jwt-expired"),
    "jwt-expired",
  ]) {
    const start = Date.now();
    try {
      await checks[id]();
      evidence.push({ id, status: "passed", durationMs: Date.now() - start });
      console.log(`PASS ${id}`);
    } catch (e) {
      evidence.push({
        id,
        status: "failed",
        message: e.message,
        durationMs: Date.now() - start,
      });
      console.log(`FAIL ${id}: ${e.message}`);
    }
  }
  return { cases: evidence, http };
}
