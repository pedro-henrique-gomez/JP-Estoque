import { createServer } from "node:net";
import { resolve, sep, basename } from "node:path";
export function assertWorkspace(root, workspace) {
  const base = resolve(root, ".integration-local");
  const path = resolve(workspace);
  if (
    !path.startsWith(base + sep) ||
    !/^preflight-[0-9a-f-]{36}$/.test(basename(path))
  )
    throw Error("Unsafe disposable workspace");
  return path;
}
export async function checkPorts(ports) {
  for (const port of ports)
    await new Promise((done, reject) => {
      const server = createServer();
      server.once("error", () =>
        reject(Error(`Required local port ${port} unavailable`)),
      );
      server.listen(port, "0.0.0.0", () => server.close(done));
    });
}
