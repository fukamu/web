import { expect, test } from "@playwright/test";

test("closed production stays private for an unauthenticated browser", async ({
  page,
  request,
}) => {
  const status = await request.get("/api/launch-status");
  expect(status.status()).toBe(200);
  expect(await status.json()).toEqual({
    publicAccessEnabled: false,
    userAllowed: false,
    canAccess: false,
  });
  expect(status.headers()["cache-control"]).toBe("private, no-store");

  const response = await page.goto("/");
  expect(response?.status()).toBe(403);
  await expect(page.getByRole("heading", { name: "FUKAMU" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "許可済みアカウントでログイン" }),
  ).toBeVisible();
});
