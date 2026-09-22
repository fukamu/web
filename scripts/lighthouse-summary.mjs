import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { devices } from "../performance/lighthouse-config.mjs";
import { routeKeys, routes } from "../src/data/routes.ts";
import { summarizeLighthouse } from "./lighthouse-summary-core.mjs";

const outputRoot = path.resolve(
  process.env.LIGHTHOUSE_OUTPUT ?? "artifacts/lighthouse",
);
const runManifest = JSON.parse(
  await readFile(path.join(outputRoot, "runs.json"), "utf8"),
);
const records = await Promise.all(
  runManifest.map(async (record) => ({
    ...record,
    lhr: JSON.parse(await readFile(path.join(outputRoot, record.file), "utf8")),
  })),
);
const expectedRoutes = routeKeys.flatMap((key) => [
  routes.ja[key],
  routes.en[key],
]);
const summary = summarizeLighthouse({
  records,
  expectedRoutes,
  expectedDevices: Object.keys(devices),
});

const metadata = JSON.parse(
  await readFile(path.join(outputRoot, "metadata.json"), "utf8"),
);
const complete = { ...summary, metadata };
await mkdir(outputRoot, { recursive: true });
await writeFile(
  path.join(outputRoot, "summary.json"),
  `${JSON.stringify(complete, null, 2)}\n`,
);

const rows = summary.results.flatMap((result) =>
  Object.entries(result.categories).map(([category, values]) =>
    [
      result.route,
      result.device,
      category,
      values.values.join(", "),
      values.average.toFixed(2),
      values.median.toFixed(2),
      values.minimum.toFixed(2),
      values.passed ? "pass" : "fail",
    ].join(" | "),
  ),
);
const markdown = [
  "# Lighthouse report",
  "",
  metadata.preliminary
    ? "> Preliminary measurement: release content and the registered production hostname are not complete."
    : "> Production release-gate measurement.",
  "",
  "| URL | Device | Category | Five values | Average | Median | Minimum | Result |",
  "| --- | --- | --- | --- | ---: | ---: | ---: | --- |",
  ...rows.map((row) => `| ${row} |`),
  "",
].join("\n");
await writeFile(path.join(outputRoot, "summary.md"), markdown);
console.log(markdown);
if (!summary.passed) process.exitCode = 1;
