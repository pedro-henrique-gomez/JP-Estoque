import { canManage, hasPermission, type Permission } from "./access";
import { contracts, demoUsers } from "./demo-data";
import {
  roles,
  type AuditEntry,
  type Contract,
  type GeneralSettings,
  type Material,
  type Supplier,
  type User,
} from "./types";
import { demoAdminStorage } from "./demo-admin-storage";

/** Local fictitious administration. Never an identity or security provider. */
export class DemoAdministration {
  readonly users = demoUsers;
  readonly contracts = contracts;
  readonly history: AuditEntry[] = [];
  readonly settings: GeneralSettings = {
    systemName: "JP Estoque",
    supportEmail: "suporte@example.invalid",
  };
  constructor(
    private readonly actor: () => User,
    private readonly materials: () => Material[],
    readonly suppliers: Supplier[],
  ) {
    const saved = demoAdminStorage.load();
    if (saved) {
      this.users.splice(0, this.users.length, ...saved.users);
      this.contracts.splice(0, this.contracts.length, ...saved.contracts);
      this.suppliers.splice(0, this.suppliers.length, ...saved.suppliers);
      Object.assign(this.settings, saved.settings);
      this.history.push(...saved.history);
    }
  }
  persist(): boolean {
    return demoAdminStorage.save({
      users: this.users,
      contracts: this.contracts,
      suppliers: this.suppliers,
      settings: this.settings,
      history: this.history,
    });
  }
  private require(permission: Permission): void {
    if (!hasPermission(this.actor(), permission))
      throw new Error("Ação indisponível para o perfil demonstrativo atual.");
  }
  record(
    action: string,
    entity: string,
    before: unknown = null,
    after: unknown = null,
  ): void {
    const actor = this.actor();
    this.history.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actorId: actor.id,
      actorName: actor.name,
      action,
      entity,
      before: structuredClone(before),
      after: structuredClone(after),
    });
  }
  saveUser(input: User): void {
    this.require("manage_users");
    const existing = this.users.find((user) => user.id === input.id);
    if (
      !existing ||
      existing.role !== input.role ||
      JSON.stringify(existing.authorizedContractIds) !==
        JSON.stringify(input.authorizedContractIds)
    )
      this.require("manage_permissions");
    if (!existing || existing.status !== input.status)
      this.require("change_user_status");
    if (
      !roles.includes(input.role) ||
      !["ativo", "inativo"].includes(input.status) ||
      !input.name.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
    )
      throw new Error("Informe nome, email, perfil e status válidos.");
    if (
      input.authorizedContractIds.some(
        (id) => !this.contracts.some((contract) => contract.id === id),
      )
    )
      throw new Error("Contrato autorizado não cadastrado.");
    if (
      this.users.some(
        (user) =>
          user.id !== input.id &&
          user.email.toLowerCase() === input.email.trim().toLowerCase(),
      )
    )
      throw new Error("Email já cadastrado.");
    if (
      existing &&
      canManage(existing) &&
      !canManage(input) &&
      this.users.filter(canManage).length === 1
    )
      throw new Error(
        "Mantenha ao menos um Proprietário ou Administrador ativo.",
      );
    const before = existing ? structuredClone(existing) : null;
    const user = {
      ...input,
      name: input.name.trim(),
      email: input.email.trim(),
      authorizedContractIds: [...new Set(input.authorizedContractIds)],
    };
    if (existing) Object.assign(existing, user);
    else this.users.push({ ...user, id: `demo-${crypto.randomUUID()}` });
    this.record(
      existing ? "Usuário atualizado" : "Usuário criado",
      user.name,
      before,
      existing ?? this.users.at(-1),
    );
  }
  saveContract(input: Contract): void {
    this.require("manage_contracts");
    const existing = this.contracts.find(
      (contract) => contract.id === input.id,
    );
    const name = input.name.trim();
    if (
      !name ||
      this.contracts.some(
        (contract) =>
          contract.id !== input.id &&
          contract.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new Error("Informe um nome de contrato único.");
    const before = existing ? { ...existing } : null;
    if (existing) {
      const previous = existing.name;
      this.materials()
        .filter((material) => material.contract === previous)
        .forEach((material) => (material.contract = name));
      existing.name = name;
    } else this.contracts.push({ id: `contrato-${crypto.randomUUID()}`, name });
    this.record(
      existing ? "Contrato atualizado" : "Contrato criado",
      name,
      before,
      existing ?? this.contracts.at(-1),
    );
  }
  removeContract(id: string): void {
    this.require("manage_contracts");
    const index = this.contracts.findIndex((contract) => contract.id === id);
    if (index < 0) return;
    const contract = this.contracts[index];
    if (
      this.materials().some(
        (material) => material.contract === contract.name,
      ) ||
      this.users.some((user) => user.authorizedContractIds.includes(id))
    )
      throw new Error(
        "Contrato vinculado a materiais ou usuários. Remova os vínculos antes de excluir.",
      );
    this.contracts.splice(index, 1);
    this.record("Contrato excluído", contract.name, contract);
  }
  saveSupplier(input: Supplier): void {
    this.require("manage_suppliers");
    const existing = this.suppliers.find(
      (supplier) => supplier.id === input.id,
    );
    const name = input.name.trim();
    if (
      !name ||
      this.suppliers.some(
        (supplier) =>
          supplier.id !== input.id &&
          supplier.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new Error("Informe um nome de fornecedor único.");
    const before = existing ? { ...existing } : null;
    const supplier = { ...input, name };
    if (existing) {
      this.materials()
        .filter((material) => material.supplier === existing.name)
        .forEach((material) => (material.supplier = name));
      Object.assign(existing, supplier);
    } else
      this.suppliers.push({
        ...supplier,
        id: `fornecedor-${crypto.randomUUID()}`,
      });
    this.record(
      existing ? "Fornecedor atualizado" : "Fornecedor criado",
      name,
      before,
      existing ?? this.suppliers.at(-1),
    );
  }
  removeSupplier(id: string): void {
    this.require("manage_suppliers");
    const index = this.suppliers.findIndex((supplier) => supplier.id === id);
    if (index < 0) return;
    const supplier = this.suppliers[index];
    if (
      this.materials().some((material) => material.supplier === supplier.name)
    )
      throw new Error(
        "Fornecedor vinculado a materiais. Remova os vínculos antes de excluir.",
      );
    this.suppliers.splice(index, 1);
    this.record("Fornecedor excluído", supplier.name, supplier);
  }
  saveSettings(settings: GeneralSettings): void {
    this.require("manage_settings");
    if (
      !settings.systemName.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.supportEmail)
    )
      throw new Error(
        "Informe o nome do sistema e um email de suporte válido.",
      );
    const before = { ...this.settings };
    Object.assign(this.settings, {
      systemName: settings.systemName.trim(),
      supportEmail: settings.supportEmail.trim(),
    });
    this.record("Configurações atualizadas", "Sistema", before, this.settings);
  }
}
