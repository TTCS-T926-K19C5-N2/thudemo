import { spawn } from "node:child_process";
const role = process.env.SERVICE_ROLE;
const paths = {
  api: ["/app/api", "dist/main.js"],
  web: ["/app/web/apps/web", "server.js"],
};
if (!Object.hasOwn(paths, role))
  throw new Error("SERVICE_ROLE must be api or web");
if (role === "web" && !process.env.API_INTERNAL_URL)
  throw new Error("API_INTERNAL_URL required");
const [cwd, entry] = paths[role];
const child = spawn(process.execPath, [entry], {
  cwd,
  env: process.env,
  stdio: "inherit",
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("error", () => {
  console.error("Service process failed to start");
  process.exitCode = 1;
});
child.on("exit", (code) => process.exit(code ?? 1));
