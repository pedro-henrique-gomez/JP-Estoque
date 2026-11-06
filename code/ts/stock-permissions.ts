export const stockPermissions = {
  "estoque.visualizar": "Consultar estoque",
  "entrada.visualizar": "Consultar entradas",
  "entrada.registrar": "Registrar entradas",
  "saida.visualizar": "Consultar saídas",
  "saida.registrar": "Registrar saídas",
  "historico.visualizar_proprio": "Consultar histórico próprio",
  "historico.visualizar_geral": "Consultar histórico geral",
  "relatorios.exportar": "Exportar relatórios/comprovantes",
  "usuarios.visualizar": "Consultar usuários",
  "usuarios.gerenciar": "Gerenciar usuários",
  "cargos.gerenciar": "Gerenciar cargos",
  "permissoes.gerenciar": "Gerenciar permissões",
  "movimentacoes.estornar": "Estornar movimentações",
} as const;
export type StockPermission = keyof typeof stockPermissions;
export function stockCan(caps: readonly string[], permission: StockPermission) {
  return caps.includes(permission);
}
export function stockQuantity(value: string, allowZero = false): string {
  const normalized = value.trim().replace(",", ".");
  if (!/^[0-9]{1,18}(\.[0-9]{1,6})?$/.test(normalized))
    throw Error(
      "Informe quantidade decimal com até seis casas, sem separador de milhar.",
    );
  const [integer, fraction = ""] = normalized.split(".");
  const scaled = BigInt(integer) * 1000000n + BigInt(fraction.padEnd(6, "0"));
  if (!allowZero && scaled === 0n)
    throw Error("A quantidade deve ser maior que zero.");
  return `${BigInt(integer)}.${fraction.padEnd(6, "0")}`;
}
export function stockProposed(
  before: string,
  quantity: string,
  kind: "entrada" | "saida",
) {
  const scaled = (v: string) => BigInt(stockQuantity(v, true).replace(".", ""));
  const result =
    scaled(before) +
    (kind === "entrada" ? scaled(quantity) : -scaled(quantity));
  if (result < 0n) throw Error("Quantidade superior ao saldo disponível.");
  if (result > 999999999999999999999999n)
    throw Error("Saldo excede a precisão suportada.");
  return `${result / 1000000n}.${(result % 1000000n).toString().padStart(6, "0")}`;
}
