import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  access,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:https";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createGzip } from "node:zlib";

const execFileAsync = promisify(execFile);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".xml", "application/xml; charset=utf-8"],
]);

function parseHeaders(source) {
  const rules = [];
  let current = null;
  for (const rawLine of source.split("\n")) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    if (!/^\s/u.test(rawLine)) {
      current = { pattern: rawLine.trim(), headers: new Map() };
      rules.push(current);
      continue;
    }
    if (!current) throw new Error("Header entry appears before a path rule.");
    const line = rawLine.trim();
    const separator = line.indexOf(":");
    if (separator < 1) throw new Error(`Invalid header line: ${line}`);
    current.headers.set(
      line.slice(0, separator),
      line.slice(separator + 1).trim(),
    );
  }
  return rules;
}

function matches(pattern, pathname) {
  if (pattern === "/*") return true;
  if (pattern.endsWith("*")) return pathname.startsWith(pattern.slice(0, -1));
  return pattern === pathname;
}

function responseHeaders(rules, pathname) {
  const result = new Map();
  for (const rule of rules) {
    if (!matches(rule.pattern, pathname)) continue;
    for (const [name, value] of rule.headers) result.set(name, value);
  }
  return Object.fromEntries(result);
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function resolveAsset(distRoot, pathname) {
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes("\0") || decoded.split("/").includes(".."))
    return { status: 404 };

  if (decoded.endsWith("/index.html")) {
    const location =
      decoded === "/index.html" ? "/" : decoded.slice(0, -"index.html".length);
    return { status: 307, location };
  }

  if (decoded.endsWith(".html") && decoded !== "/404.html") {
    const withoutExtension = decoded.slice(0, -".html".length);
    const directoryCandidate = path.join(
      distRoot,
      withoutExtension.replace(/^\//u, ""),
      "index.html",
    );
    if (await exists(directoryCandidate))
      return { status: 307, location: `${withoutExtension}/` };
  }

  const relative = decoded.replace(/^\//u, "");
  const direct = path.join(distRoot, relative);
  if (relative && (await exists(direct)) && (await stat(direct)).isFile()) {
    return { status: 200, file: direct };
  }

  if (decoded.endsWith("/")) {
    const index = path.join(distRoot, relative, "index.html");
    if (await exists(index)) return { status: 200, file: index };
  } else {
    const index = path.join(distRoot, relative, "index.html");
    if (await exists(index)) return { status: 307, location: `${decoded}/` };
  }

  return { status: 404, file: path.join(distRoot, "404.html") };
}

async function createCertificate(hostname, directory) {
  const caKey = path.join(directory, "ca-key.pem");
  const caCertificate = path.join(directory, "ca.pem");
  const serverKey = path.join(directory, "server-key.pem");
  const serverRequest = path.join(directory, "server.csr");
  const serverCertificate = path.join(directory, "server.pem");
  const extensions = path.join(directory, "extensions.cnf");

  await writeFile(
    extensions,
    `basicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:${hostname},IP:127.0.0.1\nextendedKeyUsage=serverAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n`,
  );
  await execFileAsync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "2",
    "-subj",
    "/CN=FUKAMU Lighthouse Lab CA",
    "-addext",
    "basicConstraints=critical,CA:TRUE,pathlen:0",
    "-addext",
    "keyUsage=critical,keyCertSign,cRLSign",
    "-addext",
    "subjectKeyIdentifier=hash",
    "-keyout",
    caKey,
    "-out",
    caCertificate,
  ]);
  await execFileAsync("openssl", [
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-subj",
    `/CN=${hostname}`,
    "-keyout",
    serverKey,
    "-out",
    serverRequest,
  ]);
  await execFileAsync("openssl", [
    "x509",
    "-req",
    "-days",
    "2",
    "-in",
    serverRequest,
    "-CA",
    caCertificate,
    "-CAkey",
    caKey,
    "-CAcreateserial",
    "-extfile",
    extensions,
    "-out",
    serverCertificate,
  ]);

  return { caCertificate, serverCertificate, serverKey };
}

export async function createLabServer({
  hostname,
  distDirectory = path.resolve("dist"),
  port = 0,
}) {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fukamu-lab-"),
  );
  const certificate = await createCertificate(hostname, temporaryDirectory);
  const headerRules = parseHeaders(await readFile("public/_headers", "utf8"));
  const [key, cert] = await Promise.all([
    readFile(certificate.serverKey),
    readFile(certificate.serverCertificate),
  ]);

  const server = createServer({ key, cert }, async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", `https://${hostname}`);
      const resolved = await resolveAsset(distDirectory, requestUrl.pathname);
      if (resolved.location) {
        response.writeHead(resolved.status, {
          Location: resolved.location,
          ...responseHeaders(headerRules, requestUrl.pathname),
        });
        response.end();
        return;
      }

      const file = resolved.file;
      const bytes = await readFile(file);
      const etag = `"${createHash("sha256").update(bytes).digest("base64url")}"`;
      const headers = {
        "Content-Type":
          mimeTypes.get(path.extname(file)) ?? "application/octet-stream",
        ETag: etag,
        Vary: "Accept-Encoding",
        ...responseHeaders(headerRules, requestUrl.pathname),
      };
      if (request.headers["if-none-match"] === etag) {
        response.writeHead(304, headers);
        response.end();
        return;
      }

      const compressible =
        /^(?:text\/|application\/(?:json|xml|javascript))/u.test(
          headers["Content-Type"],
        );
      const gzip =
        compressible && request.headers["accept-encoding"]?.includes("gzip");
      if (gzip) headers["Content-Encoding"] = "gzip";
      response.writeHead(resolved.status, headers);
      if (request.method === "HEAD") {
        response.end();
      } else if (gzip) {
        createReadStream(file).pipe(createGzip()).pipe(response);
      } else {
        response.end(bytes);
      }
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Lab server error");
      console.error(error);
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Lab server has no TCP address.");

  return {
    hostname,
    port: address.port,
    origin: `https://${hostname}:${address.port}`,
    caCertificate: certificate.caCertificate,
    temporaryDirectory,
    async close() {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await rm(temporaryDirectory, { recursive: true, force: true });
    },
  };
}
