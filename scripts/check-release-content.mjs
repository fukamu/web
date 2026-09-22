import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { routeKeys, routes } from "../src/data/routes.ts";
import { site } from "../src/data/site.ts";

const errors = [];
const checkDist = process.argv.includes("--dist");

function requireValue(condition, message) {
  if (!condition) errors.push(message);
}

function validHttps(value) {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

requireValue(
  site.publicationStatus === "production",
  "publicationStatus must be production.",
);
requireValue(
  validHttps(site.origin),
  "A verified HTTPS production origin is required.",
);
if (site.origin) {
  const origin = new URL(site.origin);
  requireValue(
    origin.pathname === "/",
    "Production origin must not contain a path.",
  );
  requireValue(
    !origin.search && !origin.hash,
    "Production origin must not contain search/hash.",
  );
}
requireValue(
  Boolean(site.company.establishedOn),
  "Formal establishment date is required.",
);
requireValue(
  Boolean(site.company.representative),
  "Formal representative name is required.",
);
requireValue(
  Boolean(site.company.address),
  "Formal public address is required.",
);
requireValue(
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(site.company.publicEmail ?? ""),
  "Verified public email address is required.",
);
requireValue(
  validHttps(site.company.publicNoticesUrl),
  "Verified public freee notice URL is required.",
);
requireValue(
  Boolean(site.brand.logo),
  "Approved logo asset metadata is required.",
);
if (site.brand.logo) {
  requireValue(
    site.brand.logo.path.startsWith("/"),
    "Logo path must be root-relative.",
  );
  requireValue(
    site.brand.logo.width > 0 && site.brand.logo.height > 0,
    "Logo dimensions are required.",
  );
  for (const [locale, alt] of Object.entries(site.brand.logo.alt)) {
    requireValue(
      Boolean(alt.trim()),
      `Logo alt text is required for ${locale}.`,
    );
  }
  try {
    await access(path.join("public", site.brand.logo.path.replace(/^\//u, "")));
  } catch {
    errors.push(`Approved logo file is missing: public${site.brand.logo.path}`);
  }
}
requireValue(
  /^[a-f0-9]{32}$/u.test(site.analytics.beaconToken ?? ""),
  "Cloudflare Web Analytics public beacon token is required.",
);
requireValue(
  site.legal.privacyStatus === "final",
  "Privacy document must be final.",
);
requireValue(
  /^\d{4}-\d{2}-\d{2}$/u.test(site.legal.privacyEffectiveOn ?? ""),
  "Privacy effective date is required.",
);

const wrangler = await readFile("wrangler.jsonc", "utf8");
requireValue(
  !wrangler.includes('"workers_dev": true'),
  "Production workers_dev must remain false.",
);
requireValue(
  !wrangler.includes('"preview_urls": true'),
  "Production preview_urls must remain false.",
);
requireValue(
  wrangler.includes('"html_handling": "force-trailing-slash"'),
  "Wrangler must force trailing slashes.",
);
requireValue(
  wrangler.includes('"not_found_handling": "404-page"'),
  "Wrangler must serve a real 404 page.",
);
requireValue(
  wrangler.includes('"custom_domain": true'),
  "A verified production custom-domain route is required in wrangler.jsonc.",
);
if (site.origin) {
  requireValue(
    wrangler.includes(new URL(site.origin).hostname),
    "Wrangler custom-domain route must match the production origin.",
  );
}

const headers = await readFile("public/_headers", "utf8");
requireValue(
  !headers.includes("'unsafe-inline'"),
  "CSP must not allow unsafe-inline.",
);
requireValue(
  !headers.includes("'unsafe-eval'"),
  "CSP must not allow unsafe-eval.",
);
requireValue(
  headers.includes("Strict-Transport-Security:"),
  "HSTS header is required.",
);
requireValue(
  !headers.includes("includeSubDomains"),
  "HSTS must not affect subdomains.",
);
requireValue(!headers.includes("preload"), "HSTS preload is not authorized.");

if (checkDist) {
  const htmlFiles = routeKeys.flatMap((key) => [
    routes.ja[key] === "/"
      ? "dist/index.html"
      : `dist${routes.ja[key]}index.html`,
    `dist${routes.en[key]}index.html`,
  ]);
  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile, "utf8");
    requireValue(!/noindex/iu.test(html), `${htmlFile} contains noindex.`);
    requireValue(
      !html.includes("公開前プレビュー"),
      `${htmlFile} contains preview copy.`,
    );
    requireValue(
      !html.includes("Pre-release preview"),
      `${htmlFile} contains preview copy.`,
    );
    requireValue(
      site.origin ? html.includes(site.origin) : false,
      `${htmlFile} does not contain the production origin.`,
    );
    requireValue(
      site.analytics.beaconToken
        ? html.includes(site.analytics.beaconToken)
        : false,
      `${htmlFile} does not contain the analytics beacon token.`,
    );
  }
  const robots = await readFile("dist/robots.txt", "utf8");
  requireValue(
    !robots.includes("Disallow: /"),
    "Production robots.txt blocks crawling.",
  );
}

if (errors.length > 0) {
  console.error(
    `Release content is not ready (${errors.length} blocking item(s)):`,
  );
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Release content verified${checkDist ? " including dist" : ""}.`);
}
