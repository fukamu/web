import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("vendor/fukamu-design-tokens/0.1.0");
const expectedManifestHash =
  "5c7e8e90873e5581fb70e7676cb5935092fa3a517f46b3a98360c411d7633915";
const expectedSourceRevision = "b57d1531f26c14e2f1f82440b9f150a3a185bd16";
const expectedFiles = [
  "css/tokens.css",
  "figma/mapping.json",
  "js/index.cjs",
  "js/index.mjs",
  "json/tokens.json",
  "manifest.json",
  "reference/tokens.md",
  "types/index.d.ts",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Symlinks are not allowed in the token bundle: ${relative}`,
      );
    }
    if (entry.isDirectory()) {
      files.push(
        ...(await listFiles(path.join(directory, entry.name), relative)),
      );
    } else if (entry.isFile()) {
      files.push(relative);
    } else {
      throw new Error(`Unexpected token bundle entry: ${relative}`);
    }
  }
  return files.sort();
}

const actualFiles = await listFiles(root);
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(
    `Token bundle files differ.\nExpected: ${expectedFiles.join(", ")}\nActual: ${actualFiles.join(", ")}`,
  );
}

const manifestBytes = await readFile(path.join(root, "manifest.json"));
const manifestHash = sha256(manifestBytes);
if (manifestHash !== expectedManifestHash) {
  throw new Error(`Manifest hash mismatch: ${manifestHash}`);
}

const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (manifest.contractVersion !== "0.1.0") {
  throw new Error(`Unexpected contractVersion: ${manifest.contractVersion}`);
}
if (manifest.sourceRevision !== expectedSourceRevision) {
  throw new Error(`Unexpected sourceRevision: ${manifest.sourceRevision}`);
}
if (manifest.mode !== "light" || manifest.handEdited !== false) {
  throw new Error("Token bundle must be generated, unedited, and light-only.");
}

const payloadPaths = expectedFiles.filter((file) => file !== "manifest.json");
const manifestPaths = manifest.artifacts
  .map((artifact) => artifact.path)
  .sort();
if (JSON.stringify(manifestPaths) !== JSON.stringify(payloadPaths)) {
  throw new Error(
    "Manifest payload list is incomplete or contains extra files.",
  );
}

for (const artifact of manifest.artifacts) {
  if (!/^[a-f0-9]{64}$/.test(artifact.sha256)) {
    throw new Error(`Invalid SHA-256 for ${artifact.path}`);
  }
  const filePath = path.join(root, artifact.path);
  const metadata = await stat(filePath);
  if (!metadata.isFile()) {
    throw new Error(`Token payload is not a regular file: ${artifact.path}`);
  }
  const actualHash = sha256(await readFile(filePath));
  if (actualHash !== artifact.sha256) {
    throw new Error(
      `Payload hash mismatch for ${artifact.path}: ${actualHash}`,
    );
  }
}

console.log(
  `Design token bundle verified: 0.1.0, ${manifest.artifacts.length} payloads, manifest ${manifestHash}`,
);
