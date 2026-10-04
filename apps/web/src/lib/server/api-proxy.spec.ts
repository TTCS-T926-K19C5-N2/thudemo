import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyApi, upstreamUrl } from "./api-proxy";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Runtime same-origin API proxy", () => {
  it("uses runtime origin and preserves query without path escape", () => {
    expect(
      upstreamUrl(
        "https://sang-api.onrender.com",
        ["showtimes", "abc"],
        "?cursor=a%2Fb",
      ).href,
    ).toBe("https://sang-api.onrender.com/showtimes/abc?cursor=a%2Fb");
    for (const path of [[".."], ["//other.example"], ["a\\b"]])
      expect(() => upstreamUrl("https://api.example", path, "")).toThrow();
    expect(() =>
      upstreamUrl("https://secret@api.example", ["health"], ""),
    ).toThrow();
  });
  it("forwards cookie and real origin, strips spoofed headers and preserves errors/cookies", async () => {
    vi.stubEnv("API_INTERNAL_URL", "https://sang-api.onrender.com");
    const headers = new Headers({
      "content-type": "application/json",
      "retry-after": "60",
    });
    headers.append(
      "set-cookie",
      "session=fixture; HttpOnly; Secure; Path=/; SameSite=Lax",
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('{"message":"locked"}', { status: 429, headers }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const res = await proxyApi(
      new Request("https://sang-web.onrender.com/api/auth/login", {
        method: "POST",
        headers: {
          origin: "https://sang-web.onrender.com",
          cookie: "session=fixture",
          "x-forwarded-host": "spoof",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      ["auth", "login"],
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    const forwarded = fetchMock.mock.calls[0][1].headers as Headers;
    expect(forwarded.get("origin")).toBe("https://sang-web.onrender.com");
    expect(forwarded.get("cookie")).toBe("session=fixture");
    expect(forwarded.has("x-forwarded-host")).toBe(false);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("fails closed without exposing upstream credentials and bounds body before forwarding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private internal detail")),
    );
    const res = await proxyApi(new Request("http://localhost/api/health"), [
      "health",
    ]);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("private");
    const big = await proxyApi(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: "x".repeat(5 * 1024 * 1024 + 1),
      }),
      ["upload"],
    );
    expect(big.status).toBe(413);
  });
});
