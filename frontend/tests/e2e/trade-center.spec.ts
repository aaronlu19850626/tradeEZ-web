import { expect, test } from "@playwright/test";

import { gotoDashboard } from "./helpers";

test.describe("交易记录", () => {
  test("国内市场月历数字与盈亏线条颜色一致", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/trade-center?currency=CNY&market=cn", "交易记录");
    const calendarDay = page
      .locator('button[aria-label] span[aria-hidden][style*="background"]')
      .locator("..")
      .filter({ has: page.locator('span[aria-hidden][style*="background"]') })
      .first();
    await expect(calendarDay).toBeVisible();
    await expect
      .poll(() =>
        calendarDay.evaluate((element) => {
          const spans = element.querySelectorAll(":scope > span");
          const numberColor = spans[0] ? getComputedStyle(spans[0]).color : "";
          const lineColor = spans[1] ? getComputedStyle(spans[1]).backgroundColor : "";
          return lineColor !== "" && lineColor === numberColor;
        }),
      )
      .toBe(true);
  });

  test("做多做空使用无配色描边徽标", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/trade-center?view=all&currency=CNY&market=cn", "交易记录");
    const badge = page
      .locator('[data-slot="badge"][data-variant="outline"]')
      .filter({ hasText: /做多|做空/ })
      .first();
    await expect(badge).toBeVisible();
    await expect(badge.locator("svg")).toHaveCount(1);
    await expect(badge).not.toHaveClass(/text-profit|text-loss|bg-profit|bg-loss/);
  });
});
