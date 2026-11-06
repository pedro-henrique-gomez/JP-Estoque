import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { join } from "node:path";
import assert from "node:assert/strict";
import pg from "pg";
import {
  localOnlyEnvironment,
  redactDiagnostic,
} from "../integration-tests/preflight.mjs";
import { assertWorkspace, checkPorts } from "../integration-tests/safety.mjs";
const exec = promisify(execFile),
  root = process.cwd();
const p = JSON.parse(await readFile(".integration-local/current.json", "utf8"));
assertWorkspace(root, p.workspace);
const env = localOnlyEnvironment(process.env, p.workspace);
export async function prepareOnlineFixture() {
  await checkPorts([5183]);
  const { stdout } = await exec(
    process.execPath,
    [
      join(root, "node_modules/supabase/dist/supabase.js"),
      "status",
      "--workdir",
      p.workspace,
      "--output",
      "json",
    ],
    { env, windowsHide: true },
  );
  const s = JSON.parse(stdout);
  assert.equal(new URL(s.API_URL).origin, "http://127.0.0.1:56321");
  assert.equal(new URL(s.DB_URL).hostname, "127.0.0.1");
  assert.equal(new URL(s.DB_URL).port, "56322");
  const db = new pg.Client({ connectionString: s.DB_URL });
  await db.connect();
  const fixture = {
    users: {},
    a: randomUUID(),
    b: randomUUID(),
    api: s.API_URL,
    anon: s.ANON_KEY,
  };
  try {
    for (const role of ["reader", "owner", "inactive", "no-contract"]) {
      const email = `v07-${role}-${randomUUID()}@example.invalid`,
        password = randomBytes(24).toString("hex");
      const res = await fetch(s.API_URL + "/auth/v1/admin/users", {
        method: "POST",
        headers: {
          apikey: s.SERVICE_ROLE_KEY,
          Authorization: `Bearer ${s.SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      assert.equal(res.status, 200);
      const identity = await res.json();
      fixture.users[role] = { id: identity.id, email, password };
      await db.query(
        "insert into public.profiles(id,name,email,role,active) values($1,$2,$3,$4,$5)",
        [
          identity.id,
          "Ficticio " + role,
          email,
          role === "owner" ? "proprietario" : "funcionario_autorizado",
          role !== "inactive",
        ],
      );
    }
    for (const suffix of ["a", "b"]) {
      const product = randomUUID(),
        location = randomUUID(),
        supplier = randomUUID(),
        balance = randomUUID();
      await db.query("insert into public.contracts(id,name) values($1,$2)", [
        fixture[suffix],
        `Contrato ficticio ${suffix.toUpperCase()}`,
      ]);
      await db.query(
        "insert into public.products(id,code,description,unit,category,manufacturer) values($1,$2,$3,'m','Eletrica','Fabricante ficticio')",
        [
          product,
          `ONLINE-${suffix.toUpperCase()}`,
          `Material online ${suffix.toUpperCase()}`,
        ],
      );
      await db.query(
        "insert into public.locations(id,contract_id,code,description) values($1,$2,$3,$4)",
        [location, fixture[suffix], `L-${suffix}`, "Local ficticio"],
      );
      await db.query("insert into public.suppliers(id,name) values($1,$2)", [
        supplier,
        `Fornecedor ficticio ${suffix}`,
      ]);
      await db.query(
        "insert into public.contract_balances(id,product_id,contract_id,quantity,location_id,supplier_id) values($1,$2,$3,1.250001,$4,$5)",
        [balance, product, fixture[suffix], location, supplier],
      );
      await db.query(
        "insert into public.balance_references(balance_id,contract_id,kind,reference) values($1,$2,'nf',$3)",
        [balance, fixture[suffix], `NF-ONLINE-${suffix}`],
      );
    }
    await db.query(
      "insert into public.user_contracts(user_id,contract_id) values($1,$2)",
      [fixture.users.reader.id, fixture.a],
    );
    const versions = (
      await db.query(
        "select version from supabase_migrations.schema_migrations order by version",
      )
    ).rows;
    assert.equal(versions.length, 4);
    const hash = (b) => createHash("sha256").update(b).digest("hex");
    assert.equal(
      hash(await readFile("supabase/config.toml")),
      p.originalConfigHash,
    );
    for (const m of p.migrations)
      assert.equal(
        hash(await readFile(join("supabase/migrations", m.name))),
        m.sha256,
      );
  } finally {
    await db.end();
  }
  return { fixture, env, workspace: p.workspace };
}
