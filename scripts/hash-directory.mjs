import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function filesUnder(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(
        ...(await filesUnder(path.join(directory, entry.name), relative)),
      );
    } else if (entry.isFile()) {
      files.push(relative);
    } else {
      throw new Error(
        `Only regular files are allowed in release artifacts: ${relative}`,
      );
    }
  }
  return files.sort();
}

export async function hashDirectory(directory) {
  const files = [];
  for (const relative of await filesUnder(directory)) {
    const bytes = await readFile(path.join(directory, relative));
    files.push({
      path: relative,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  const treeInput = files
    .map((file) => `${file.sha256}  ${file.path}\n`)
    .join("");
  return {
    algorithm: "sha256",
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    treeSha256: createHash("sha256").update(treeInput).digest("hex"),
    files,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const directory = path.resolve(process.argv[2] ?? "dist");
  const output = process.argv[3];
  const result = await hashDirectory(directory);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (output) await writeFile(output, serialized);
  else process.stdout.write(serialized);
}
