import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { routeKeys, routes } from "../src/data/routes.ts";
import { site } from "../src/data/site.ts";

const localizedRoutes = routeKeys.flatMap((key) => [
  routes.ja[key],
  routes.en[key],
]);

for (const route of localizedRoutes) {
  test(`${route} renders with metadata, no serious axe findings, and no overflow`, async ({
    page,
  }) => {
    const response = await page.goto(route, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(
      page.locator('link[rel="alternate"][hreflang="ja"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('link[rel="alternate"][hreflang="en"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('link[rel="alternate"][hreflang="x-default"]'),
    ).toHaveCount(1);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(
      accessibility.violations.filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
}

test("internal links resolve and language links preserve page meaning", async ({
  page,
  request,
}) => {
  const links = new Set<string>();
  for (const route of localizedRoutes) {
    await page.goto(route);
    for (const href of await page
      .locator("a[href]")
      .evaluateAll((anchors) =>
        anchors
          .map((anchor) => anchor.getAttribute("href"))
          .filter((href): href is string => Boolean(href)),
      )) {
      const localPath = href.split("#")[0];
      if (href.startsWith("/") && localPath) links.add(localPath);
    }
    const expectedLanguage = route.startsWith("/en/") ? "ja" : "en";
    await expect(page.locator(`a[hreflang="${expectedLanguage}"]`)).toHaveCount(
      1,
    );
  }

  for (const link of links) {
    const response = await request.get(link);
    expect(response.status(), link).toBe(200);
  }
});

test("Workers-style canonicalization and 404 behavior are real HTTP responses", async ({
  request,
}) => {
  const withoutSlash = await request.get("/company", { maxRedirects: 0 });
  expect(withoutSlash.status()).toBe(307);
  expect(withoutSlash.headers().location).toBe("/company/");

  const htmlPath = await request.get("/company/index.html", {
    maxRedirects: 0,
  });
  expect(htmlPath.status()).toBe(307);
  expect(htmlPath.headers().location).toBe("/company/");

  const unknown = await request.get("/not-a-real-page/");
  expect(unknown.status()).toBe(404);
  const body = await unknown.text();
  expect(body).toContain("ページが見つかりません");
  expect(body).toContain("The requested page could not be found.");
});

test("navigation and content remain usable with JavaScript disabled", async ({
  browser,
  baseURL,
}) => {
  const resolvedBaseUrl = baseURL ?? "http://127.0.0.1:8788";
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: resolvedBaseUrl,
  });
  const page = await context.newPage();
  for (const route of localizedRoutes) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("nav a[href]")).not.toHaveCount(0);
  }
  await context.close();
});

test("analytics blocking does not affect content or navigation", async ({
  page,
}) => {
  await page.route("https://static.cloudflareinsights.com/**", (route) =>
    route.abort("blockedbyclient"),
  );
  await page.route("https://cloudflareinsights.com/**", (route) =>
    route.abort("blockedbyclient"),
  );
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  await page.getByRole("link", { name: /FUKAMU Notes/u }).click();
  await expect(page).toHaveURL(/\/products\/notes\/$/u);
  await expect(page.locator("h1")).toHaveText("FUKAMU Notes");
});

test("semantic design tokens reach computed styles", async ({ page }) => {
  await page.goto("/");
  const styles = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const action = getComputedStyle(
      document.querySelector(".action-link") as HTMLElement,
    );
    const root = getComputedStyle(document.documentElement);
    return {
      bodyColor: body.color,
      bodyBackground: body.backgroundColor,
      bodyFont: body.fontFamily,
      actionBackground: action.backgroundColor,
      tokenPrimary: root
        .getPropertyValue("--fukamu-color-action-primary")
        .trim(),
      primitiveUsage: [...document.styleSheets]
        .flatMap((sheet) => {
          try {
            return [...sheet.cssRules].map((rule) => rule.cssText);
          } catch {
            return [];
          }
        })
        .filter((rule) => !rule.includes(":root"))
        .some((rule) => rule.includes("--fukamu-primitive-")),
    };
  });
  expect(styles.bodyColor).toBe("rgb(16, 35, 63)");
  expect(styles.bodyBackground).toBe("rgb(255, 255, 255)");
  expect(styles.bodyFont).toContain("Hiragino Sans");
  expect(styles.actionBackground).toBe("rgb(13, 59, 142)");
  expect(styles.tokenPrimary.toLowerCase()).toBe("#0d3b8e");
  expect(styles.primitiveUsage).toBe(false);
});

test("skip link and keyboard focus are visible", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.locator(".skip-link");
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("320 CSS px reflow has no horizontal page overflow", async ({
  browser,
  baseURL,
}) => {
  const resolvedBaseUrl = baseURL ?? "http://127.0.0.1:8788";
  const context = await browser.newContext({
    viewport: { width: 320, height: 720 },
    baseURL: resolvedBaseUrl,
  });
  const page = await context.newPage();
  for (const route of localizedRoutes) {
    await page.goto(route);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, route).toBeLessThanOrEqual(0);
  }
  await context.close();
});

test("draft output is visibly gated and does not expose fake release values", async ({
  page,
}) => {
  await page.goto("/company/");
  if (site.publicationStatus === "draft") {
    await expect(page.locator(".preview-banner")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex,nofollow",
    );
    await expect(page.locator('script[src*="cloudflareinsights"]')).toHaveCount(
      0,
    );
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(page.locator(".brand-link img")).toHaveCount(0);
  }
});

test("security and cache headers are applied without unsafe CSP allowances", async ({
  request,
}) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).not.toContain("'unsafe-inline'");
  expect(headers["content-security-policy"]).not.toContain("'unsafe-eval'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["cache-control"]).toBe("public, max-age=0, must-revalidate");
});
