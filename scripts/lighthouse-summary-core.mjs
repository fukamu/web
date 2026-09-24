import { categories } from "../performance/lighthouse-config.mjs";

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

export function summarizeLighthouse({
  records,
  expectedRoutes,
  expectedDevices,
  runCount = 5,
}) {
  const expectedKeys = new Set(
    expectedRoutes.flatMap((route) =>
      expectedDevices.map((device) => `${route}\0${device}`),
    ),
  );
  const groups = new Map();

  for (const record of records) {
    const key = `${record.route}\0${record.device}`;
    if (!expectedKeys.has(key))
      throw new Error(
        `Unexpected Lighthouse group: ${record.route} ${record.device}`,
      );
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  const results = [];
  for (const key of expectedKeys) {
    const [route, device] = key.split("\0");
    const group = groups.get(key) ?? [];
    if (group.length !== runCount) {
      throw new Error(
        `${route} ${device} has ${group.length} runs; expected ${runCount}.`,
      );
    }
    const runNumbers = group
      .map((record) => record.run)
      .sort((left, right) => left - right);
    if (
      new Set(runNumbers).size !== runCount ||
      runNumbers.some((run, index) => run !== index + 1)
    ) {
      throw new Error(
        `${route} ${device} has duplicate or missing run numbers.`,
      );
    }

    const runtimeErrors = group.filter(
      ({ lhr }) =>
        lhr.runtimeError?.code && lhr.runtimeError.code !== "NO_ERROR",
    );
    if (runtimeErrors.length > 0) {
      throw new Error(`${route} ${device} contains Lighthouse runtime errors.`);
    }

    const categoryResults = {};
    for (const category of categories) {
      const values = group.map(({ lhr }) => {
        const score = lhr.categories?.[category]?.score;
        if (typeof score !== "number") {
          throw new Error(`${route} ${device} run is missing ${category}.`);
        }
        return score * 100;
      });
      const average =
        values.reduce((sum, value) => sum + value, 0) / values.length;
      categoryResults[category] = {
        values,
        average,
        median: median(values),
        minimum: Math.min(...values),
        passed: average >= 98,
      };
    }
    results.push({ route, device, categories: categoryResults });
  }

  return {
    threshold: 98,
    runCount,
    categories,
    results,
    passed: results.every((result) =>
      Object.values(result.categories).every((category) => category.passed),
    ),
  };
}
