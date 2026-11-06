export type LocalState =
  | "missing"
  | "ready"
  | "empty"
  | "incompatible"
  | "unavailable";
export function readLocal(key: string): { state: LocalState; value?: unknown } {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return { state: "unavailable" };
  }
  if (raw === null) return { state: "missing" };
  try {
    return { state: "ready", value: JSON.parse(raw) };
  } catch {
    return { state: "incompatible" };
  }
}
