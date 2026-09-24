export const categories = [
  "performance",
  "accessibility",
  "best-practices",
  "seo",
];

export const devices = Object.freeze({
  desktop: Object.freeze({
    formFactor: "desktop",
    screenEmulation: Object.freeze({
      mobile: false,
      width: 1365,
      height: 900,
      deviceScaleFactor: 1,
      disabled: false,
    }),
    throttling: Object.freeze({
      rttMs: 40,
      throughputKbps: 10_240,
      cpuSlowdownMultiplier: 1,
    }),
  }),
  mobile: Object.freeze({
    formFactor: "mobile",
    screenEmulation: Object.freeze({
      mobile: true,
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      disabled: false,
    }),
    throttling: Object.freeze({
      rttMs: 150,
      throughputKbps: 1_638.4,
      cpuSlowdownMultiplier: 4,
    }),
  }),
});

export function lighthouseConfig(deviceName) {
  const device = devices[deviceName];
  if (!device) throw new Error(`Unknown Lighthouse device: ${deviceName}`);
  return {
    extends: "lighthouse:default",
    settings: {
      onlyCategories: categories,
      formFactor: device.formFactor,
      screenEmulation: device.screenEmulation,
      throttlingMethod: "simulate",
      throttling: device.throttling,
      disableStorageReset: false,
      maxWaitForLoad: 45_000,
    },
  };
}
