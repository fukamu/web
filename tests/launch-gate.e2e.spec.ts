import { expect, test } from "@playwright/test";

test("production-like Worker denies pages and direct assets without an approved identity", async ({
  request,
}) => {
  for (const path of ["/", "/company/", "/_assets/nonexistent.css"]) {
    const response = await request.get(path, { failOnStatusCode: false });
    expect(response.status(), path).toBe(403);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(response.headers().vary).toContain("Cookie");
  }
});

test("production-like Worker returns only the current request launch status", async ({
  request,
}) => {
  const response = await request.get("/api/launch-status");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    publicAccessEnabled: false,
    userAllowed: false,
    canAccess: false,
  });
  expect(response.headers()["cache-control"]).toBe("private, no-store");
});

test("logout remains reachable while the gate is closed", async ({
  request,
}) => {
  const response = await request.get("/__launch-logout", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe("/cdn-cgi/access/logout");
  expect(response.headers()["cache-control"]).toBe("private, no-store");
});

test("limited-release screen is usable without application JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL: baseURL ?? "http://127.0.0.1:8789",
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  const response = await page.goto("/company/");
  expect(response?.status()).toBe(403);
  await expect(page.getByRole("heading", { name: "FUKAMU" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "許可済みアカウントでログイン" }),
  ).toHaveAttribute("href", "/__launch-auth?returnTo=%2Fcompany%2F");
  await context.close();
});
