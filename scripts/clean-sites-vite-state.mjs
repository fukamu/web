import { rm } from "node:fs/promises";

await rm(new URL("../.wrangler/deploy/config.json", import.meta.url), {
  force: true,
});
