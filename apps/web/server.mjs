import { createServer } from "node:http";
import next from "next";
import {
  runtimeOptions,
  loginTransport,
} from "./src/lib/server/login-transport.mjs";

const { dev, hostname, port, secret } = runtimeOptions();
const app = next({ dev, dir: import.meta.dirname, hostname, port });
await app.prepare();
const handler = app.getRequestHandler();
createServer(loginTransport(handler, secret)).listen(port, hostname, () =>
  console.log(`Web listening on ${hostname}:${port}`),
);
