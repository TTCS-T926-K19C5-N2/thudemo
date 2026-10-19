import {
  signLoginPeer,
  LOGIN_PEER_HEADER,
  isPeerProtectedProxyPath,
} from "shared/login-peer";

/** @param {Record<string, string | undefined>} env @param {string[]} args */
export function runtimeOptions(env = process.env, args = process.argv) {
  const dev = args.includes("--dev");
  const hostname = env.WEB_HOST ?? "127.0.0.1";
  const port = Number(env.WEB_PORT ?? (dev ? 3000 : (env.PORT ?? 3000)));
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid web port");
  signLoginPeer("127.0.0.1", env.AUTH_PROXY_SECRET);
  return { dev, hostname, port, secret: env.AUTH_PROXY_SECRET };
}

/** @param {import('node:http').RequestListener} handler @param {string} secret */
export function loginTransport(handler, secret) {
  /** @type {import('node:http').RequestListener} */
  const listener = (request, response) => {
    delete request.headers[LOGIN_PEER_HEADER];
    try {
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      if (request.method === "POST" && isPeerProtectedProxyPath(path)) {
        request.headers[LOGIN_PEER_HEADER] = signLoginPeer(
          request.socket.remoteAddress,
          secret,
        );
      }
    } catch {
      response.writeHead(400).end("Invalid request");
      return;
    }
    void Promise.resolve()
      .then(() => handler(request, response))
      .catch(() => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      });
  };
  return listener;
}
