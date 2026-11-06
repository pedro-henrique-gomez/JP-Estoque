import { roles, type Contract, type User } from "./types";

export const contracts: Contract[] = ["A", "B", "C", "D"].map((letter) => ({
  id: `contrato-${letter.toLowerCase()}`,
  name: `Contrato ${letter}`,
}));
export const demoUsers: User[] = roles.map((role, index) => ({
  id: `demo-${index + 1}`,
  name: [
    "Ana Souza",
    "Bruno Lima",
    "Carla Mendes",
    "Daniel Costa",
    "Elisa Santos",
    "Felipe Rocha",
    "Gabriela Alves",
  ][index],
  email: `usuario${index + 1}@example.invalid`,
  role,
  status: "ativo",
  authorizedContractIds:
    index === 0
      ? ["contrato-a"]
      : index === 1
        ? ["contrato-b"]
        : ["contrato-a", "contrato-c"],
}));
demoUsers.push(
  {
    id: "demo-inativo",
    name: "Henrique (inativo)",
    email: "inativo@example.invalid",
    role: "administrador",
    status: "inativo",
    authorizedContractIds: ["contrato-a"],
  },
  {
    id: "demo-sem-contratos",
    name: "Iara (sem contratos)",
    email: "semcontratos@example.invalid",
    role: "funcionario_autorizado",
    status: "ativo",
    authorizedContractIds: [],
  },
);
// Immutable copies for the explicit empty-base demonstration loader only.
export const demoUserFixtures = structuredClone(demoUsers);
export const demoContractFixtures = structuredClone(contracts);
