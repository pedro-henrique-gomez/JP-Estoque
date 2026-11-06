export const roles = [
  "funcionario_autorizado",
  "almoxarife",
  "coordenador",
  "planejamento",
  "diretor",
  "proprietario",
  "administrador",
] as const;
export type Role = (typeof roles)[number];
export type UserStatus = "ativo" | "inativo";
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  authorizedContractIds: string[];
}
export interface Contract {
  id: string;
  name: string;
}
export interface Material {
  id: number;
  code: string;
  name: string;
  category: string;
  contract: string;
  qty: number;
  unit: string;
  location: string;
  brand: string;
  model: string;
  supplier: string;
  oc: string;
  nf: string;
}
/** Future implementations must obtain identity from a verified server session. */
export interface IdentityProvider {
  getCurrentUser(): Promise<User | null>;
}
/** A future remote implementation must rely on database RLS for every operation. */
export interface MaterialRepository {
  list(): Promise<Material[]>;
  upsert(material: Material): Promise<void>;
  remove(id: number): Promise<void>;
}
export interface Supplier {
  id: string;
  name: string;
  areas: string;
  contact: string;
}
export interface GeneralSettings {
  systemName: string;
  supportEmail: string;
}
export interface AuditEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  action: string;
  entity: string;
  before: unknown;
  after: unknown;
}
/** Implement remotely with verified Auth + RLS/privileged audited server operations. */
export interface AdministrationRepository {
  listUsers(): Promise<User[]>;
  saveUser(user: User): Promise<void>;
  listContracts(): Promise<Contract[]>;
  saveContract(contract: Contract): Promise<void>;
  listSuppliers(): Promise<Supplier[]>;
  saveSupplier(supplier: Supplier): Promise<void>;
  listHistory(): Promise<AuditEntry[]>;
  getSettings(): Promise<GeneralSettings>;
  saveSettings(settings: GeneralSettings): Promise<void>;
}
export interface DemoSnapshot {
  materials: Material[];
  updated: string;
}
