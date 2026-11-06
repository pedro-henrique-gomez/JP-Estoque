export type DataMode = "demo" | "online";
export interface BackendConfiguration {
  readonly mode: DataMode;
}
/** Build-time choice only. No URL, selector, environment or localStorage can enable online. */
export const backendConfiguration: BackendConfiguration = Object.freeze({
  mode: "demo",
});
