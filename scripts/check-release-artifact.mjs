import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const fixtureRoot = await mkdtemp(
  path.join(os.tmpdir(), "fukamu-release-fixture-"),
);
const currentRoot = path.join(fixtureRoot, "current");
const previousRoot = path.join(fixtureRoot, "previous");
const releaseRoot = path.join(fixtureRoot, "release");
const recoveryRoot = path.join(fixtureRoot, "recovery");

async function fixtureFile(root, relative, content) {
  const destination = path.join(root, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content);
}

async function files(root, prefix = "") {
  const entries = await readdir(root, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await files(path.join(root, entry.name), relative)));
    } else if (entry.isFile()) {
      result.push(relative);
    }
  }
  return result.sort();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await fixtureFile(
    currentRoot,
    "index.html",
    '<link href="/_assets/current.css">CURRENT\n',
  );
  await fixtureFile(currentRoot, "_assets/current.css", "current css\n");
  await fixtureFile(
    currentRoot,
    "_assets/current-unused.js",
    "current unused\n",
  );
  await fixtureFile(currentRoot, "_headers", "CURRENT HEADERS\n");

  await fixtureFile(
    previousRoot,
    "index.html",
    '<link href="/_assets/previous.css">PREVIOUS\n',
  );
  await fixtureFile(
    previousRoot,
    "legal/index.html",
    '<script src="/_assets/previous.js"></script>PREVIOUS LEGAL\n',
  );
  await fixtureFile(previousRoot, "_assets/previous.css", "previous css\n");
  await fixtureFile(previousRoot, "_assets/previous.js", "previous js\n");
  await fixtureFile(previousRoot, "_assets/stale.js", "stale\n");
  await fixtureFile(previousRoot, "_headers", "PREVIOUS HEADERS\n");

  await execFileAsync(
    process.execPath,
    [path.join(repositoryRoot, "scripts/prepare-release.mjs")],
    {
      cwd: fixtureRoot,
      env: {
        ...process.env,
        CURRENT_DIST: currentRoot,
        PREVIOUS_DIST: previousRoot,
        RELEASE_DIST: releaseRoot,
        RECOVERY_DIST: recoveryRoot,
      },
    },
  );

  const releaseFiles = await files(releaseRoot);
  const recoveryFiles = await files(recoveryRoot);
  assert(
    (await readFile(path.join(releaseRoot, "index.html"), "utf8")).includes(
      "CURRENT",
    ),
    "Release must use current HTML.",
  );
  assert(
    (await readFile(path.join(releaseRoot, "_headers"), "utf8")).includes(
      "CURRENT",
    ),
    "Release must use current headers.",
  );
  assert(
    releaseFiles.includes("_assets/previous.css") &&
      releaseFiles.includes("_assets/previous.js"),
    "Release must retain every asset referenced by preceding HTML.",
  );
  assert(
    !releaseFiles.includes("_assets/stale.js"),
    "Release must not retain unreferenced preceding assets.",
  );
  assert(
    (await readFile(path.join(recoveryRoot, "index.html"), "utf8")).includes(
      "PREVIOUS",
    ),
    "Recovery must use preceding HTML.",
  );
  assert(
    (await readFile(path.join(recoveryRoot, "_headers"), "utf8")).includes(
      "PREVIOUS",
    ),
    "Recovery must use preceding headers.",
  );
  assert(
    recoveryFiles.includes("_assets/current.css") &&
      recoveryFiles.includes("_assets/previous.css") &&
      recoveryFiles.includes("_assets/previous.js"),
    "Recovery must include all assets referenced by current and preceding HTML.",
  );
  assert(
    !recoveryFiles.includes("_assets/current-unused.js") &&
      !recoveryFiles.includes("_assets/stale.js"),
    "Recovery must exclude unreferenced assets.",
  );

  console.log(
    `Release artifact fixture verified: ${releaseFiles.length} release files, ${recoveryFiles.length} recovery files.`,
  );
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
