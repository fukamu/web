import type { Locale } from "./site.ts";

export const routeKeys = [
  "home",
  "notes",
  "cycle",
  "company",
  "contact",
  "privacy",
] as const;

export type RouteKey = (typeof routeKeys)[number];

export const routes = Object.freeze({
  ja: Object.freeze({
    home: "/",
    notes: "/products/notes/",
    cycle: "/products/cycle/",
    company: "/company/",
    contact: "/contact/",
    privacy: "/legal/privacy/",
  }),
  en: Object.freeze({
    home: "/en/",
    notes: "/en/products/notes/",
    cycle: "/en/products/cycle/",
    company: "/en/company/",
    contact: "/en/contact/",
    privacy: "/en/legal/privacy/",
  }),
}) satisfies Readonly<Record<Locale, Readonly<Record<RouteKey, string>>>>;

export function pathFor(locale: Locale, key: RouteKey): string {
  return routes[locale][key];
}

export function alternateLocale(locale: Locale): Locale {
  return locale === "ja" ? "en" : "ja";
}
