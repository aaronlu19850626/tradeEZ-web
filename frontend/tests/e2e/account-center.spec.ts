import { expect, test } from "@playwright/test";

import { gotoDashboard } from "./helpers";

test.describe("交易账户", () => {
  test("平台图标下显示市场徽标并区分颜色", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/account-center", "交易账户");
    const ctpBadge = page.getByText("国内期货", { exact: true }).first();
    const fxBadge = page.getByText("外汇市场", { exact: true }).first();
    await expect(ctpBadge).toBeVisible();
    await expect(fxBadge).toBeVisible();
    await expect(ctpBadge).toHaveCSS("color", "rgb(220, 76, 76)");
    await expect(fxBadge).toHaveCSS("color", "rgb(47, 167, 123)");
  });
});
