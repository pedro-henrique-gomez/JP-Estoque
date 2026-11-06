export type DataMode = "demo" | "online";
export interface BackendConfiguration {
  readonly mode: DataMode;
}
/** Demo factory stays inert. The separate experimental bootstrap gate never changes this default. */
export const backendConfiguration: BackendConfiguration = Object.freeze({
  mode: "demo",
});
