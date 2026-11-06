// No payloads, names, addresses, SQL, paths or credentials accepted by this sink.
export function operationEvent(event, durationMs, status) {
  if (
    ![
      "backup",
      "restore",
      "auth",
      "import",
      "read",
      "write",
      "security",
    ].includes(event) ||
    !["passed", "failed", "blocked"].includes(status) ||
    !Number.isFinite(durationMs) ||
    durationMs < 0
  )
    throw Error("Invalid operational event");
  return Object.freeze({
    event,
    status,
    durationMs: Math.round(durationMs),
    at: new Date().toISOString(),
  });
}
