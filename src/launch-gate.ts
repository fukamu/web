import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const accessJWTHeader = "Cf-Access-Jwt-Assertion";
export const accessCookieName = "CF_Authorization";
export const launchAuthPath = "/__launch-auth";

export interface LaunchGateEnv {
  APP_ENVIRONMENT?: string;
  PUBLIC_ACCESS_ENABLED?: string;
  LAUNCH_ALLOWED_USER_IDS_JSON?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

export interface LaunchGateConfiguration {
  enforced: boolean;
  publicAccessEnabled: boolean;
  allowedUserIds: ReadonlySet<string>;
  access?: {
    teamDomain: string;
    audience: string;
  };
}

export interface LaunchGateDecision {
  publicAccessEnabled: boolean;
  userAllowed: boolean;
  canAccess: boolean;
}

export class LaunchGateConfigurationError extends Error {
  constructor() {
    super("Production Launch Gate configuration is unavailable.");
    this.name = "LaunchGateConfigurationError";
  }
}

export function decideLaunchAccess(
  publicAccessEnabled: boolean,
  userAllowed: boolean,
): LaunchGateDecision {
  return {
    publicAccessEnabled,
    userAllowed,
    canAccess: publicAccessEnabled || userAllowed,
  };
}

export function parseLaunchGateConfiguration(
  env: LaunchGateEnv,
): LaunchGateConfiguration {
  const environment = env.APP_ENVIRONMENT;
  if (environment === "development" || environment === "test") {
    return {
      enforced: false,
      publicAccessEnabled: true,
      allowedUserIds: new Set(),
    };
  }

  const publicAccessEnabled = parsePublicAccessEnabled(
    env.PUBLIC_ACCESS_ENABLED,
  );
  const allowedUserIds = parseAllowedUserIds(env.LAUNCH_ALLOWED_USER_IDS_JSON);
  if (publicAccessEnabled) {
    return { enforced: true, publicAccessEnabled, allowedUserIds };
  }

  return {
    enforced: true,
    publicAccessEnabled,
    allowedUserIds,
    access: {
      teamDomain: parseTeamDomain(env.CF_ACCESS_TEAM_DOMAIN),
      audience: parseAudience(env.CF_ACCESS_AUD),
    },
  };
}

function parsePublicAccessEnabled(value: string | undefined): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new LaunchGateConfigurationError();
}

function parseAllowedUserIds(value: string | undefined): ReadonlySet<string> {
  if (value === undefined) return new Set();
  if (value.length > 131_072) throw new LaunchGateConfigurationError();
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    throw new LaunchGateConfigurationError();
  }
  if (!Array.isArray(decoded)) throw new LaunchGateConfigurationError();
  const ids = new Set<string>();
  for (const candidate of decoded) {
    if (
      typeof candidate !== "string" ||
      candidate.length === 0 ||
      candidate.length > 256 ||
      candidate.trim() !== candidate
    ) {
      throw new LaunchGateConfigurationError();
    }
    ids.add(candidate);
  }
  return ids;
}

function parseTeamDomain(value: string | undefined): string {
  if (!value) throw new LaunchGateConfigurationError();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LaunchGateConfigurationError();
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    !url.hostname.endsWith(".cloudflareaccess.com")
  ) {
    throw new LaunchGateConfigurationError();
  }
  return url.origin;
}

function parseAudience(value: string | undefined): string {
  if (
    value === undefined ||
    value.length === 0 ||
    value.length > 512 ||
    value.trim() !== value
  ) {
    throw new LaunchGateConfigurationError();
  }
  return value;
}

type VerificationKey = CryptoKey | Uint8Array | JWTVerifyGetKey;

const remoteKeySets = new Map<string, JWTVerifyGetKey>();

function remoteKeySet(teamDomain: string): JWTVerifyGetKey {
  const cached = remoteKeySets.get(teamDomain);
  if (cached) return cached;
  const keys = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", teamDomain));
  remoteKeySets.set(teamDomain, keys);
  return keys;
}

export async function verifyCloudflareAccessToken(
  token: string,
  access: NonNullable<LaunchGateConfiguration["access"]>,
  key: VerificationKey = remoteKeySet(access.teamDomain),
): Promise<string> {
  const { payload } = await jwtVerify(token, key, {
    issuer: access.teamDomain,
    audience: access.audience,
    algorithms: ["RS256"],
  });
  if (
    typeof payload.sub !== "string" ||
    payload.sub.length === 0 ||
    payload.sub.length > 256
  ) {
    throw new Error("Cloudflare Access token subject is invalid.");
  }
  return payload.sub;
}

export function accessTokenFromRequest(request: Request): string | undefined {
  const assertion = request.headers.get(accessJWTHeader);
  if (assertion) return assertion;
  const cookie = request.headers.get("Cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name === accessCookieName) return part.slice(separator + 1).trim();
  }
  return undefined;
}
