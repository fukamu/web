import assert from "node:assert/strict";

import { categories } from "../performance/lighthouse-config.mjs";
import { summarizeLighthouse } from "./lighthouse-summary-core.mjs";

const routes = ["/", "/en/"];
const devices = ["desktop", "mobile"];
const records = [];
for (const route of routes) {
  for (const device of devices) {
    for (let run = 1; run <= 5; run += 1) {
      const score =
        route === "/en/" && device === "mobile" && run === 5 ? 0.9 : 1;
      records.push({
        route,
        device,
        run,
        lhr: {
          categories: Object.fromEntries(
            categories.map((category) => [category, { score }]),
          ),
        },
      });
    }
  }
}

const summary = summarizeLighthouse({
  records,
  expectedRoutes: routes,
  expectedDevices: devices,
});
const failingGroup = summary.results.find(
  (result) => result.route === "/en/" && result.device === "mobile",
);
assert.equal(failingGroup.categories.performance.average, 98);
assert.equal(failingGroup.categories.performance.minimum, 90);
assert.equal(failingGroup.categories.performance.median, 100);
assert.equal(summary.passed, true);

assert.throws(
  () =>
    summarizeLighthouse({
      records: records.slice(1),
      expectedRoutes: routes,
      expectedDevices: devices,
    }),
  /has 4 runs/u,
);

assert.throws(
  () =>
    summarizeLighthouse({
      records: records.map((record, index) =>
        index === 0
          ? {
              ...record,
              lhr: {
                ...record.lhr,
                categories: { ...record.lhr.categories, seo: { score: null } },
              },
            }
          : record,
      ),
      expectedRoutes: routes,
      expectedDevices: devices,
    }),
  /missing seo/u,
);

console.log(
  "Lighthouse summary fixture verified: pages, devices, categories, average, missing data.",
);
