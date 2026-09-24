export type Locale = "ja" | "en";

export type PublicationStatus = "draft" | "production";

export type CompanyProfile = Readonly<{
  legalName: "FUKAMU株式会社";
  officialEnglishName: string | null;
  establishedOn: string | null;
  representative: string | null;
  address: string | null;
  publicEmail: string | null;
  publicNoticesUrl: string | null;
}>;

export type BrandAsset = Readonly<{
  path: string;
  width: number;
  height: number;
  alt: Readonly<Record<Locale, string>>;
}>;

export const site = Object.freeze({
  publicationStatus: "draft" as PublicationStatus,
  origin: null as string | null,
  company: Object.freeze({
    legalName: "FUKAMU株式会社",
    officialEnglishName: null,
    establishedOn: null,
    representative: null,
    address: null,
    publicEmail: null,
    publicNoticesUrl: null,
  }) satisfies CompanyProfile,
  brand: Object.freeze({
    logo: null as BrandAsset | null,
  }),
  analytics: Object.freeze({
    provider: "Cloudflare Web Analytics",
    beaconToken: null as string | null,
    scriptUrl: "https://static.cloudflareinsights.com/beacon.min.js",
    endpointUrl: "https://cloudflareinsights.com/cdn-cgi/rum",
  }),
  legal: Object.freeze({
    privacyStatus: "draft" as "draft" | "final",
    privacyEffectiveOn: null as string | null,
    privacyUpdatedOn: "2026-09-22",
  }),
  provenance: Object.freeze({
    reviewedOn: "2026-09-22",
    webBaseRevision: "691143a37e0938f0272dd3dca70691e66c1bef56",
    notesRevision: "c23248ce25ef2d2464611bf59b777f5362f06781",
    cycleRevision: "7f4bf1198690145f35b2b335c5841b08149933d4",
    designTokensRevision: "eeb074c531aa984b63d373b65c0aa9213fd6a3bd",
  }),
});

export const isProductionPublication = site.publicationStatus === "production";

export function displayCompanyName(locale: Locale): string {
  if (locale === "en" && site.company.officialEnglishName) {
    return site.company.officialEnglishName;
  }

  return site.company.legalName;
}
