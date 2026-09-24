import assert from "node:assert/strict";
import { test } from "node:test";

import { generateKeyPair, SignJWT } from "jose";

import {
  LaunchGateConfigurationError,
  accessCookieName,
  accessTokenFromRequest,
  decideLaunchAccess,
  parseLaunchGateConfiguration,
  verifyCloudflareAccessToken,
} from "../src/launch-gate.ts";
import { createLaunchGateWorker } from "../src/worker.ts";

const access = {
  teamDomain: "https://fukamu-test.cloudflareaccess.com",
  audience: "fukamu-web-test-audience",
};

const closedEnvironment = {
  APP_ENVIRONMENT: "production",
  PUBLIC_ACCESS_ENABLED: "false",
  LAUNCH_ALLOWED_USER_IDS_JSON: '["allowed-user"]',
  CF_ACCESS_TEAM_DOMAIN: access.teamDomain,
  CF_ACCESS_AUD: access.audience,
};

test("launch decision uses public OR allowed", () => {
  assert.deepEqual(decideLaunchAccess(false, true), {
    publicAccessEnabled: false,
    userAllowed: true,
    canAccess: true,
  });
  assert.equal(decideLaunchAccess(false, false).canAccess, false);
  assert.equal(decideLaunchAccess(true, false).canAccess, true);
  assert.equal(decideLaunchAccess(true, true).canAccess, true);
});

test("production configuration is strict and non-production is bypassed", () => {
  assert.equal(
    parseLaunchGateConfiguration({ APP_ENVIRONMENT: "test" })
      .publicAccessEnabled,
    true,
  );
  assert.equal(
    parseLaunchGateConfiguration(closedEnvironment).allowedUserIds.has(
      "allowed-user",
    ),
    true,
  );
  for (const environment of [
    { APP_ENVIRONMENT: "production" },
    { ...closedEnvironment, PUBLIC_ACCESS_ENABLED: "TRUE" },
    { ...closedEnvironment, LAUNCH_ALLOWED_USER_IDS_JSON: "not-json" },
    { ...closedEnvironment, CF_ACCESS_TEAM_DOMAIN: "https://example.com" },
  ]) {
    assert.throws(
      () => parseLaunchGateConfiguration(environment),
      LaunchGateConfigurationError,
    );
  }
});

