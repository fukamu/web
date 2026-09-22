import { rm } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);

await Promise.all(
  ["dist", ".sites-static"].map((directory) =>
    rm(new URL(directory, projectRoot), { recursive: true, force: true }),
  ),
);
