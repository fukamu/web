import { readFile } from "node:fs/promises";
import path from "node:path";

import { hashDirectory } from "./hash-directory.mjs";

const directory = path.resolve(process.env.RELEASE_DIST ?? "dist");
const manifestPath = path.resolve(
  process.env.RELEASE_MANIFEST ?? "artifacts/release/manifest.json",
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const expected =
  process.env.RECOVERY_ARTIFACT === "1" ? manifest.recovery : manifest.release;
if (!expected)
  throw new Error(
    "The requested release artifact is not present in the manifest.",
  );

const actual = await hashDirectory(directory);
if (actual.treeSha256 !== expected.treeSha256) {
  throw new Error(
    `Release tree hash mismatch: expected ${expected.treeSha256}, got ${actual.treeSha256}`,
  );
}
if (
  actual.fileCount !== expected.fileCount ||
  actual.totalBytes !== expected.totalBytes
) {
  throw new Error(
    "Release artifact file count or byte count does not match its manifest.",
  );
}
console.log(
  `Release artifact verified: ${actual.fileCount} files, ${actual.totalBytes} bytes, ${actual.treeSha256}`,
);