test("Cloudflare Access JWT signature, issuer, audience, and subject are verified", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const token = await new SignJWT({ sub: "allowed-user" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(access.teamDomain)
    .setAudience(access.audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  assert.equal(
    await verifyCloudflareAccessToken(token, access, publicKey),
    "allowed-user",
  );
  await assert.rejects(() =>
    verifyCloudflareAccessToken(
      token,
      { ...access, audience: "another-audience" },
      publicKey,
    ),
  );
});

test("identity comes only from a signed Access token header or cookie", () => {
  assert.equal(
    accessTokenFromRequest(
      new Request("https://web.example/", {
        headers: { "Cf-Access-Jwt-Assertion": "header-token" },
      }),
    ),
    "header-token",
  );
  assert.equal(
    accessTokenFromRequest(
      new Request("https://web.example/", {
        headers: { Cookie: `other=x; ${accessCookieName}=cookie-token` },
      }),
    ),
    "cookie-token",
  );
  assert.equal(
    accessTokenFromRequest(
      new Request("https://web.example/?user_id=allowed-user"),
    ),
    undefined,
  );
});

test("closed production denies unlisted direct requests before assets", async () => {
  let assetCalls = 0;
  const worker = createLaunchGateWorker({
    verifyAccessToken: async (token) => {
      if (token === "allowed-token") return "allowed-user";
      if (token === "missing-user-token") return "missing-user";
      throw new Error("invalid token");
    },
  });
  const env = {
    ...closedEnvironment,
    ASSETS: {
      fetch: async () => {
        assetCalls += 1;
        return new Response("private site", {
          headers: { "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  };

  for (const request of [
    new Request("https://web.example/company/"),
    new Request("https://web.example/company/?user_id=allowed-user"),
    new Request("https://web.example/company/", {
      headers: { "Cf-Access-Jwt-Assertion": "forged-token" },
    }),
    new Request("https://web.example/company/", {
      headers: { Cookie: `${accessCookieName}=missing-user-token` },
    }),
  ]) {
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
  assert.equal(assetCalls, 0);

  const allowed = await worker.fetch(
    new Request("https://web.example/company/", {
      headers: { Cookie: `${accessCookieName}=allowed-token` },
    }),
    env,
  );
  assert.equal(allowed.status, 200);
  assert.equal(await allowed.text(), "private site");
  assert.equal(allowed.headers.get("Cache-Control"), "private, no-store");
  assert.equal(assetCalls, 1);
});

test("launch status is current-user-only, private, and fail-closed", async () => {
  const worker = createLaunchGateWorker({
    verifyAccessToken: async (token) =>
      token === "allowed-token" ? "allowed-user" : "missing-user",
  });
  const env = {
    ...closedEnvironment,
    ASSETS: { fetch: async () => new Response("unexpected") },
  };
  const denied = await worker.fetch(
    new Request("https://web.example/api/launch-status"),
    env,
  );
  assert.deepEqual(await denied.json(), {
    publicAccessEnabled: false,
    userAllowed: false,
    canAccess: false,
  });
  assert.equal(denied.headers.get("Cache-Control"), "private, no-store");

  const allowed = await worker.fetch(
    new Request("https://web.example/api/launch-status", {
      headers: { Cookie: `${accessCookieName}=allowed-token` },
    }),
    env,
  );
  assert.deepEqual(await allowed.json(), {
    publicAccessEnabled: false,
    userAllowed: true,
    canAccess: true,
  });

  const unavailable = await worker.fetch(
    new Request("https://web.example/api/launch-status"),
    { ...env, PUBLIC_ACCESS_ENABLED: "invalid" },
  );
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    error: { code: "LAUNCH_GATE_UNAVAILABLE" },
  });
});

test("public access bypasses the allowlist and preserves static cache policy", async () => {
  const worker = createLaunchGateWorker({
    verifyAccessToken: async () => {
      throw new Error("verification must not run after general availability");
    },
  });
  const env = {
    APP_ENVIRONMENT: "production",
    PUBLIC_ACCESS_ENABLED: "true",
    ASSETS: {
      fetch: async () =>
        new Response("public site", {
          headers: { "Cache-Control": "public, max-age=3600" },
        }),
    },
  };
  const response = await worker.fetch(new Request("https://web.example/"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=3600");
});

test("the Access entry path redirects only approved identities to a local path", async () => {
  const worker = createLaunchGateWorker({
    verifyAccessToken: async () => "allowed-user",
  });
  const env = {
    ...closedEnvironment,
    ASSETS: { fetch: async () => new Response("unexpected") },
  };
  const response = await worker.fetch(
    new Request("https://web.example/__launch-auth?returnTo=%2Fcompany%2F", {
      headers: { "Cf-Access-Jwt-Assertion": "valid-token" },
    }),
    env,
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "/company/");

  const unsafe = await worker.fetch(
    new Request(
      "https://web.example/__launch-auth?returnTo=https%3A%2F%2Fevil.example",
      { headers: { "Cf-Access-Jwt-Assertion": "valid-token" } },
    ),
    env,
  );
  assert.equal(unsafe.headers.get("Location"), "/");

  const controlCharacter = await worker.fetch(
    new Request(
      "https://web.example/__launch-auth?returnTo=%2Fcompany%2F%0Aoutside",
      { headers: { "Cf-Access-Jwt-Assertion": "valid-token" } },
    ),
    env,
  );
  assert.equal(controlCharacter.headers.get("Location"), "/");
});

test("logout is reachable without application access and delegates cookie removal to Access", async () => {
  let assetCalls = 0;
  const worker = createLaunchGateWorker({
    verifyAccessToken: async () => {
      throw new Error("logout must not require an application identity");
    },
  });
  const response = await worker.fetch(
    new Request("https://web.example/__launch-logout"),
    {
      ...closedEnvironment,
      ASSETS: {
        fetch: async () => {
          assetCalls += 1;
          return new Response("unexpected");
        },
      },
    },
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "/cdn-cgi/access/logout");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(assetCalls, 0);
});
