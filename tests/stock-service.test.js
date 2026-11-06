import { it, expect, vi } from "vitest";
import { createStockService } from "../code/ts/data/stock";
it("reports missing migration explicitly instead of showing an unexplained empty stock", async () => {
  const client = {
    rpc: vi.fn(async () => ({ status: 404, error: { code: "PGRST202" } })),
  };
  await expect(createStockService(client).context()).rejects.toThrow(
    "20261106000600_stock_movements.sql",
  );
});
it("uses the server export RPC rather than relying on frontend visibility", async () => {
  const client = {
    rpc: vi.fn(async () => ({ data: { rows: [] }, error: null })),
  };
  await createStockService(client).report({ contract_id: "unit-only" });
  expect(client.rpc).toHaveBeenCalledWith("stock_report", {
    request: { contract_id: "unit-only" },
  });
});
it("does not automatically retry uncertain writes", async () => {
  const client = {
    rpc: vi.fn(async () => ({ status: 500, error: { code: "P0001" } })),
  };
  await expect(
    createStockService(client).post({ idempotency_key: "unit-only" }),
  ).rejects.toMatchObject({ kind: "connection" });
  expect(client.rpc).toHaveBeenCalledTimes(1);
});
it("requests a role-only snapshot without requesting the user directory", async () => {
  const client = { rpc: vi.fn(async () => ({ data: { roles: [] }, error: null })) };
  await createStockService(client).roles();
  expect(client.rpc).toHaveBeenCalledWith("stock_admin_snapshot", { request: { scope: "roles" } });
});
