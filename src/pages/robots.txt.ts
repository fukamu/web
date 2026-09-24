import type { APIRoute } from "astro";

import { isProductionPublication, site } from "../data/site.ts";

export const prerender = true;

export const GET: APIRoute = ({ site: astroSite }) => {
  const origin = site.origin ?? astroSite?.origin ?? "https://preview.invalid";
  const body = isProductionPublication
    ? `User-agent: *\nAllow: /\nSitemap: ${new URL("/sitemap.xml", origin)}\n`
    : "User-agent: *\nDisallow: /\n";

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
