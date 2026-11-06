import { demoStorage } from "../demo-storage";
import { demoAdminStorage } from "../demo-admin-storage";
import { backendConfiguration, type BackendConfiguration } from "./config";

/** Existing adapters are returned unchanged. Creating this object performs no I/O. */
export function createBackend(
  configuration: BackendConfiguration = backendConfiguration,
) {
  if (configuration.mode !== "demo")
    throw new Error(
      "Modo online desativado neste adaptador de demonstração. A rota experimental exige configuração explícita de desenvolvimento; nenhuma conexão foi iniciada.",
    );
  return Object.freeze({
    mode: "demo" as const,
    materials: demoStorage,
    administration: demoAdminStorage,
  });
}
