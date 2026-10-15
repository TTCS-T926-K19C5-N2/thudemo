import { describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loginTransport, runtimeOptions } from "./login-transport.mjs";
import {
  LOGIN_PEER_HEADER,
  signLoginPeer,
  verifyLoginPeer,
} from "shared/login-peer";
const secret = "fixture-secret-with-at-least-32-characters";
describe("Custom runtime entry boundary", () => {
  it("validates configuration before Next prepare/listen and respects the runtime port", () => {
    expect(() => runtimeOptions({}, [])).toThrow("AUTH_PROXY_SECRET");
    expect(() =>
      runtimeOptions({ AUTH_PROXY_SECRET: secret, WEB_PORT: "invalid" }, []),
    ).toThrow("Invalid web port");
    expect(
      runtimeOptions(
        { AUTH_PROXY_SECRET: secret, PORT: "12345", WEB_HOST: "0.0.0.0" },
        [],
      ),
    ).toMatchObject({ port: 12345, hostname: "0.0.0.0", dev: false });
    expect(
      runtimeOptions({ AUTH_PROXY_SECRET: secret, PORT: "12345" }, ["--dev"]),
    ).toMatchObject({ port: 3000, dev: true });
  });
  it("replaces even a valid caller attestation with its actual TCP peer; strips it off non-login routes", async () => {
    const handler = vi.fn((req, res) =>
      res.end(String(req.headers[LOGIN_PEER_HEADER] ?? "none")),
    );
    const server = createServer(loginTransport(handler, secret));
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    async function call(path: string, method = "POST") {
      return await new Promise<string>((resolve, reject) => {
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port: (server.address() as AddressInfo).port,
            path,
            method,
            localAddress: "127.0.0.4",
            headers: {
              [LOGIN_PEER_HEADER]: signLoginPeer("192.0.2.99", secret),
              "x-forwarded-for": "192.0.2.99",
            },
          },
          (response) => {
            let text = "";
            response.on("data", (chunk) => (text += chunk));
            response.on("end", () => resolve(text));
          },
        );
        req.on("error", reject);
        req.end();
      });
    }
    try {
      expect(verifyLoginPeer(await call("/api/auth/login"), secret)).toBe(
        "127.0.0.4",
      );
      expect(await call("/api/health", "GET")).toBe("none");
      for (const path of [
        "/api/Auth/LOGIN",
        "/api/auth/login/",
        "/api/%61uth/login",
      ]) {
        expect(verifyLoginPeer(await call(path), secret)).toBe("127.0.0.4");
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("returns a controlled error when transport metadata is unavailable", () => {
    const end = vi.fn(),
      writeHead = vi.fn().mockReturnValue({ end });
    const handler = vi.fn();
    loginTransport(handler, secret)(
      {
        method: "POST",
        url: "/api/auth/login",
        headers: {},
        socket: {},
      } as IncomingMessage,
      { writeHead } as unknown as ServerResponse,
    );
    expect(writeHead).toHaveBeenCalledWith(400);
    expect(handler).not.toHaveBeenCalled();
  });
  it("contains a rejected downstream handler without leaving the request hanging", async () => {
    const end = vi.fn(),
      writeHead = vi.fn();
    loginTransport(() => {
      throw new Error("private error");
    }, secret)(
      { method: "GET", headers: {} } as IncomingMessage,
      { writeHead, end, headersSent: false } as unknown as ServerResponse,
    );
    await vi.waitFor(() => expect(end).toHaveBeenCalled());
    expect(writeHead).toHaveBeenCalledWith(500);
    expect(end).toHaveBeenCalledWith();
  });
});
