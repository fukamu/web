import {
  LaunchGateConfigurationError,
  accessJWTHeader,
  accessTokenFromRequest,
  decideLaunchAccess,
  launchAuthPath,
  parseLaunchGateConfiguration,
  verifyCloudflareAccessToken,
  type LaunchGateConfiguration,
  type LaunchGateDecision,
  type LaunchGateEnv,
} from "./launch-gate.ts";

interface Env extends LaunchGateEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

interface WorkerDependencies {
  verifyAccessToken(
    token: string,
    access: NonNullable<LaunchGateConfiguration["access"]>,
  ): Promise<string>;
}

const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: `Cookie, ${accessJWTHeader}`,
} as const;

const launchLogoutPath = "/__launch-logout";

export function createLaunchGateWorker(
  dependencies: WorkerDependencies = {
    verifyAccessToken: verifyCloudflareAccessToken,
  },
) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      let configuration: LaunchGateConfiguration;
      try {
        configuration = parseLaunchGateConfiguration(env);
      } catch (error) {
        if (!(error instanceof LaunchGateConfigurationError)) throw error;
        return unavailableResponse(request);
      }

      const url = new URL(request.url);
      if (url.pathname === launchLogoutPath) {
        return accessLogoutResponse();
      }

      if (!configuration.enforced || configuration.publicAccessEnabled) {
        if (url.pathname === "/api/launch-status") {
          return statusResponse(
            decideLaunchAccess(configuration.publicAccessEnabled, false),
          );
        }
        return env.ASSETS.fetch(request);
      }

      const decision = await decisionForRequest(
        request,
        configuration,
        dependencies,
      );
      if (url.pathname === "/api/launch-status") {
        return statusResponse(decision);
      }
      if (url.pathname === launchAuthPath && decision.canAccess) {
        return redirectAfterAuthentication(url);
      }
      if (!decision.canAccess) return limitedReleaseResponse(request);

      const response = await env.ASSETS.fetch(request);
      return withPrivateCacheHeaders(response);
    },
  };
}

function accessLogoutResponse(): Response {
  return new Response(null, {
    status: 303,
    headers: {
      ...privateHeaders,
      Location: "/cdn-cgi/access/logout",
    },
  });
}

async function decisionForRequest(
  request: Request,
  configuration: LaunchGateConfiguration,
  dependencies: WorkerDependencies,
): Promise<LaunchGateDecision> {
  const token = accessTokenFromRequest(request);
  if (!token || !configuration.access) {
    return decideLaunchAccess(false, false);
  }
  try {
    const userId = await dependencies.verifyAccessToken(
      token,
      configuration.access,
    );
    return decideLaunchAccess(false, configuration.allowedUserIds.has(userId));
  } catch {
    return decideLaunchAccess(false, false);
  }
}

function redirectAfterAuthentication(url: URL): Response {
  const requested = url.searchParams.get("returnTo");
  const returnTo = isSafeReturnPath(requested) ? requested : "/";
  return new Response(null, {
    status: 303,
    headers: { ...privateHeaders, Location: returnTo },
  });
}

function isSafeReturnPath(value: string | null): value is string {
  return (
    value !== null &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function statusResponse(decision: LaunchGateDecision): Response {
  return Response.json(decision, { headers: privateHeaders });
}

function unavailableResponse(request: Request): Response {
  if (new URL(request.url).pathname === "/api/launch-status") {
    return Response.json(
      { error: { code: "LAUNCH_GATE_UNAVAILABLE" } },
      { status: 503, headers: privateHeaders },
    );
  }
  return limitedReleaseHTML(
    request,
    503,
    "現在、アクセス状態を確認できません。しばらくしてから再度お試しください。",
  );
}

function limitedReleaseResponse(request: Request): Response {
  return limitedReleaseHTML(
    request,
    403,
    "現在、このサービスは限定公開中です。一般公開までしばらくお待ちください。",
  );
}

function limitedReleaseHTML(
  request: Request,
  status: number,
  message: string,
): Response {
  const url = new URL(request.url);
  const returnTo = `${url.pathname}${url.search}`;
  const authenticationURL = `${launchAuthPath}?returnTo=${encodeURIComponent(returnTo)}`;
  const body = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>FUKAMU — 限定公開中</title>
</head>
<body>
  <main>
    <h1>FUKAMU</h1>
    <p>${message}</p>
    <p lang="en">This service is currently available to approved users only.</p>
    <p><a href="${authenticationURL}">許可済みアカウントでログイン</a></p>
  </main>
</body>
</html>`;
  return new Response(body, {
    status,
    headers: {
      ...privateHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function withPrivateCacheHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", privateHeaders["Cache-Control"]);
  headers.set("Vary", privateHeaders.Vary);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default createLaunchGateWorker();
