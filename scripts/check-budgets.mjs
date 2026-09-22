import { gzipSync } from "node:zlib";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const budgetConfig = JSON.parse(
  await readFile("performance/budgets.json", "utf8"),
);
const distRoot = path.resolve("dist");

function htmlFileForRoute(route) {
  if (route === "/") return path.join(distRoot, "index.html");
  if (route === "/404.html") return path.join(distRoot, "404.html");
  return path.join(distRoot, route.replace(/^\//u, ""), "index.html");
}

function localPathFromUrl(url) {
  if (!url || /^(?:https?:|data:|mailto:|#)/u.test(url)) return null;
  return path.join(distRoot, url.replace(/^\//u, "").split(/[?#]/u)[0]);
}

function referencedUrls(html) {
  const css = [
    ...html.matchAll(
      /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/giu,
    ),
  ].map((match) => match[1]);
  const scripts = [
    ...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/giu),
  ].map((match) => match[1]);
  const images = [...html.matchAll(/<img\b[^>]*src=["']([^"']+)["']/giu)].map(
    (match) => match[1],
  );
  for (const match of html.matchAll(/<img\b[^>]*srcset=["']([^"']+)["']/giu)) {
    const candidates = match[1]
      .split(",")
      .map((candidate) => candidate.trim().split(/\s+/u)[0]);
    if (candidates.length > 0) images.push(candidates.at(-1));
  }
  return { css, scripts, images };
}

async function bytesFor(urls) {
  const uniqueFiles = [...new Set(urls.map(localPathFromUrl).filter(Boolean))];
  const files = [];
  for (const file of uniqueFiles) {
    const metadata = await stat(file);
    const bytes = await readFile(file);
    files.push({
      file: path.relative(distRoot, file),
      bytes: metadata.size,
      gzipBytes: gzipSync(bytes).length,
    });
  }
  return {
    files,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    gzipBytes: files.reduce((sum, file) => sum + file.gzipBytes, 0),
  };
}

const results = [];
let failed = false;
for (const [route, type] of Object.entries(budgetConfig.routes)) {
  const budget = budgetConfig.types[type];
  const htmlFile = htmlFileForRoute(route);
  const html = await readFile(htmlFile);
  const references = referencedUrls(html.toString("utf8"));
  const [css, firstPartyJs, images] = await Promise.all([
    bytesFor(references.css),
    bytesFor(references.scripts),
    bytesFor(references.images),
  ]);
  const fonts = { files: [], bytes: 0, gzipBytes: 0 };
  const requestFiles = new Set([
    htmlFile,
    ...css.files.map((file) => file.file),
    ...firstPartyJs.files.map((file) => file.file),
    ...images.files.map((file) => file.file),
  ]);
  const values = {
    html: html.length,
    css: css.bytes,
    firstPartyJs: firstPartyJs.bytes,
    images: images.bytes,
    fonts: fonts.bytes,
    firstPartyTotal:
      html.length + css.bytes + firstPartyJs.bytes + images.bytes,
    requests: requestFiles.size,
  };
  const violations = Object.entries(values)
    .filter(([key, value]) => value > budget[key])
    .map(([key, value]) => `${key}: ${value} > ${budget[key]}`);
  if (violations.length > 0) failed = true;
  results.push({
    route,
    type,
    values,
    gzipReference: {
      html: gzipSync(html).length,
      css: css.gzipBytes,
      firstPartyJs: firstPartyJs.gzipBytes,
      images: images.gzipBytes,
    },
    resources: {
      css: css.files,
      firstPartyJs: firstPartyJs.files,
      images: images.files,
    },
    externalResources: references.scripts.filter((url) =>
      /^https?:/u.test(url),
    ),
    violations,
  });
}

await mkdir("artifacts/budgets", { recursive: true });
await writeFile(
  "artifacts/budgets/results.json",
  `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`,
);
const markdown = [
  "# Bundle budget report",
  "",
  "| Route | HTML | CSS | JS | Images | Fonts | Total | Requests | Result |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ...results.map(
    ({ route, values, violations }) =>
      `| ${route} | ${values.html} | ${values.css} | ${values.firstPartyJs} | ${values.images} | ${values.fonts} | ${values.firstPartyTotal} | ${values.requests} | ${violations.length === 0 ? "pass" : violations.join("; ")} |`,
  ),
  "",
  "Values are uncompressed bytes. Gzip values are reference-only in results.json.",
  "",
].join("\n");
await writeFile("artifacts/budgets/results.md", markdown);
console.log(markdown);
if (failed) process.exitCode = 1;
