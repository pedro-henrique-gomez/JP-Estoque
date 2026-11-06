import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, randomUUID, createHmac, createHash } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import * as XLSX from "xlsx";
import ts from "typescript";
import { pathToFileURL } from "node:url";
import { prepareOnlineFixture } from "../online-tests/environment.mjs";
import {
  localOnlyEnvironment,
  redactDiagnostic,
} from "../integration-tests/preflight.mjs";
import {
  encryptArchive,
  decryptArchive,
} from "../scripts/operations/archive.mjs";
import { operationEvent } from "../scripts/operations/events.mjs";
const exec = promisify(execFile),
  p = JSON.parse(await readFile(".integration-local/current.json", "utf8"));
for (const name of ["online-import-types", "online-xlsx-parser"]) {
  const source = await readFile("code/ts/" + name + ".ts", "utf8");
  const result = ts
    .transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    })
    .outputText.replace("./online-import-types", "./online-import-types.mjs");
  await writeFile(join(p.workspace, name + ".mjs"), result);
}
const { parseOnlineWorkbook } = await import(
  pathToFileURL(join(p.workspace, "online-xlsx-parser.mjs")).href
);
const env = localOnlyEnvironment(process.env, p.workspace),
  cases = [],
  metrics = {};
let db, restored, restoreName, server, browser;
async function check(name, event, fn) {
  const start = performance.now();
  try {
    await fn();
    cases.push({
      name,
      ...operationEvent(event, performance.now() - start, "passed"),
    });
    console.log("PASS " + name);
  } catch (e) {
    cases.push({
      name,
      ...operationEvent(event, performance.now() - start, "failed"),
      error: String(e.code || "ASSERTION_OR_OPERATION_FAILED").slice(0, 80),
    });
    console.log("FAIL " + name);
    throw e;
  }
}
let f, s, owner, client;
async function http(
  path,
  { method = "GET", token = owner, data, admin = false } = {},
) {
  const response = await fetch(f.api + path, {
    method,
    headers: {
      apikey: admin ? s.SERVICE_ROLE_KEY : f.anon,
      Authorization: "Bearer " + (admin ? s.SERVICE_ROLE_KEY : token || f.anon),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, body };
}
async function rest(path, options) {
  return http("/rest/v1/" + path, options);
}
async function rpc(name, data) {
  const r = await rest("rpc/admin_import_" + name, { method: "POST", data });
  assert.equal(r.status, 200, "RPC HTTP status");
  return r.body;
}
const row = (code, q = "1.250001", line = 2) => ({
  code,
  description: "Ficticio " + code,
  unit: "m",
  quantity: q,
  line,
  action: "add",
  discard: false,
  decided: true,
});
const request = (destination, rows) => ({
  destination,
  rows,
  file_name: "ficticio.xlsx",
  file_sha256: "a".repeat(64),
  sheet_name: "Dados",
});
async function contract() {
  const r = await rest("contracts", {
    method: "POST",
    data: { name: "Ficticio readiness " + randomUUID() },
  });
  assert.equal(r.status, 201);
  return r.body[0].id;
}
function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.toUpperCase().replace(/=+$/, ""))
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = Buffer.from(
    (bits.match(/.{8}/g) || []).map((v) => parseInt(v, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", bytes).update(counter).digest(),
    offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
async function dumpContainer(container) {
  return (
    await exec(
      "docker",
      [
        "exec",
        container,
        "pg_dump",
        "-U",
        "postgres",
        "-Fc",
        "--dbname=postgres",
      ],
      { env, windowsHide: true, encoding: "buffer", maxBuffer: 32 * 1024 ** 2 },
    )
  ).stdout;
}
async function restoreContainer(container, bytes) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        container,
        "pg_restore",
        "-U",
        "supabase_admin",
        "--exit-on-error",
        "--dbname=" + restoreName,
      ],
      { env, windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
    );
    let diagnostic = "";
    child.stderr.on("data", (b) => {
      diagnostic += b.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            Object.assign(
              Error(
                "Restore failed: " +
                  (
                    diagnostic.match(/ERROR:[^\r\n]+/)?.[0] ||
                    diagnostic.split(/\r?\n/)[0] ||
                    "unknown"
                  ).slice(0, 300),
              ),
              { code: "RESTORE_FAILED" },
            ),
          ),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(bytes);
  });
}
async function fingerprint(c) {
  const tables = (
    await c.query(
      "select table_schema,table_name from information_schema.tables where table_schema in ('public','private','auth','supabase_migrations') and table_type='BASE TABLE' order by 1,2",
    )
  ).rows;
  const state = {};
  for (const t of tables) {
    const table = '"' + t.table_schema + '"."' + t.table_name + '"';
    const rows = (
      await c.query(
        `select coalesce(jsonb_agg(x order by x::text),'[]'::jsonb)::text payload from (select to_jsonb(t) x from ${table} t) z`,
      )
    ).rows[0].payload;
    state[t.table_schema + "." + t.table_name] = createHash("sha256")
      .update(rows)
      .digest("hex");
  }
  return state;
}
try {
  ({ fixture: f } = await prepareOnlineFixture());
  s = JSON.parse(
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
  assert.equal(new URL(s.DB_URL).hostname, "127.0.0.1");
  assert.equal(new URL(s.DB_URL).port, "56322");
  db = new pg.Client({ connectionString: s.DB_URL });
  await db.connect();
  client = createClient(f.api, f.anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  let login = await client.auth.signInWithPassword(f.users.owner);
  assert.ifError(login.error);
  owner = login.data.session.access_token;
  await check(
    "public signup is denied and does not provision an account",
    "auth",
    async () => {
      const before = (await db.query("select count(*)::int n from auth.users"))
        .rows[0].n;
      const r = await http("/auth/v1/signup", {
        method: "POST",
        data: {
          email: "not-created-" + randomUUID() + "@example.invalid",
          password: randomBytes(24).toString("base64"),
        },
      });
      assert.ok([400, 403, 422].includes(r.status));
      assert.equal(
        (await db.query("select count(*)::int n from auth.users")).rows[0].n,
        before,
      );
    },
  );
  await check(
    "trusted invitation confirms address; no public profile elevation",
    "auth",
    async () => {
      const email = "invite-" + randomUUID() + "@example.invalid";
      const r = await http("/auth/v1/admin/generate_link", {
        method: "POST",
        admin: true,
        data: { type: "invite", email },
      });
      assert.equal(r.status, 200);
      const v = await http("/auth/v1/verify", {
        method: "POST",
        data: { type: "invite", token_hash: r.body.hashed_token },
      });
      assert.equal(v.status, 200);
      assert.ok(v.body.user.email_confirmed_at);
      const pr = await rest("profiles?id=eq." + v.body.user.id, {
        token: v.body.access_token,
      });
      assert.deepEqual(pr.body, []);
      const rpcDenied = await rest("rpc/admin_import_preview", {
        method: "POST",
        token: v.body.access_token,
        data: { request: {} },
      });
      assert.equal(rpcDenied.status, 403);
    },
  );
  await check(
    "unconfirmed email cannot login in confirmation-enabled drill",
    "auth",
    async () => {
      const email = "pending-" + randomUUID() + "@example.invalid",
        password = randomBytes(24).toString("base64");
      const created = await http("/auth/v1/admin/users", {
        method: "POST",
        admin: true,
        data: { email, password, email_confirm: false },
      });
      assert.equal(created.status, 200);
      const r = await http("/auth/v1/token?grant_type=password", {
        method: "POST",
        data: { email, password },
      });
      assert.equal(r.status, 400);
      assert.equal(r.body.error_code, "email_not_confirmed");
    },
  );
  await check(
    "recovery token is genuine single-use and changes password",
    "auth",
    async () => {
      const u = f.users["no-contract"],
        newPassword = randomBytes(24).toString("base64");
      const link = await http("/auth/v1/admin/generate_link", {
        method: "POST",
        admin: true,
        data: { type: "recovery", email: u.email },
      });
      assert.equal(link.status, 200);
      const recovered = await http("/auth/v1/verify", {
        method: "POST",
        data: { type: "recovery", token_hash: link.body.hashed_token },
      });
      assert.equal(recovered.status, 200);
      const reused = await http("/auth/v1/verify", {
        method: "POST",
        data: { type: "recovery", token_hash: link.body.hashed_token },
      });
      assert.ok(!reused.ok);
      assert.equal(
        (
          await http("/auth/v1/user", {
            method: "PUT",
            token: recovered.body.access_token,
            data: { password: newPassword },
          })
        ).status,
        200,
      );
      assert.ok(
        !(
          await http("/auth/v1/token?grant_type=password", {
            method: "POST",
            data: { email: u.email, password: u.password },
          })
        ).ok,
      );
      assert.equal(
        (
          await http("/auth/v1/token?grant_type=password", {
            method: "POST",
            data: { email: u.email, password: newPassword },
          })
        ).status,
        200,
      );
    },
  );
  await check(
    "TOTP enroll challenge verify issues genuine AAL2 session",
    "auth",
    async () => {
      const enrolled = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Ficticio local readiness",
      });
      assert.ifError(enrolled.error);
      const challenge = await client.auth.mfa.challenge({
        factorId: enrolled.data.id,
      });
      assert.ifError(challenge.error);
      const bad = await client.auth.mfa.verify({
        factorId: enrolled.data.id,
        challengeId: challenge.data.id,
        code: "not-a-code",
      });
      assert.ok(bad.error);
      const next = await client.auth.mfa.challenge({
        factorId: enrolled.data.id,
      });
      assert.ifError(next.error);
      const verified = await client.auth.mfa.verify({
        factorId: enrolled.data.id,
        challengeId: next.data.id,
        code: totp(enrolled.data.totp.secret),
      });
      assert.ifError(verified.error);
      const aal = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      assert.ifError(aal.error);
      assert.equal(aal.data.currentLevel, "aal2");
      owner = (await client.auth.getSession()).data.session.access_token;
      metrics.mfa = {
        mechanism: "TOTP real Auth",
        databaseAal2Enforced: false,
        browserFlowImplemented: false,
      };
    },
  );
  const destination = await contract(),
    code = "PERIODIC-" + randomUUID().slice(0, 8);
  await check(
    "identical periodic snapshot retrieves receipt without reverting later balance",
    "import",
    async () => {
      const source = request(destination, [row(code)]),
        a = await rpc("preview", { request: source });
      const first = await rpc("commit", { preview_token: a.token });
      source.rows[0].action = "replace";
      source.rows[0].quantity = "2.250001";
      const b = await rpc("preview", { request: source });
      await rpc("commit", { preview_token: b.token });
      source.rows[0].quantity = "1.250001";
      const old = await rpc("preview", { request: source });
      assert.equal(old.duplicate.batch_id, first.batch_id);
      assert.equal(
        (await rpc("commit", { preview_token: old.token })).reused,
        true,
      );
      const rr = await rest(
        "contract_balances_api?contract_id=eq." + destination,
      );
      assert.equal(rr.body[0].quantity, "2.250001");
      metrics.periodicIdentical =
        "Original receipt returned; later balance preserved; JP snapshot-cycle policy required";
    },
  );
  await check(
    "varied fictional warehouse XLSX layouts and exact decimal text",
    "import",
    async () => {
      const layouts = [
        [
          ["SKU", "Saldo", "Material", "Unidade"],
          ["000123", "123.123456", "Cabo ficticio", "m"],
        ],
        [
          ["Material", "Unidade", "Saldo", "SKU"],
          ["Parafuso ficticio", "un", "0", "ZERO"],
        ],
        [
          ["Codigo", "Quantidade", "Descricao", "Unidade"],
          ["VIRGULA", "1,250001", "Argamassa ficticia", "kg"],
        ],
      ];
      for (const data of layouts) {
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          book,
          XLSX.utils.aoa_to_sheet(data),
          "Almoxarifado",
        );
        const bytes = XLSX.write(book, {
          bookType: "xlsx",
          type: "buffer",
          compression: true,
        });
        const parsed = parseOnlineWorkbook(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        );
        assert.equal(parsed[0].rows.length, 2);
        assert.equal(parsed[0].rows[1][0].text, String(data[1][0]));
        const header = data[0],
          cells = parsed[0].rows[1];
        const at = (names) =>
          cells[header.findIndex((h) => names.includes(h))].text;
        const mapped = {
          ...row(at(["SKU", "Codigo"])),
          description: at(["Material", "Descricao"]),
          unit: at(["Unidade"]),
          quantity: at(["Saldo", "Quantidade"]),
        };
        const id = await contract(),
          plan = await rpc("preview", { request: request(id, [mapped]) });
        assert.equal(plan.ready, true);
        await rpc("commit", { preview_token: plan.token });
        const saved = await rest("contract_balances_api?contract_id=eq." + id);
        assert.equal(
          saved.body[0].quantity,
          { "000123": "123.123456", ZERO: "0.000000", VIRGULA: "1.250001" }[
            mapped.code
          ],
        );
      }
      const incompatible = await rpc("preview", {
        request: request(destination, [
          {
            ...row("UNSUPPORTED-" + randomUUID().slice(0, 8)),
            unit: "UND",
            quantity: "1.234,56",
          },
        ]),
      });
      assert.equal(incompatible.ready, false);
      assert.ok(incompatible.rows[0].errors.length >= 2);
      metrics.warehouseFormats = {
        layouts: 3,
        unsupportedUnitAndThousandsFormatRejected: true,
        corporateWorkbooksTested: false,
      };
    },
  );
  await check(
    "volume 10 100 500 rows; concurrent authorized reads remain successful",
    "import",
    async () => {
      metrics.volumes = [];
      for (const n of [10, 100, 500]) {
        const id = await contract(),
          source = request(
            id,
            Array.from({ length: n }, (_, i) =>
              row(
                "VOLUME-" + n + "-" + i + "-" + randomUUID().slice(0, 8),
                "123456.123456",
                i + 2,
              ),
            ),
          );
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet([
            ["Codigo", "Descricao", "Unidade", "Quantidade"],
            ...source.rows.map((r) => [
              r.code,
              r.description,
              r.unit,
              r.quantity,
            ]),
          ]),
          "Dados",
        );
        const workbookBytes = XLSX.write(workbook, {
          bookType: "xlsx",
          type: "buffer",
          compression: true,
        });
        const parseStart = performance.now();
        const parsed = parseOnlineWorkbook(
          workbookBytes.buffer.slice(
            workbookBytes.byteOffset,
            workbookBytes.byteOffset + workbookBytes.byteLength,
          ),
        );
        const parseMs = performance.now() - parseStart;
        source.rows = parsed[0].rows.slice(1).map((cells, i) => ({
          ...row(cells[0].text, cells[3].text, i + 2),
          description: cells[1].text,
          unit: cells[2].text,
        }));
        assert.equal(source.rows.length, n);
        let start = performance.now();
        const pp = await rpc("preview", { request: source });
        const previewMs = performance.now() - start;
        assert.equal(pp.ready, true);
        const reads = Array.from({ length: 5 }, async () => {
          const start = performance.now(),
            r = await rest("contract_balances_api?limit=10");
          assert.equal(r.status, 200);
          return performance.now() - start;
        });
        start = performance.now();
        const result = await rpc("commit", { preview_token: pp.token });
        const commitMs = performance.now() - start,
          readMs = await Promise.all(reads);
        assert.equal(result.applied, n);
        assert.ok(previewMs < 12000 && commitMs < 12000);
        metrics.volumes.push({
          rows: n,
          workbookBytes: workbookBytes.length,
          nodeParseMs: Math.round(parseMs),
          previewMs: Math.round(previewMs),
          commitMs: Math.round(commitMs),
          concurrentReadsMs: readMs.map(Math.round),
        });
      }
    },
  );
  await check(
    "global import lock allows reads but delays unrelated catalog writer",
    "write",
    async () => {
      await db.query(
        "begin;lock table public.products in share row exclusive mode",
      );
      try {
        let start = performance.now();
        const r = await rest("products?limit=1");
        const readMs = performance.now() - start;
        assert.equal(r.status, 200);
        start = performance.now();
        const pending = rest("products", {
          method: "POST",
          data: {
            code: "BLOCK-" + randomUUID(),
            description: "Ficticio blocked",
            unit: "m",
          },
        });
        await new Promise((r) => setTimeout(r, 1000));
        await db.query("commit");
        const result = await pending,
          writeMs = performance.now() - start;
        assert.equal(result.status, 201);
        assert.ok(writeMs >= 900);
        metrics.globalLock = {
          readMs: Math.round(readMs),
          unrelatedWriterWaitMs: Math.round(writeMs),
          controlledHoldMs: 1000,
          productionSloValidated: false,
        };
      } finally {
        await db.query("rollback");
      }
    },
  );
  await check(
    "encrypted pg_dump restores Auth business RLS grants and signing key in NEW database",
    "backup",
    async () => {
      const candidates = (
        await exec(
          "docker",
          [
            "ps",
            "--filter",
            "network=" + p.network,
            "--filter",
            "publish=56322",
            "--format",
            "{{.Names}}",
          ],
          { env, windowsHide: true },
        )
      ).stdout
        .trim()
        .split(/\r?\n/)
        .filter(Boolean);
      assert.equal(candidates.length, 1);
      const container = candidates[0];
      assert.match(container, /^supabase_db_jp-e2e-[0-9a-f-]+$/);
      const opening = await rest("contract_balances_api?contract_id=eq." + f.a);
      assert.equal(opening.status, 200);
      const posted = await http("/rest/v1/rpc/stock_post", {
        method: "POST",
        data: {
          request: {
            kind: "entrada",
            contract_id: f.a,
            product_id: opening.body[0].product_id,
            quantity: "0.000001",
            expected_quantity: opening.body[0].quantity,
            idempotency_key: randomUUID(),
          },
        },
      });
      assert.equal(posted.status, 200);
      const before = await fingerprint(db),
        key = randomBytes(32);
      let start = performance.now();
      const bytes = await dumpContainer(container),
        encrypted = encryptArchive(bytes, key);
      metrics.backup = {
        dumpMs: Math.round(performance.now() - start),
        bytes: bytes.length,
        encryptedAtRest: true,
        keyPersisted: false,
      };
      await writeFile(
        join(p.workspace, "drill-backup.encrypted.json"),
        JSON.stringify(encrypted),
      );
      assert.throws(() => decryptArchive(encrypted, randomBytes(32)));
      const modified = {
        ...encrypted,
        data:
          (encrypted.data.startsWith("A") ? "B" : "A") +
          encrypted.data.slice(1),
      };
      assert.throws(() => decryptArchive(modified, key));
      restoreName = "jp_restore_" + randomUUID().replaceAll("-", "");
      await db.query(
        'create database "' + restoreName + '" template template0',
      );
      start = performance.now();
      await restoreContainer(
        container,
        decryptArchive(
          JSON.parse(
            await readFile(
              join(p.workspace, "drill-backup.encrypted.json"),
              "utf8",
            ),
          ),
          key,
        ),
      );
      const uri = new URL(s.DB_URL);
      uri.pathname = "/" + restoreName;
      restored = new pg.Client({ connectionString: uri.href });
      await restored.connect();
      assert.deepEqual(await fingerprint(restored), before);
      const catalog = async (c) =>
        (
          await c.query(
            "select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','private') order by 1,2,3",
          )
        ).rows;
      assert.deepEqual(await catalog(restored), await catalog(db));
      const grants = async (c) =>
        (
          await c.query(
            "select table_schema,table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema in ('public','private','auth') order by 1,2,3,4",
          )
        ).rows;
      assert.deepEqual(await grants(restored), await grants(db));
      const rls = async (c) =>
        (
          await c.query(
            "select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' order by 1,2",
          )
        ).rows;
      assert.deepEqual(await rls(restored), await rls(db));
      const funcs = async (c) =>
        (
          await c.query(
            "select n.nspname,p.proname,p.proacl,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' or (n.nspname='public' and (p.proname like 'admin_%' or p.proname like 'stock_%')) order by 1,2",
          )
        ).rows;
      assert.deepEqual(await funcs(restored), await funcs(db));
      const constraints = async (c) =>
        (
          await c.query(
            "select n.nspname,r.relname,c.conname,pg_get_constraintdef(c.oid) definition from pg_constraint c join pg_namespace n on n.oid=c.connamespace join pg_class r on r.oid=c.conrelid where n.nspname in ('public','private','auth') order by 1,2,3",
          )
        ).rows;
      assert.deepEqual(await constraints(restored), await constraints(db));
      metrics.backup.constraintsCompared = true;
      metrics.backup.stockMovementPreserved = true;
      await restored.query("begin;set local role authenticated");
      await restored.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [
          f.users.reader.id,
          JSON.stringify({ sub: f.users.reader.id, role: "authenticated" }),
        ],
      );
      assert.equal(
        (await restored.query("select count(*)::int n from public.contracts"))
          .rows[0].n,
        1,
      );
      await assert.rejects(
        restored.query("select * from private.import_signing_key"),
        (e) => e.code === "42501",
      );
      await restored.query("rollback");
      metrics.backup.restoreMs = Math.round(performance.now() - start);
      metrics.backup.schemasCompared = [
        "public",
        "private",
        "auth",
        "supabase_migrations",
      ];
      metrics.backup.tableCount = Object.keys(before).length;
      metrics.backup.rlsReaderIsolationVerified = true;
      metrics.backup.newDatabase = true;
      metrics.backup.fullStackReconnectTested = false;
      await restored.end();
      restored = null;
      await db.query('drop database "' + restoreName + '"');
      restoreName = null;
      key.fill(0);
      bytes.fill(0);
    },
  );
  await check(
    "stored malicious material renders as text in real Chromium",
    "security",
    async () => {
      const marker = '<img src=x onerror="window.__jpXss=1">',
        id = await contract(),
        source = request(id, [
          { ...row("XSS-" + randomUUID().slice(0, 8)), description: marker },
        ]);
      const pp = await rpc("preview", { request: source });
      await rpc("commit", { preview_token: pp.token });
      process.env.VITE_JP_ONLINE_LOCAL = "true";
      process.env.VITE_SUPABASE_URL = f.api;
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY = f.anon;
      const { createServer } = await import("vite");
      server = await createServer({
        server: { host: "127.0.0.1", port: 5193, strictPort: true },
      });
      await server.listen();
      const headers = await fetch("http://127.0.0.1:5193/code/html/index.html");
      assert.equal(headers.headers.get("referrer-policy"), "no-referrer");
      assert.equal(headers.headers.get("x-frame-options"), "DENY");
      assert.equal(headers.headers.get("x-content-type-options"), "nosniff");
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      page.setDefaultTimeout(60000);
      await page.goto("http://127.0.0.1:5193/code/html/index.html", {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.locator("#email").fill(f.users.owner.email);
      await page.locator("#password").fill(f.users.owner.password);
      await page.locator("#loginForm button").click();
      await page.locator("#onlineInventory").waitFor();
      await page.locator("#search").fill("XSS-");
      await page
        .locator(".online-material")
        .filter({ hasText: marker })
        .waitFor();
      assert.equal(await page.locator('img[src="x"]').count(), 0);
      assert.equal(await page.evaluate(() => window.__jpXss), undefined);
      await page
        .locator(".online-material")
        .filter({ hasText: marker })
        .getByRole("button")
        .click();
      await page.locator("#onlineDetail").waitFor();
      assert.ok(
        (await page.locator("#detailBody").textContent()).includes(marker),
      );
      assert.equal(await page.evaluate(() => window.__jpXss), undefined);
      await browser.close();
      browser = null;
      await server.close();
      server = null;
    },
  );
} catch (e) {
  let diagnostic = redactDiagnostic(String(e.message));
  for (const u of Object.values(f?.users || {}))
    if (u.password)
      diagnostic = diagnostic.replaceAll(u.password, "[REDACTED]");
  for (const value of Object.values(s || {}))
    if (typeof value === "string" && value.length > 12)
      diagnostic = diagnostic.replaceAll(value, "[REDACTED]");
  console.error(diagnostic.slice(0, 2500));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  if (restored) await restored.end();
  if (db) await db.end();
  const report = {
    version: "1.0.0",
    baseCommit: "790251b",
    recordedAt: new Date().toISOString(),
    status: process.exitCode ? "failed" : "passed",
    pilotReady: false,
    executed: cases.length,
    blocked: process.exitCode ? Math.max(0, 11 - cases.length) : 0,
    passed: cases.filter((c) => c.status === "passed").length,
    failed: cases.filter((c) => c.status === "failed").length,
    cases,
    metrics,
    externalPending: [
      "SMTP delivery and email links in approved HTTPS domain",
      "Browser recovery confirmation MFA flows and database AAL2 enforcement",
      "Full-stack restore to separate host with external secrets",
      "Remediation and reachability triage of container findings, native binary scan and corporate security review",
      "JP workload RPO RTO retention and periodic snapshot policy",
      "Production build deployment path remains intentionally disabled",
    ],
  };
  await writeFile(
    "test-results/readiness-results.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    "Readiness checks: " +
      report.passed +
      " passed; " +
      report.failed +
      " failed; pilot NOT approved",
  );
}
