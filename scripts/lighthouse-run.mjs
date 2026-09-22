import { execFile, spawnSync } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

import {
  devices,
  lighthouseConfig,
} from "../performance/lighthouse-config.mjs";
import { routeKeys, routes } from "../src/data/routes.ts";
import { site } from "../src/data/site.ts";
import { createLabServer } from "./lab-server.mjs";

const execFileAsync = promisify(execFile);
const outputRoot = path.resolve(
  process.env.LIGHTHOUSE_OUTPUT ?? "artifacts/lighthouse",
);
const lhrDirectory = path.join(outputRoot, "lhr");
const externalBaseUrl = process.env.LIGHTHOUSE_BASE_URL;
const registeredHostname = site.origin
  ? new URL(site.origin).hostname
  : "preview.invalid";
const hostname =
  process.env.LIGHTHOUSE_HOSTNAME ?? `lhci.${registeredHostname}`;
const defaultPaths = routeKeys.flatMap((key) => [
  routes.ja[key],
  routes.en[key],
]);
const paths = process.env.LIGHTHOUSE_ROUTES
  ? process.env.LIGHTHOUSE_ROUTES.split(",").map((route) => route.trim())
  : defaultPaths;
for (const route of paths) {
  if (!defaultPaths.includes(route))
    throw new Error(`Unknown Lighthouse route: ${route}`);
}
const requestedRuns = Number.parseInt(process.env.LIGHTHOUSE_RUNS ?? "5", 10);

if (
  requestedRuns !== 5 &&
  process.env.ALLOW_NONSTANDARD_LIGHTHOUSE_RUNS !== "1"
) {
  throw new Error(
    "Formal Lighthouse runs require exactly 5 runs per URL and device.",
  );
}
await access("dist/index.html");
await mkdir(lhrDirectory, { recursive: true });

function commandOutput(command, args = []) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return !result.error;
}

const chromePath =
  process.env.CHROME_PATH ??
  [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((candidate) => {
    try {
      return spawnSync(candidate, ["--version"]).status === 0;
    } catch {
      return false;
    }
  });
if (!chromePath)
  throw new Error("Set CHROME_PATH to a fixed Chrome/Chromium executable.");
const certutilPath = process.env.CERTUTIL_PATH ?? "/usr/bin/certutil";
if (!externalBaseUrl && !commandExists(certutilPath, ["-H"])) {
  throw new Error(
    "Ubuntu's certutil is required to trust the temporary lab CA in an isolated browser profile (install libnss3-tools or set CERTUTIL_PATH).",
  );
}

const server = externalBaseUrl ? null : await createLabServer({ hostname });
const measurementOrigin = server?.origin ?? new URL(externalBaseUrl).origin;
const records = [];
let interrupted = false;

async function createTrustedProfile() {
  const profile = await mkdtemp(
    path.join(os.tmpdir(), "fukamu-chrome-profile-"),
  );
  if (server) {
    const nssDatabase = path.join(profile, "pki", "nssdb");
    await mkdir(nssDatabase, { recursive: true });
    await execFileAsync(certutilPath, [
      "-N",
      "-d",
      `sql:${nssDatabase}`,
      "--empty-password",
    ]);
    await execFileAsync(certutilPath, [
      "-A",
      "-d",
      `sql:${nssDatabase}`,
      "-n",
      "FUKAMU Lighthouse Lab CA",
      "-t",
      "C,,",
      "-i",
      server.caCertificate,
    ]);
  }
  return profile;
}

async function runOne(route, deviceName, runNumber) {
  const profile = await createTrustedProfile();
  let chrome;
  try {
    const hostResolverFlags = server
      ? [`--host-resolver-rules=MAP ${hostname} 127.0.0.1`]
      : [];
    chrome = await chromeLauncher.launch({
      chromePath,
      userDataDir: profile,
      envVars: server
        ? { ...process.env, XDG_DATA_HOME: profile }
        : { ...process.env },
      chromeFlags: [
        "--headless=new",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        ...hostResolverFlags,
      ],
    });
    const target = new URL(route, measurementOrigin).href;
    const result = await lighthouse(
      target,
      { port: chrome.port, output: "json", logLevel: "error" },
      lighthouseConfig(deviceName),
    );
    if (!result?.lhr)
      throw new Error(`Lighthouse returned no LHR for ${route} ${deviceName}.`);
    const slug =
      route === "/"
        ? "root"
        : route.replace(/^\/|\/$/gu, "").replaceAll("/", "__");
    const file = `${slug}--${deviceName}--${runNumber}.json`;
    await writeFile(
      path.join(lhrDirectory, file),
      `${JSON.stringify(result.lhr)}\n`,
    );
    records.push({
      route,
      device: deviceName,
      run: runNumber,
      file: `lhr/${file}`,
    });
    await writeFile(
      path.join(outputRoot, "runs.json"),
      `${JSON.stringify(records, null, 2)}\n`,
    );
    console.log(
      `[${records.length}/${paths.length * Object.keys(devices).length * requestedRuns}] ${route} ${deviceName} run ${runNumber}`,
    );
  } finally {
    if (chrome) await chrome.kill();
    await rm(profile, { recursive: true, force: true });
  }
}

const handleSignal = () => {
  interrupted = true;
};
process.once("SIGINT", handleSignal);
process.once("SIGTERM", handleSignal);

try {
  const metadata = {
    generatedAt: new Date().toISOString(),
    preliminary:
      site.publicationStatus !== "production" ||
      registeredHostname === "preview.invalid",
    measurementKind: server ? "isolated-https-lab" : "production-url",
    registeredHostname,
    labHostname: hostname,
    node: process.version,
    npm: commandOutput("npm", ["--version"]),
    lighthouse: JSON.parse(
      await readFile("node_modules/lighthouse/package.json", "utf8"),
    ).version,
    chrome: commandOutput(chromePath, ["--version"]),
    os: `${os.type()} ${os.release()}`,
    architecture: os.arch(),
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    gitSha: commandOutput("git", ["rev-parse", "HEAD"]),
    fontCondition: "system-font fallback; no web fonts",
    cacheCondition: "new isolated Chrome profile for every run",
    certificateCondition: server
      ? "temporary CA trusted only in each isolated XDG NSS database"
      : "public production certificate validation",
    devices,
  };
  await writeFile(
    path.join(outputRoot, "metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );

  for (const route of paths) {
    for (const deviceName of Object.keys(devices)) {
      for (let runNumber = 1; runNumber <= requestedRuns; runNumber += 1) {
        if (interrupted) throw new Error("Lighthouse run interrupted.");
        await runOne(route, deviceName, runNumber);
      }
    }
  }
} finally {
  if (server) await server.close();
}
