import type { Contract, Material } from "./types";
import type { Inventory, GlobalProduct } from "./import-types";

export const codeKey = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
export const textKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9²³]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
export const globalFields = [
  "code",
  "name",
  "unit",
  "category",
  "brand",
  "model",
] as const;
/** The old Material structure is a joined view, not a global product with a quantity. */
export function toInventory(
  materials: Material[],
  contracts: Contract[],
): Inventory {
  const products = new Map<string, GlobalProduct>();
  const balances: Inventory["balances"] = [];
  for (const material of materials) {
    const key = codeKey(material.code);
    if (!products.has(key))
      products.set(key, {
        id: `produto:${key}`,
        code: material.code.trim(),
        name: material.name,
        unit: material.unit,
        category: material.category,
        brand: material.brand,
        model: material.model,
      });
    const contract = contracts.find(
      (contract) => textKey(contract.name) === textKey(material.contract),
    );
    balances.push({
      id: material.id,
      productId: products.get(key)!.id,
      contractId: contract?.id ?? `legado:${material.contract}`,
      qty: material.qty,
      location: material.location,
      supplier: material.supplier,
      oc: material.oc,
      nf: material.nf,
    });
  }
  return { products: [...products.values()], balances };
}
export function fromInventory(
  inventory: Inventory,
  contracts: Contract[],
): Material[] {
  const products = new Map(
    inventory.products.map((product) => [product.id, product]),
  );
  return inventory.balances.map((balance) => {
    const product = products.get(balance.productId);
    if (!product) throw new Error("Saldo sem cadastro global de produto.");
    const contract = contracts.find(
      (contract) => contract.id === balance.contractId,
    );
    return {
      id: balance.id,
      code: product.code,
      name: product.name,
      unit: product.unit,
      category: product.category,
      brand: product.brand,
      model: product.model,
      qty: balance.qty,
      contract: contract?.name ?? balance.contractId.replace(/^legado:/, ""),
      location: balance.location,
      supplier: balance.supplier,
      oc: balance.oc,
      nf: balance.nf,
    };
  });
}
