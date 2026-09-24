import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.SITE_BASE_URL;
const browserExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const webServer = externalBaseUrl
  ? {}
  : {
      webServer: {
        command:
          "WRANGLER_SEND_METRICS=false XDG_CONFIG_HOME=.wrangler-config npm exec -- wrangler dev --local --ip 127.0.0.1 --port 8788 --var APP_ENVIRONMENT:development",
        url: "http://127.0.0.1:8788/",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
    };

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: Boolean(process.env.CI),
  ...(process.env.CI ? { retries: 1, workers: 1 } : { retries: 0 }),
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: externalBaseUrl ?? "http://127.0.0.1:8788",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(browserExecutablePath
      ? { launchOptions: { executablePath: browserExecutablePath } }
      : {}),
  },
  ...webServer,
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1365, height: 900 },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
