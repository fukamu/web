import { defineConfig } from "astro/config";

import { site } from "./src/data/site.ts";

export default defineConfig({
  site: process.env.SITES_ORIGIN ?? site.origin ?? "https://preview.invalid",
  output: "static",
  trailingSlash: "always",
  build: {
    assets: "_assets",
    format: "directory",
    inlineStylesheets: "never",
  },
});
