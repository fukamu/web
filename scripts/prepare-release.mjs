import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { hashDirectory } from "./hash-directory.mjs";

const currentRoot = path.resolve(process.env.CURRENT_DIST ?? "dist");
const previousRoot = process.env.PREVIOUS_DIST
  ? path.resolve(process.env.PREVIOUS_DIST)
  : null;
const releaseRoot = path.resolve(process.env.RELEASE_DIST ?? "release-dist");
const recoveryRoot = path.resolve(process.env.RECOVERY_DIST ?? "recovery-dist");
const reportRoot = path.resolve("artifacts/release");

async function exists(directory) {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

async function htmlFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory())
      files.push(
        ...(await htmlFiles(path.join(directory, entry.name), relative)),
      );
    else if (entry.isFile() && entry.name.endsWith(".html"))
      files.push(relative);
  }
  return files.sort();
}

async function assetReferences(directory) {
  const references = new Set();
  for (const htmlFile of await htmlFiles(directory)) {
    const html = await readFile(path.join(directory, htmlFile), "utf8");
    for (const match of html.matchAll(
      /(?:href|src)=["']\/(?:_assets)\/([^"'?#]+)["']/gu,
    )) {
      references.add(path.posix.join("_assets", match[1]));
    }
  }
  return [...references].sort();
}

async function copyReferencedAssets(sourceRoot, destinationRoot, references) {
  for (const relative of references) {
    const source = path.join(sourceRoot, relative);
    const destination = path.join(destinationRoot, relative);
    if (
      !(await exists(path.dirname(source))) ||
      !(await stat(source)).isFile()
    ) {
      throw new Error(`Referenced asset is missing: ${source}`);
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination, { force: false, errorOnExist: false });
  }
}

async function validateArtifact(directory) {
  const missing = [];
  for (const reference of await assetReferences(directory)) {
    try {
      if (!(await stat(path.join(directory, reference))).isFile())
        missing.push(reference);
    } catch {
      missing.push(reference);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Artifact has missing referenced assets: ${missing.join(", ")}`,
    );
  }
}

if (!(await exists(currentRoot)))
  throw new Error(`Current dist does not exist: ${currentRoot}`);
const hasPrevious = previousRoot ? await exists(previousRoot) : false;
const currentAssets = await assetReferences(currentRoot);
const previousAssets = hasPrevious ? await assetReferences(previousRoot) : [];

await rm(releaseRoot, { recursive: true, force: true });
await cp(currentRoot, releaseRoot, { recursive: true });
if (hasPrevious)
  await copyReferencedAssets(previousRoot, releaseRoot, previousAssets);
await validateArtifact(releaseRoot);

await rm(recoveryRoot, { recursive: true, force: true });
if (hasPrevious) {
  await cp(previousRoot, recoveryRoot, { recursive: true });
  await rm(path.join(recoveryRoot, "_assets"), {
    recursive: true,
    force: true,
  });
  await copyReferencedAssets(previousRoot, recoveryRoot, previousAssets);
  await copyReferencedAssets(currentRoot, recoveryRoot, currentAssets);
  await validateArtifact(recoveryRoot);
}

await mkdir(reportRoot, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  hasPrevious,
  currentAssets,
  previousAssets,
  release: await hashDirectory(releaseRoot),
  recovery: hasPrevious ? await hashDirectory(recoveryRoot) : null,
};
await writeFile(
  path.join(reportRoot, "manifest.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  `Release artifact: ${report.release.fileCount} files, ${report.release.totalBytes} bytes, ${report.release.treeSha256}`,
);
if (report.recovery) {
  console.log(
    `Recovery artifact: ${report.recovery.fileCount} files, ${report.recovery.totalBytes} bytes, ${report.recovery.treeSha256}`,
  );
} else {
  console.log(
    "No previous successful release was supplied; initial publication has no re-deployable predecessor.",
  );
}
