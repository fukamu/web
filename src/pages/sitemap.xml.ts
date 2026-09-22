import type { APIRoute } from "astro";

import { routeKeys, routes } from "../data/routes.ts";
import { site } from "../data/site.ts";

export const prerender = true;

export const GET: APIRoute = ({ site: astroSite }) => {
  const origin = site.origin ?? astroSite?.origin ?? "https://preview.invalid";
  const urls = routeKeys.flatMap((key) => [routes.ja[key], routes.en[key]]);
  const entries = urls
    .map((path) => `  <url><loc>${new URL(path, origin)}</loc></url>`)
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
