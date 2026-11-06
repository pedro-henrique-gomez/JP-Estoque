import { importDatabaseChecks } from "./import-checks.mjs";
import EmbeddedPostgres from "embedded-postgres";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";

// Dedicated, disposable native PostgreSQL. No URL/env override can target real data.
const port = await new Promise((done, fail) => {
  const probe = createServer();
  probe.once("error", fail);
  probe.listen(0, "127.0.0.1", () => {
    const port = probe.address().port;
    probe.close(() => done(port));
  });
});
const directory = resolve(".local-db", `security-${randomUUID()}`);
const server = new EmbeddedPostgres({
  databaseDir: directory,
  user: "postgres",
  password: randomBytes(32).toString("hex"),
  port,
  persistent: true,
  createPostgresUser: false,
  postgresFlags: ["-h", "127.0.0.1"],
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: (message) => console.error(String(message)),
});
const id = (value) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const roles = [
  "funcionario_autorizado",
  "almoxarife",
  "coordenador",
  "planejamento",
  "diretor",
  "administrador",
  "proprietario",
];
const tables = [
  "profiles",
  "contracts",
  "user_contracts",
  "products",
  "suppliers",
  "locations",
  "contract_balances",
  "balance_references",
  "import_batches",
  "import_rows",
  "audit_events",
  "system_settings",
];
const results = [];
let client, version;
async function check(name, run) {
  try {
    await run();
    results.push({ name, passed: true });
    if (process.argv.includes("--verbose"))
      console.log(`ok ${results.length} - ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
    throw new Error(name, { cause: error });
  }
}
async function actor(
  user,
  run,
  role = "authenticated",
  connection = client,
  commit = false,
) {
  await connection.query("begin");
  try {
    await connection.query(`set local role ${role}`);
    await connection.query(
      "select set_config('request.jwt.claim.sub',$1,true)",
      [user ? id(user) : ""],
    );
    const value = await run(connection);
    await connection.query(commit ? "commit" : "rollback");
    return value;
  } catch (error) {
    await connection.query("rollback");
    throw error;
  }
}
async function rejectsQuery(
  user,
  sql,
  params = [],
  code = "42501",
  role = "authenticated",
) {
  await assert.rejects(
    actor(user, (c) => c.query(sql, params), role),
    (error) => error.code === code,
    `${sql}: expected SQLSTATE ${code}`,
  );
}
async function seed() {
  for (let n = 1; n <= 16; n++)
    await client.query("insert into auth.users(id) values($1)", [id(n)]);
  for (let n = 1; n <= 15; n++)
    await client.query(
      "insert into public.profiles(id,name,email,role,active) values($1,$2,$3,$4,$5)",
      [
        id(n),
        `Fictitious user ${n}`,
        `user${n}@example.invalid`,
        roles[(n - 1) % 7],
        n <= 7 || n === 15,
      ],
    );
  await client.query(
    "insert into public.contracts(id,name) values($1,'Contrato A'),($2,'Contrato B'),($3,'Contrato vazio')",
    [id(100), id(101), id(102)],
  );
  for (const n of [1, 2, 3, 4, 8, 9, 10, 11, 12, 13, 14])
    await client.query(
      "insert into public.user_contracts(user_id,contract_id) values($1,$2)",
      [id(n), id(n <= 4 ? 100 : 101)],
    );
  for (const [n, code] of [
    [200, "A-001"],
    [201, "B-001"],
    [202, "SHARED-001"],
    [203, "UNLINKED"],
  ])
    await client.query(
      "insert into public.products(id,code,description,unit) values($1,$2,$3,'m')",
      [id(n), code, `Fictitious product ${code}`],
    );
  for (const n of [300, 301, 302, 303])
    await client.query(
      "insert into public.suppliers(id,name,contact) values($1,$2,$3)",
      [id(n), `Fictitious supplier ${n}`, "teste@example.invalid"],
    );
  for (const [n, contract] of [
    [400, 100],
    [401, 101],
    [402, 100],
  ])
    await client.query(
      "insert into public.locations(id,contract_id,code) values($1,$2,$3)",
      [id(n), id(contract), `L-${n}`],
    );
  for (const [n, product, contract, location, supplier] of [
    [500, 200, 100, 400, 300],
    [501, 201, 101, 401, 301],
    [502, 202, 100, 400, 302],
    [503, 202, 101, 401, 302],
  ])
    await client.query(
      "insert into public.contract_balances(id,product_id,contract_id,quantity,location_id,supplier_id) values($1,$2,$3,12.125000,$4,$5)",
      [id(n), id(product), id(contract), id(location), id(supplier)],
    );
  for (const [n, balance, contract] of [
    [600, 500, 100],
    [601, 501, 101],
  ])
    await client.query(
      "insert into public.balance_references(id,balance_id,contract_id,kind,reference) values($1,$2,$3,'oc',$4)",
      [id(n), id(balance), id(contract), `EXISTING-${n}`],
    );
  await client.query(
    "insert into public.import_batches(id,created_by,source_file,sheet_name) values($1,$2,'fictitious.xlsx','Test')",
    [id(700), id(7)],
  );
  for (const [line, contract] of [
    [1, 100],
    [2, 101],
  ])
    await client.query(
      "insert into public.import_rows(batch_id,source_line,contract_id,status) values($1,$2,$3,'success')",
      [id(700), line, id(contract)],
    );
  await client.query(
    "insert into public.system_settings(system_name,support_email) values('JP TEST ONLY','teste@example.invalid')",
  );
}
const mutations = [
  {
    table: "contracts",
    insert:
      "insert into public.contracts(name) values('New fictitious contract')",
    update: "update public.contracts set name='Changed' where id=$1",
    target: 102,
  },
  {
    table: "products",
    insert:
      "insert into public.products(code,description,unit) values('NEW-TEST','New fictitious product','un')",
    update:
      "update public.products set description='Changed product' where id=$1",
    target: 203,
  },
  {
    table: "suppliers",
    insert:
      "insert into public.suppliers(name) values('New fictitious supplier')",
    update: "update public.suppliers set name='Changed supplier' where id=$1",
    target: 303,
  },
  {
    table: "locations",
    insert: `insert into public.locations(contract_id,code) values('${id(100)}','New location')`,
    update:
      "update public.locations set description='Changed location' where id=$1",
    target: 402,
  },
  {
    table: "contract_balances",
    insert: `insert into public.contract_balances(product_id,contract_id,quantity) values('${id(203)}','${id(100)}',1.125000)`,
    update: "update public.contract_balances set quantity=3.625000 where id=$1",
    target: 500,
  },
  {
    table: "balance_references",
    insert: `insert into public.balance_references(balance_id,contract_id,kind,reference) values('${id(500)}','${id(100)}','nf','NEW-REF')`,
    update:
      "update public.balance_references set reference='Changed reference' where id=$1",
    target: 600,
  },
];
try {
  await server.initialise();
  await server.start();
  client = server.getPgClient("postgres", "127.0.0.1");
  await client.connect();
  version = (await client.query("select version()")).rows[0].version;
  console.log(version);
  await client.query(await readFile("db-tests/support/auth.sql", "utf8"));
  const migrations = (await readdir("supabase/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    await client.query("begin");
    try {
      await client.query(
        await readFile(`supabase/migrations/${migration}`, "utf8"),
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw new Error(`Migration ${migration}`, { cause: error });
    }
  }
  await seed();
  await check("all application tables enforce RLS and FORCE RLS", async () => {
    const rows = (
      await client.query(
        "select relname,relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'",
      )
    ).rows;
    assert.equal(rows.length, tables.length + 5);
    assert(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity));
  });
  await check(
    "test queries actually run as non-superuser without BYPASSRLS",
    () =>
      actor(1, async (c) => {
        const row = (
          await c.query(
            "select current_user,rolsuper,rolbypassrls from pg_roles where rolname=current_user",
          )
        ).rows[0];
        assert.equal(row.current_user, "authenticated");
        assert.equal(row.rolsuper, false);
        assert.equal(row.rolbypassrls, false);
      }),
  );
  await check("future objects have no implicit API grants", async () => {
    await client.query("create table public.future_probe(id integer)");
    await client.query(
      "create function public.future_probe_fn() returns text language sql as $$ select 'not exposed'::text $$",
    );
    try {
      await rejectsQuery(1, "select * from public.future_probe");
      await rejectsQuery(
        null,
        "select * from public.future_probe",
        [],
        "42501",
        "anon",
      );
      await rejectsQuery(1, "select public.future_probe_fn()");
    } finally {
      await client.query("drop table public.future_probe");
      await client.query("drop function public.future_probe_fn()");
    }
  });
  await check(
    "database enum matches the complete seven-profile matrix",
    async () => {
      const actual = (
        await client.query(
          "select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='app_role'",
        )
      ).rows
        .map((row) => row.enumlabel)
        .sort();
      assert.deepEqual(actual, [...roles].sort());
    },
  );
  for (let index = 0; index < roles.length; index++) {
    const user = index + 1,
      admin = index >= 5,
      global = index >= 4,
      label = roles[index];
    const counts = {
      contracts: global ? 3 : 1,
      products: admin ? 4 : global ? 3 : 2,
      suppliers: admin ? 4 : global ? 3 : 2,
      locations: global ? 3 : 2,
      contract_balances: global ? 4 : 2,
      balance_references: global ? 2 : 1,
      profiles: admin ? 15 : 1,
      user_contracts: admin ? 11 : user <= 4 ? 1 : 0,
      import_batches: admin ? 1 : 0,
      import_rows: admin ? 2 : 0,
      system_settings: admin ? 1 : 0,
    };
    await check(`${label}: invoker API projection retains contract scope`, () =>
      actor(user, async (c) => {
        assert.equal(
          (await c.query("select * from public.contract_balances_api"))
            .rowCount,
          global ? 4 : 2,
        );
      }),
    );
    for (const [table, count] of Object.entries(counts))
      await check(`${label}: SELECT ${table}`, () =>
        actor(user, async (c) =>
          assert.equal(
            Number(
              (await c.query(`select count(*) as count from public.${table}`))
                .rows[0].count,
            ),
            count,
          ),
        ),
      );
    await check(`${label}: administrative history visibility`, () =>
      actor(user, async (c) =>
        assert.equal(
          Number(
            (await c.query("select count(*) as count from public.audit_events"))
              .rows[0].count,
          ) > 0,
          admin,
        ),
      ),
    );
    for (const mutation of mutations) {
      if (mutation.table === "contract_balances") {
        for (const [verb, sql, params] of [
          ["INSERT", mutation.insert, []],
          ["UPDATE", mutation.update, [id(mutation.target)]],
          [
            "DELETE",
            `delete from public.contract_balances where id=$1`,
            [id(mutation.target)],
          ],
        ])
          await check(
            `${label}: direct ${verb} balance denied; RPC required`,
            () => rejectsQuery(user, sql, params),
          );
        continue;
      }
      await check(`${label}: INSERT ${mutation.table}`, () =>
        admin
          ? actor(user, async (c) =>
              assert.equal((await c.query(mutation.insert)).rowCount, 1),
            )
          : rejectsQuery(user, mutation.insert),
      );
      await check(`${label}: UPDATE ${mutation.table}`, () =>
        actor(user, async (c) =>
          assert.equal(
            (await c.query(mutation.update, [id(mutation.target)])).rowCount,
            admin ? 1 : 0,
          ),
        ),
      );
      await check(`${label}: DELETE ${mutation.table}`, () =>
        actor(user, async (c) =>
          assert.equal(
            (
              await c.query(
                `delete from public.${mutation.table} where id=$1`,
                [id(mutation.target)],
              )
            ).rowCount,
            admin ? 1 : 0,
          ),
        ),
      );
    }
    await check(`${label}: settings UPDATE`, () =>
      actor(user, async (c) =>
        assert.equal(
          (
            await c.query(
              "update public.system_settings set system_name='Changed'",
            )
          ).rowCount,
          admin ? 1 : 0,
        ),
      ),
    );
    await check(`${label}: settings DELETE`, () =>
      actor(user, async (c) =>
        assert.equal(
          (await c.query("delete from public.system_settings")).rowCount,
          admin ? 1 : 0,
        ),
      ),
    );
    await check(`${label}: settings INSERT`, () =>
      admin
        ? actor(user, async (c) => {
            await c.query("delete from public.system_settings");
            assert.equal(
              (
                await c.query(
                  "insert into public.system_settings(system_name,support_email) values('Test','test@example.invalid')",
                )
              ).rowCount,
              1,
            );
          })
        : rejectsQuery(
            user,
            "insert into public.system_settings(system_name,support_email) values('Test','test@example.invalid')",
          ),
    );
    for (const table of [
      "profiles",
      "user_contracts",
      "audit_events",
      "import_batches",
      "import_rows",
    ]) {
      await check(`${label}: protected UPDATE ${table}`, () =>
        rejectsQuery(
          user,
          `update public.${table} set ${table === "profiles" ? "name='Changed'" : table === "user_contracts" ? `contract_id='${id(101)}'` : table === "audit_events" ? "entity='Forged'" : table === "import_batches" ? "source_file='forged.csv'" : "status='error'"}`,
        ),
      );
      await check(`${label}: protected DELETE ${table}`, () =>
        rejectsQuery(user, `delete from public.${table}`),
      );
    }
    await check(`${label}: no self-promotion by direct profile INSERT`, () =>
      rejectsQuery(
        user,
        `insert into public.profiles(id,name,email,role,active) values('${id(16)}','Forged','forged@example.invalid','proprietario',true)`,
      ),
    );
    await check(`${label}: no direct membership INSERT`, () =>
      rejectsQuery(
        user,
        `insert into public.user_contracts(user_id,contract_id) values('${id(15)}','${id(101)}')`,
      ),
    );
    await check(`${label}: own role UPDATE denied`, () =>
      rejectsQuery(
        user,
        "update public.profiles set role='proprietario',active=true where id=$1",
        [id(user)],
      ),
    );
    await check(`${label}: immutable audit INSERT/TRUNCATE`, async () => {
      await rejectsQuery(
        user,
        "insert into public.audit_events(entity,operation) values('forged','INSERT')",
      );
      await rejectsQuery(user, "truncate public.audit_events");
    });
    await check(`${label}: administrative RPC for other user`, async () => {
      const sql =
        "select public.admin_save_profile($1,'Changed user','changed@example.invalid','planejamento',true)";
      if (admin)
        await actor(user, async (c) => {
          await c.query(sql, [id(8)]);
          assert.equal(
            (
              await c.query("select role from public.profiles where id=$1", [
                id(8),
              ])
            ).rows[0].role,
            "planejamento",
          );
        });
      else await rejectsQuery(user, sql, [id(8)]);
    });
    await check(`${label}: cannot change own profile even through RPC`, () =>
      rejectsQuery(
        user,
        "select public.admin_save_profile($1,'Self','self@example.invalid','proprietario',true)",
        [id(user)],
      ),
    );
    await check(`${label}: user-contract RPC`, async () => {
      const sql = "select public.admin_set_user_contract($1,$2,true)";
      if (admin)
        await actor(user, async (c) => {
          await c.query(sql, [id(15), id(101)]);
          assert.equal(
            (
              await c.query(
                "select * from public.user_contracts where user_id=$1",
                [id(15)],
              )
            ).rowCount,
            1,
          );
        });
      else await rejectsQuery(user, sql, [id(15), id(101)]);
    });
    await check(`${label}: own membership changes forbidden`, () =>
      rejectsQuery(user, "select public.admin_set_user_contract($1,$2,true)", [
        id(user),
        id(101),
      ]),
    );
    await check(
      `${label}: direct import append denied (v09 atomic RPC required)`,
      () =>
        rejectsQuery(
          user,
          "insert into public.import_batches(created_by,source_file,sheet_name) values($1,'test.xlsx','Test')",
          [id(user)],
        ),
    );
  }
  for (let n = 8; n <= 14; n++) {
    await check(
      `inactive ${roles[n - 8]}: no business or auxiliary reads`,
      () =>
        actor(n, async (c) => {
          for (const table of [
            ...tables.filter((t) => t !== "profiles"),
            "contract_balances_api",
          ])
            assert.equal(
              (await c.query(`select * from public.${table}`)).rowCount,
              0,
              table,
            );
          assert.equal(
            (await c.query("select * from public.profiles")).rowCount,
            1,
          );
        }),
    );
    await check(
      `inactive ${roles[n - 8]}: no writes or administrative RPC`,
      async () => {
        await rejectsQuery(n, mutations[0].insert);
        await rejectsQuery(
          n,
          "select public.admin_set_user_contract($1,$2,true)",
          [id(15), id(101)],
        );
      },
    );
  }
  for (const user of [null, 15, 16])
    await check(
      `authenticated without scope/profile (${user}): default deny`,
      () =>
        actor(user, async (c) => {
          for (const table of tables.filter((t) => t !== "profiles"))
            assert.equal(
              (await c.query(`select * from public.${table}`)).rowCount,
              0,
              table,
            );
        }),
    );
  for (const table of tables)
    await check(`anon: SELECT ${table} denied`, () =>
      rejectsQuery(null, `select * from public.${table}`, [], "42501", "anon"),
    );
  await check("anon: invoker API projection denied", () =>
    rejectsQuery(
      null,
      "select * from public.contract_balances_api",
      [],
      "42501",
      "anon",
    ),
  );
  for (const mutation of mutations)
    for (const operation of ["insert", "update", "delete"])
      await check(`anon: ${operation} ${mutation.table} denied`, () =>
        rejectsQuery(
          null,
          operation === "insert"
            ? mutation.insert
            : operation === "update"
              ? mutation.update
              : `delete from public.${mutation.table} where id=$1`,
          operation === "insert" ? [] : [id(mutation.target)],
          "42501",
          "anon",
        ),
      );
  await check("anon: public administration RPC denied", () =>
    rejectsQuery(
      null,
      "select public.admin_set_user_contract($1,$2,true)",
      [id(1), id(101)],
      "42501",
      "anon",
    ),
  );
  for (let user = 1; user <= 4; user++)
    await check(
      `${roles[user - 1]}: cross-contract join and identifier probes`,
      () =>
        actor(user, async (c) => {
          const joined = await c.query(
            "select b.contract_id from public.products p join public.contract_balances b on b.product_id=p.id left join public.suppliers s on s.id=b.supplier_id left join public.locations l on l.id=b.location_id left join public.balance_references r on r.balance_id=b.id",
          );
          assert.equal(joined.rowCount, 2);
          assert(joined.rows.every((row) => row.contract_id === id(100)));
          for (const [table, target] of [
            ["products", 201],
            ["suppliers", 301],
            ["locations", 401],
            ["balance_references", 601],
            ["contract_balances", 501],
          ])
            assert.equal(
              (
                await c.query(`select * from public.${table} where id=$1`, [
                  id(target),
                ])
              ).rowCount,
              0,
            );
        }),
    );
  await check("forged client role/metadata cannot elevate permissions", () =>
    actor(1, async (c) => {
      await c.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({
          role: "service_role",
          app_metadata: { role: "proprietario" },
          user_metadata: { role: "administrador" },
        }),
      ]);
      assert.equal(
        (await c.query("select * from public.contracts where id=$1", [id(101)]))
          .rowCount,
        0,
      );
      assert.equal(
        (await c.query("select private.is_admin() as allowed")).rows[0].allowed,
        false,
      );
    }),
  );
  await check(
    "private mutex and internal administrative helper cannot be called directly",
    async () => {
      await rejectsQuery(7, "select * from private.administration_mutex");
      await rejectsQuery(7, "select private.require_other_user_admin($1)", [
        id(1),
      ]);
    },
  );
  await check("fractional quantity is exact numeric, not floating point", () =>
    actor(7, async (c) => {
      assert.equal(
        (
          await c.query("select public.stock_post($1) as receipt", [
            {
              kind: "saida",
              contract_id: id(100),
              product_id: id(200),
              quantity: "12.001544",
              expected_quantity: "12.125000",
              idempotency_key: randomUUID(),
              destination: "Ficticio",
              recipient: "Pessoa Ficticia",
              recipient_company: "Empresa Ficticia",
            },
          ])
        ).rows[0].receipt.after_quantity,
        "0.123456",
      );
    }),
  );
  await check("API projection transports quantity as PostgreSQL text", () =>
    actor(1, async (c) => {
      assert.equal(
        (
          await c.query(
            "select pg_typeof(quantity)::text as type from public.contract_balances_api limit 1",
          )
        ).rows[0].type,
        "text",
      );
    }),
  );
  await check("negative and NaN quantities rejected", async () => {
    for (const quantity of ["-0.1", "NaN"])
      await rejectsQuery(
        7,
        "update public.contract_balances set quantity=$1 where id=$2",
        [quantity, id(500)],
        "23514",
        "postgres",
      );
  });
  await check(
    "cross-contract location FK rejected even for administrator",
    () =>
      rejectsQuery(
        7,
        "update public.contract_balances set location_id=$1 where id=$2",
        [id(401), id(500)],
        "23503",
        "postgres",
      ),
  );
  await check("cross-contract OC/NF relationship rejected", () =>
    rejectsQuery(
      7,
      "update public.balance_references set contract_id=$1 where id=$2",
      [id(101), id(600)],
      "23503",
    ),
  );
  await check(
    "missing foreign keys and duplicate balances rejected",
    async () => {
      await rejectsQuery(
        7,
        "update public.contract_balances set product_id=$1 where id=$2",
        [id(999), id(500)],
        "23503",
        "postgres",
      );
      await rejectsQuery(
        7,
        `insert into public.contract_balances(product_id,contract_id,quantity) values('${id(200)}','${id(100)}',1)`,
        [],
        "23505",
        "postgres",
      );
      await rejectsQuery(
        7,
        "select public.admin_save_profile($1,'User','not-an-email','planejamento',true)",
        [id(8)],
        "23514",
      );
    },
  );
  await check(
    "duplicate normalized product and contract rejected",
    async () => {
      await rejectsQuery(
        7,
        "insert into public.products(code,description,unit) values(' a-001 ','Duplicate','un')",
        [],
        "23505",
      );
      await rejectsQuery(
        7,
        "insert into public.contracts(name) values(' contrato a ')",
        [],
        "23505",
      );
    },
  );
  await check("stable primary identifiers cannot be changed", () =>
    rejectsQuery(7, "update public.products set id=$1 where id=$2", [
      id(999),
      id(200),
    ]),
  );
  await check("import creator cannot be forged", () =>
    rejectsQuery(
      7,
      "insert into public.import_batches(created_by,source_file,sheet_name) values($1,'test.xlsx','Test')",
      [id(6)],
    ),
  );
  await check(
    "profile creation requires existing Auth identity and a different administrative actor",
    async () => {
      await actor(7, async (c) => {
        await c.query(
          "select public.admin_save_profile($1,'Fictitious new profile','new@example.invalid','funcionario_autorizado',false)",
          [id(16)],
        );
        assert.equal(
          (await c.query("select * from public.profiles where id=$1", [id(16)]))
            .rowCount,
          1,
        );
      });
      await rejectsQuery(
        7,
        "select public.admin_save_profile($1,'Missing Auth','missing@example.invalid','funcionario_autorizado',false)",
        [id(999)],
        "23503",
      );
    },
  );
  await check(
    "membership grant and revocation change scope on the next statement",
    () =>
      actor(7, async (c) => {
        await c.query("select public.admin_set_user_contract($1,$2,true)", [
          id(15),
          id(101),
        ]);
        await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
          id(15),
        ]);
        assert.equal(
          (await c.query("select * from public.contract_balances")).rowCount,
          2,
        );
        await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
          id(7),
        ]);
        await c.query("select public.admin_set_user_contract($1,$2,false)", [
          id(15),
          id(101),
        ]);
        await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
          id(15),
        ]);
        assert.equal(
          (await c.query("select * from public.contract_balances")).rowCount,
          0,
        );
      }),
  );
  await check(
    "another administrator cannot append forged results to someone else import batch",
    () =>
      rejectsQuery(
        6,
        "insert into public.import_rows(batch_id,source_line,status) values($1,3,'success')",
        [id(700)],
      ),
  );
  await check(
    "database audit records verified actor and actual old/new values",
    () =>
      actor(7, async (c) => {
        await c.query("select public.stock_post($1)", [
          {
            kind: "entrada",
            contract_id: id(100),
            product_id: id(200),
            quantity: "87",
            expected_quantity: "12.125000",
            idempotency_key: randomUUID(),
          },
        ]);
        const row = (
          await c.query(
            "select * from public.audit_events where entity='contract_balances' and operation='UPDATE' order by occurred_at desc limit 1",
          )
        ).rows[0];
        assert.equal(row.actor_id, id(7));
        assert.equal(row.actor_role, "proprietario");
        assert.equal(Number(row.before_data.quantity), 12.125);
        assert.equal(Number(row.after_data.quantity), 99.125);
      }),
  );
  await check("server timestamps override forged insert timestamps", () =>
    actor(7, async (c) => {
      const row = (
        await c.query(
          "insert into public.contracts(name,created_at,updated_at) values('Timestamp test','2000-01-01','2000-01-01') returning extract(epoch from(clock_timestamp()-created_at)) as age",
        )
      ).rows[0];
      assert(Number(row.age) < 10);
    }),
  );
  await check(
    "revocation is effective on the next statement, independent of old claims",
    () =>
      actor(7, async (c) => {
        await c.query(
          "select public.admin_save_profile($1,'Inactive','inactive@example.invalid','funcionario_autorizado',false)",
          [id(1)],
        );
        await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
          id(1),
        ]);
        assert.equal(
          (await c.query("select * from public.contract_balances")).rowCount,
          0,
        );
      }),
  );
  await check(
    "concurrent administrators cannot deactivate each other leaving no administrator",
    async () => {
      await client.query(
        "update public.profiles set role='administrador' where id=$1",
        [id(7)],
      );
      const first = server.getPgClient("postgres", "127.0.0.1"),
        second = server.getPgClient("postgres", "127.0.0.1");
      await first.connect();
      await second.connect();
      try {
        for (const [c, user] of [
          [first, 6],
          [second, 7],
        ]) {
          await c.query("begin");
          await c.query("set local role authenticated");
          await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
            id(user),
          ]);
        }
        await first.query(
          "select public.admin_save_profile($1,'Owner','owner@example.invalid','administrador',false)",
          [id(7)],
        );
        const secondPid = (await second.query("select pg_backend_pid() as pid"))
          .rows[0].pid;
        const pending = second
          .query(
            "select public.admin_save_profile($1,'Admin','admin@example.invalid','administrador',false)",
            [id(6)],
          )
          .then(
            () => ({ allowed: true }),
            (error) => ({ allowed: false, code: error.code }),
          );
        let waiting = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          waiting = (
            await client.query(
              "select wait_event_type='Lock' as waiting from pg_stat_activity where pid=$1",
              [secondPid],
            )
          ).rows[0]?.waiting;
          if (waiting) break;
          await new Promise((done) => setTimeout(done, 20));
        }
        assert.equal(
          waiting,
          true,
          "second administrative RPC must actually wait for the first transaction lock",
        );
        await first.query("commit");
        const result = await pending;
        assert.deepEqual(result, { allowed: false, code: "42501" });
        await second.query("rollback");
        assert.equal(
          Number(
            (
              await client.query(
                "select count(*) as count from public.profiles where active and role in ('administrador','proprietario')",
              )
            ).rows[0].count,
          ),
          1,
        );
      } finally {
        await first.query("rollback");
        await second.query("rollback");
        await first.end();
        await second.end();
        await client.query(
          "update public.profiles set active=true,role='proprietario' where id=$1",
          [id(7)],
        );
      }
    },
  );
  await importDatabaseChecks({ client, actor, id, check });
} catch (error) {
  if (!results.some((result) => !result.passed))
    results.push({
      name: "PostgreSQL startup, migrations or fixtures",
      passed: false,
      error: error.message,
    });
  console.error(error);
  process.exitCode = 1;
} finally {
  if (client) await client.end();
  await server.stop();
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/database-results.json",
    JSON.stringify(
      {
        engine: version,
        nativePostgres: true,
        auth: "test-only auth.users and auth.uid; no Supabase Auth service",
        passed: results.filter((r) => r.passed).length,
        failed: results.filter((r) => !r.passed).length,
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    `Database checks: ${results.filter((r) => r.passed).length} passed, ${results.filter((r) => !r.passed).length} failed.`,
  );
}
