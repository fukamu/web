import { defineConfig, devices } from "@playwright/test";

const browserExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./tests",
  testMatch: "launch-gate.e2e.spec.ts",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command:
      "npm run build && WRANGLER_SEND_METRICS=false XDG_CONFIG_HOME=.wrangler-config npm exec -- wrangler dev --local --ip 127.0.0.1 --port 8789 --var APP_ENVIRONMENT:production --var PUBLIC_ACCESS_ENABLED:false --var LAUNCH_ALLOWED_USER_IDS_JSON:[] --var CF_ACCESS_TEAM_DOMAIN:https://fukamu-test.cloudflareaccess.com --var CF_ACCESS_AUD:fukamu-web-test-audience",
    url: "http://127.0.0.1:8789/api/launch-status",
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: {
    baseURL: "http://127.0.0.1:8789",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(browserExecutablePath
      ? { launchOptions: { executablePath: browserExecutablePath } }
      : {}),
  },
  projects: [
    {
      name: "desktop-chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
