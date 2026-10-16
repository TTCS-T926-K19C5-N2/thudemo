import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stagingConfig,
  stagingRelease,
  stagingProxy,
  stagingForwardHeaders,
  holdProxyTarget,
} from "./laptop-gateway.mjs";
const valid = {
  profile: "sprint1-laptop-20261015",
  lanAddress: "192.168.1.50",
  gatewayPort: 3470,
  pgPort: 15455,
  redisPort: 16405,
  database: "sprint1_staging_20261015",
  user: "sprint1_staging",
  authProxySecret: "fixture-key-with-at-least-32-characters",
};
test("staging allows only the explicit independent RFC1918 LAN profile", () => {
  assert.equal(stagingConfig(valid), valid);
  for (const patch of [
    { lanAddress: "8.8.8.8" },
    { lanAddress: "127.0.0.1" },
    { lanAddress: "10.999.1.1" },
    { pgPort: 15432 },
    { redisPort: 16385 },
    { database: "sprint2_local" },
    { profile: "other" },
    { authProxySecret: "short" },
  ])
    assert.throws(() => stagingConfig({ ...valid, ...patch }));
});
test("traffic targets only fixed loopback slots with an exact source SHA", () => {
  assert.equal(
    stagingRelease({ sha: "a".repeat(40), webPort: 3473, apiPort: 3471 })
      .webPort,
    3473,
  );
  for (const patch of [
    { sha: "develop" },
    { webPort: 3000 },
    { apiPort: 3301 },
    { apiPort: 3472 },
  ])
    assert.throws(() =>
      stagingRelease({
        sha: "a".repeat(40),
        webPort: 3473,
        apiPort: 3471,
        ...patch,
      }),
    );
});
test("missing active release fails closed without forwarding or leaking a path", () => {
  let status, body;
  stagingProxy("missing-staging-release-file")(
    {},
    {
      writeHead(code) {
        status = code;
        return this;
      },
      end(value) {
        body = value;
      },
    },
  );
  assert.equal(status, 503);
  assert.equal(body, "Staging has no healthy active release");
});

test("HTTP2 pseudo/hop/forwarding headers never cross to HTTP1; gateway attestation remains", () => {
  const headers = stagingForwardHeaders(
    {
      ":authority": "evil.invalid",
      ":path": "/outside",
      connection: "upgrade",
      "x-forwarded-for": "198.51.100.1",
      "X-Real-IP": "198.51.100.2",
      cookie: "fixture",
      origin: "https://192.168.1.50:3470",
      "x-event-login-peer": "gateway-signature",
    },
    3473,
  );
  assert.deepEqual(headers, {
    host: "127.0.0.1:3473",
    cookie: "fixture",
    origin: "https://192.168.1.50:3470",
    "x-event-login-peer": "gateway-signature",
  });
});

test("direct hold network path is opt-in, exact canonical route and still targets API", () => {
  const active = { apiPort: 3471, directHoldProxy: true };
  const request = {
    method: "POST",
    url: "/api/showtimes/12345678-1234-1234-1234-123456789abc/holds",
  };
  assert.deepEqual(holdProxyTarget(request, active), {
    port: 3471,
    path: "/showtimes/12345678-1234-1234-1234-123456789abc/holds",
  });
  assert.equal(holdProxyTarget(request, { apiPort: 3471 }), null);
  for (const url of [
    "/api/auth/login",
    "/api/Auth/LOGIN",
    request.url.replace("holds", "holds/"),
    request.url.replace("showtimes", "%73howtimes"),
    request.url + "/../../auth/login",
    "https://evil.invalid" + request.url,
  ])
    assert.equal(holdProxyTarget({ ...request, url }, active), null);
  assert.equal(holdProxyTarget({ ...request, method: "GET" }, active), null);
});
