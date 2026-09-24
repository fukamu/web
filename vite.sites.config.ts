import { cloudflare } from "@cloudflare/vite-plugin";
import { sites } from "@openai/sites-vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: ".sites-static",
  plugins: [
    sites(),
    ...cloudflare({
      configPath: "./wrangler.sites.jsonc",
      viteEnvironment: {
        name: "server",
      },
      experimental: {
        headersAndRedirectsDevModeSupport: true,
      },
    }),
  ],
});
