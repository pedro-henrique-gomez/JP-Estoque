import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function importDatabaseChecks({ client, actor, id, check }) {
  const source = (code, quantity = "1.250001") => ({
    line: 2,
    code,
    description: "Ficticio importado",
    unit: "m",
    quantity,
    action: "add",
    discard: false,
    decided: true,
  });
  const request = (rows) => ({
    destination: id(100),
    file_name: "ficticio.xlsx",
    file_sha256: "a".repeat(64),
    sheet_name: "Teste",
    rows,
  });
  const preview = (payload) =>
    actor(
      7,
      async (c) =>
        (
          await c.query("select public.admin_import_preview($1) as p", [
            payload,
          ])
        ).rows[0].p,
    );
  const commit = (token) =>
    actor(
      7,
      async (c) =>
        (await c.query("select public.admin_import_commit($1) as r", [token]))
          .rows[0].r,
      "authenticated",
      client,
      true,
    );
  await check(
    "v09 native private signing key and receipts are not accessible",
    async () => {
      await assert.rejects(
        actor(7, (c) => c.query("select * from private.import_signing_key")),
        (e) => e.code === "42501",
      );
      await assert.rejects(
        actor(7, (c) => c.query("select * from private.import_receipts")),
        (e) => e.code === "42501",
      );
    },
  );
  for (const n of [1, 2, 3, 4, 5, 8])
    await check(
      "v09 native preview denies unprivileged/inactive user " + n,
      () =>
        assert.rejects(
          actor(n, (c) =>
            c.query("select public.admin_import_preview($1)", [
              request([source("DENIED")]),
            ]),
          ),
          (e) => e.code === "42501",
        ),
    );
  const code = "NATIVE-" + randomUUID();
  let p, r;
  await check(
    "v09 native preview has no persisted business writes",
    async () => {
      const before = (
        await client.query(
          "select count(*)::int as n from public.import_batches",
        )
      ).rows[0].n;
      p = await preview(request([source(code, "999999999999999999.999999")]));
      assert.equal(p.ready, true);
      assert.equal(p.rows[0].quantity, "999999999999999999.999999");
      assert.equal(
        (
          await client.query(
            "select count(*)::int as n from public.import_batches",
          )
        ).rows[0].n,
        before,
      );
    },
  );
  await check(
    "v09 native signed atomic snapshot and exact decimal",
    async () => {
      r = await commit(p.token);
      assert.equal(r.applied, 1);
      assert.equal(
        (
          await client.query(
            "select b.quantity::text as q from public.contract_balances b join public.products p on p.id=b.product_id where p.code_key=upper($1)",
            [code],
          )
        ).rows[0].q,
        "999999999999999999.999999",
      );
    },
  );
  await check("v09 native replay returns one original batch", async () => {
    const again = await commit(p.token);
    assert.equal(again.reused, true);
    assert.equal(again.batch_id, r.batch_id);
  });
  await check(
    "v09 native malformed decimals and explicit discard",
    async () => {
      const payload = request([
        { ...source("BAD"), quantity: "-1" },
        { ...source("VALID"), line: 3 },
      ]);
      const bad = await preview(payload);
      assert.equal(bad.ready, false);
      payload.rows[0].discard = true;
      assert.equal((await preview(payload)).ready, true);
    },
  );
  await check("v09 native stale preview aborts without applying", async () => {
    const code = "STALE-" + randomUUID(),
      p = await preview(request([source(code)]));
    await client.query("update public.contracts set name=name where id=$1", [
      id(100),
    ]);
    await assert.rejects(commit(p.token), (e) => e.code === "40001");
    assert.equal(
      (
        await client.query(
          "select count(*)::int as n from public.products where code_key=upper($1)",
          [code],
        )
      ).rows[0].n,
      0,
    );
  });
  await check(
    "v09 native signature tampering cannot change preview",
    async () => {
      const bad = p.token.slice(0, -1) + (p.token.endsWith("0") ? "1" : "0");
      await assert.rejects(commit(bad), (e) => e.code === "42501");
    },
  );
  await check(
    "v09 native failure on later row rolls back products balances batch rows audit and receipt",
    async () => {
      const code = "FAIL-" + randomUUID(),
        p = await preview(
          request([source(code), { ...source(code + "-LATE"), line: 3 }]),
        );
      const counts = async () =>
        (
          await client.query(
            "select (select count(*) from public.products)::text as p,(select count(*) from public.contract_balances)::text as b,(select count(*) from public.import_batches)::text as batches,(select count(*) from public.import_rows)::text as rows,(select count(*) from public.audit_events)::text as audit,(select count(*) from private.import_receipts)::text as receipts",
          )
        ).rows[0];
      const before = await counts();
      await client.query(
        "create function private.v09_fail() returns trigger language plpgsql as $$ begin if new.code like '%-LATE' then raise exception 'Injected native test failure'; end if; return new; end $$; create trigger v09_fail before insert on public.products for each row execute function private.v09_fail()",
      );
      try {
        await assert.rejects(commit(p.token), (e) => e.code === "P0001");
        assert.deepEqual(await counts(), before);
      } finally {
        await client.query(
          "drop trigger v09_fail on public.products;drop function private.v09_fail()",
        );
      }
    },
  );
}
