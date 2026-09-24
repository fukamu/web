import { expect, test } from "@playwright/test";

import { routeKeys, routes } from "../src/data/routes.ts";

const baseUrl = process.env.SITE_BASE_URL;
if (!baseUrl)
  throw new Error("SITE_BASE_URL is required for production smoke tests.");
const productionOrigin = new URL(baseUrl).origin;
const localizedRoutes = routeKeys.flatMap((key) => [
  routes.ja[key],
  routes.en[key],
]);

for (const route of localizedRoutes) {
  test(`production ${route} is indexable, canonical, and error-free`, async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const response = await page.goto(route, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "index,follow",
    );
    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    expect(canonical).toBe(new URL(route, productionOrigin).href);
    await expect(page.locator(".preview-banner")).toHaveCount(0);
    await expect(page.locator(".brand-link img")).toHaveCount(1);
    expect(consoleErrors).toEqual([]);
  });
}

test("production redirects, 404, ETag, and cache policy work", async ({
  request,
}) => {
  const redirect = await request.get("/company", { maxRedirects: 0 });
  expect(redirect.status()).toBe(307);
  expect(redirect.headers().location).toBe("/company/");

  const notFound = await request.get("/production-smoke-not-found/");
  expect(notFound.status()).toBe(404);

  const html = await request.get("/");
  expect(html.headers()["cache-control"]).toBe(
    "public, max-age=0, must-revalidate",
  );
  const etag = html.headers().etag;
  expect(etag).toBeTruthy();
  if (!etag) throw new Error("Production HTML response is missing an ETag.");
  const revalidated = await request.get("/", {
    headers: { "If-None-Match": etag },
  });
  expect(revalidated.status()).toBe(304);

  const body = await html.text();
  const cssPath = body.match(/<link[^>]+href="([^"]+\.css)"/u)?.[1];
  expect(cssPath).toBeTruthy();
  if (!cssPath) throw new Error("Production HTML is missing its stylesheet.");
  const css = await request.get(cssPath);
  expect(css.headers()["cache-control"]).toBe(
    "public, max-age=31536000, immutable",
  );
});

test("production contact, notices, analytics script, and beacon are live", async ({
  page,
  request,
}) => {
  await page.goto("/contact/");
  const mailto = await page.locator('a[href^="mailto:"]').getAttribute("href");
  expect(mailto).toMatch(/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/u);

  await page.goto("/company/");
  const noticeHref = await page
    .locator('#public-notices a[href^="https://"]')
    .getAttribute("href");
  expect(noticeHref).toBeTruthy();
  if (!noticeHref)
    throw new Error("Production company page is missing the notice URL.");
  const notice = await request.get(noticeHref);
  expect(notice.status()).toBe(200);
  expect(notice.url()).toMatch(/^https:\/\//u);
  expect(await notice.text()).toContain("FUKAMU");

  const scriptResponse = page.waitForResponse((response) =>
    response
      .url()
      .startsWith("https://static.cloudflareinsights.com/beacon.min.js"),
  );
  const beaconRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().startsWith("https://cloudflareinsights.com/cdn-cgi/rum"),
    { timeout: 15_000 },
  );
  await page.goto("/");
  expect((await scriptResponse).status()).toBe(200);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await beaconRequest;
});
