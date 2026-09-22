import { defineConfig } from "astro/config";

import { site } from "./src/data/site.ts";

export default defineConfig({
  site: site.origin ?? "https://preview.invalid",
  output: "static",
  trailingSlash: "always",
  build: {
    assets: "_assets",
    format: "directory",
    inlineStylesheets: "never",
  },
});
