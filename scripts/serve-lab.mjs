import { createLabServer } from "./lab-server.mjs";
import { site } from "../src/data/site.ts";

const registeredHostname = site.origin
  ? new URL(site.origin).hostname
  : "preview.invalid";
const hostname =
  process.env.LIGHTHOUSE_HOSTNAME ?? `lhci.${registeredHostname}`;
const server = await createLabServer({ hostname });

console.log(`Lighthouse lab server: ${server.origin}`);
console.log(`Temporary CA certificate: ${server.caCertificate}`);
console.log(
  "Map the hostname to 127.0.0.1 and trust this CA only in the test browser profile.",
);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
await new Promise(() => {});
