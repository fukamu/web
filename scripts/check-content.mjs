import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { messages } from "../src/i18n/index.ts";
import { products } from "../src/data/products.ts";
import { routeKeys, routes } from "../src/data/routes.ts";
import { site } from "../src/data/site.ts";

const errors = [];

function requireValue(condition, message) {
  if (!condition) errors.push(message);
}

const allRoutes = routeKeys.flatMap((key) => [routes.ja[key], routes.en[key]]);
requireValue(
  allRoutes.length === 12,
  `Expected 12 localized routes, found ${allRoutes.length}.`,
);
requireValue(
  new Set(allRoutes).size === 12,
  "Localized routes must be unique.",
);
for (const route of allRoutes) {
  requireValue(route.startsWith("/"), `Route must be root-relative: ${route}`);
  requireValue(
    route.endsWith("/"),
    `Route must use a trailing slash: ${route}`,
  );
  requireValue(
    !route.includes("//"),
    `Route contains an empty segment: ${route}`,
  );
}

for (const locale of ["ja", "en"]) {
  const copy = messages[locale];
  requireValue(
    copy.locale === locale,
    `Locale mismatch in ${locale} messages.`,
  );
  for (const key of routeKeys) {
    const metadata = copy.meta[key];
    requireValue(
      Boolean(metadata?.title?.trim()),
      `${locale}.${key} is missing a title.`,
    );
    requireValue(
      Boolean(metadata?.description?.trim()),
      `${locale}.${key} is missing a description.`,
    );
  }
}

requireValue(
  products.length === 2,
  "Exactly Notes and Cycle must be described initially.",
);
for (const product of products) {
  requireValue(
    ["notes", "cycle"].includes(product.id),
    `Unknown product id: ${product.id}`,
  );
  requireValue(
    product.evidence.revision.length === 40,
    `${product.id} evidence SHA must be full.`,
  );
  requireValue(
    product.uiLanguages.length > 0,
    `${product.id} must state verified UI languages.`,
  );
  for (const locale of ["ja", "en"]) {
    requireValue(
      product.features[locale].length > 0,
      `${product.id} ${locale} features missing.`,
    );
    requireValue(
      Boolean(product.summary[locale]),
      `${product.id} ${locale} summary missing.`,
    );
    requireValue(
      Boolean(product.legalReadiness.note[locale]),
      `${product.id} ${locale} legal readiness note missing.`,
    );
  }

  if (product.status === "available") {
    for (const [label, value] of [
      ["officialUrl", product.officialUrl],
      ["publicAvailabilityEvidence", product.publicAvailabilityEvidence],
    ]) {
      const url = new URL(value);
      requireValue(
        url.protocol === "https:",
        `${product.id} ${label} must use HTTPS.`,
      );
    }
  } else {
    requireValue(
      !Object.hasOwn(product, "officialUrl"),
      `${product.id} preparing status must not expose an official URL.`,
    );
  }
}

const sourcePages = {
  "/": "src/pages/index.astro",
  "/en/": "src/pages/en/index.astro",
  "/products/notes/": "src/pages/products/notes/index.astro",
  "/en/products/notes/": "src/pages/en/products/notes/index.astro",
  "/products/cycle/": "src/pages/products/cycle/index.astro",
  "/en/products/cycle/": "src/pages/en/products/cycle/index.astro",
  "/company/": "src/pages/company/index.astro",
  "/en/company/": "src/pages/en/company/index.astro",
  "/contact/": "src/pages/contact/index.astro",
  "/en/contact/": "src/pages/en/contact/index.astro",
  "/legal/privacy/": "src/pages/legal/privacy/index.astro",
  "/en/legal/privacy/": "src/pages/en/legal/privacy/index.astro",
};
for (const route of allRoutes) {
  try {
    const metadata = await stat(path.resolve(sourcePages[route]));
    requireValue(metadata.isFile(), `Page source is not a file for ${route}.`);
  } catch {
    errors.push(`Missing page source for ${route}: ${sourcePages[route]}`);
  }
}

function readFrontmatter(source) {
  const block = source.match(/^---\n([\s\S]*?)\n---/u)?.[1];
  if (!block) throw new Error("Missing frontmatter.");
  return Object.fromEntries(
    block.split("\n").map((line) => {
      const separator = line.indexOf(":");
      return [
        line.slice(0, separator).trim(),
        line
          .slice(separator + 1)
          .trim()
          .replace(/^["']|["']$/gu, ""),
      ];
    }),
  );
}

const jaPrivacy = readFrontmatter(
  await readFile("src/content/legal/ja/privacy.md", "utf8"),
);
const enPrivacy = readFrontmatter(
  await readFile("src/content/legal/en/privacy.md", "utf8"),
);
requireValue(jaPrivacy.locale === "ja", "Japanese privacy locale is invalid.");
requireValue(enPrivacy.locale === "en", "English privacy locale is invalid.");
requireValue(
  jaPrivacy.status === enPrivacy.status,
  "Privacy status must match across locales.",
);
requireValue(
  jaPrivacy.effectiveOn === enPrivacy.effectiveOn,
  "Privacy effective date must match across locales.",
);
requireValue(
  jaPrivacy.updatedOn === enPrivacy.updatedOn,
  "Privacy updated date must match across locales.",
);
requireValue(
  enPrivacy.referenceTranslation === "true",
  "English privacy document must be marked as a reference translation.",
);
requireValue(
  site.legal.privacyStatus === jaPrivacy.status,
  "site.ts privacy status must match legal content.",
);
requireValue(
  site.legal.privacyUpdatedOn === jaPrivacy.updatedOn,
  "site.ts privacy update date must match legal content.",
);

for (const [name, revision] of Object.entries(site.provenance).filter(([key]) =>
  key.endsWith("Revision"),
)) {
  requireValue(
    /^[a-f0-9]{40}$/.test(revision),
    `${name} must be a full Git SHA.`,
  );
}

const trackedTextFiles = [
  ...(await Promise.all(
    Object.values(sourcePages).map(async (file) => [
      file,
      await readFile(file, "utf8"),
    ]),
  )),
  ["src/data/products.ts", await readFile("src/data/products.ts", "utf8")],
  ["src/data/site.ts", await readFile("src/data/site.ts", "utf8")],
];
for (const [file, source] of trackedTextFiles) {
  requireValue(
    !/href=["']#["']/u.test(source),
    `${file} contains a placeholder href.`,
  );
  requireValue(
    !/https?:\/\/localhost/u.test(source),
    `${file} contains a localhost URL.`,
  );
}

if (errors.length > 0) {
  console.error(`Content validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    "Content verified: 12 localized routes, 2 preparing products, synchronized legal drafts.",
  );
}
