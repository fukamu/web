import { mkdir } from "node:fs/promises";
import path from "node:path";

import { test } from "@playwright/test";

import { routeKeys, routes } from "../src/data/routes.ts";

const localizedRoutes = routeKeys.flatMap((key) => [
  routes.ja[key],
  routes.en[key],
]);

for (const route of localizedRoutes) {
  test(`capture ${route}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(route, { waitUntil: "networkidle" });
    const slug =
      route === "/"
        ? "root"
        : route.replace(/^\/|\/$/gu, "").replaceAll("/", "__");
    const directory = path.resolve(
      "artifacts/screenshots",
      testInfo.project.name,
    );
    await mkdir(directory, { recursive: true });
    await page.screenshot({
      path: path.join(directory, `${slug}.png`),
      fullPage: true,
      animations: "disabled",
    });
  });
}
