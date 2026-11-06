import type { Role } from "../types";

export type UUID = string;
/** Postgres numeric is transported as a decimal string, never rounded to a JS float. */
export type DecimalQuantity = string;
export interface RemoteProfile {
  id: UUID;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}
export interface RemoteProduct {
  id: UUID;
  code: string;
  description: string;
  unit: string;
  category: string;
  manufacturer: string;
  model: string;
}
export interface RemoteBalance {
  id: UUID;
  productId: UUID;
  contractId: UUID;
  quantity: DecimalQuantity;
  locationId: UUID | null;
  supplierId: UUID | null;
  updatedAt: string;
}
export interface RemoteIdentityPort {
  getVerifiedProfile(): Promise<RemoteProfile | null>;
}
export interface RemoteInventoryPort {
  listProducts(): Promise<RemoteProduct[]>;
  listBalances(contractId?: UUID): Promise<RemoteBalance[]>;
  saveProduct(product: RemoteProduct): Promise<void>;
  saveBalance(balance: RemoteBalance): Promise<void>;
}
export interface RemoteAdministrationPort {
  listUsers(): Promise<RemoteProfile[]>;
  saveOtherUser(profile: RemoteProfile): Promise<void>;
  setOtherUserContract(
    userId: UUID,
    contractId: UUID,
    authorized: boolean,
  ): Promise<void>;
}
export interface OnlinePorts {
  identity: RemoteIdentityPort;
  inventory: RemoteInventoryPort;
  administration: RemoteAdministrationPort;
}
