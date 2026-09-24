import { expect, test } from "@playwright/test";

import { gotoDashboard } from "./helpers";

test.describe("交易总览", () => {
  test("最近交易包含方向字段", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/overview", "交易总览");
    await expect(page.getByRole("columnheader", { name: "方向", exact: true })).toBeVisible();
    await expect(page.locator('[data-slot="badge"][data-variant="outline"]').last()).toBeVisible();
  });

  test("最近交易滚动到底后允许总览页面继续滚动", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/overview", "交易总览");
    const container = page
      .getByRole("columnheader", { name: "方向", exact: true })
      .locator('xpath=ancestor::div[@data-slot="table-container"]');
    await expect(container).toHaveCSS("overscroll-behavior-y", "auto");
  });
});
