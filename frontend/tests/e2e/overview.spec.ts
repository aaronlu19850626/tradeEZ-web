import { expect, test } from "@playwright/test";

import { gotoDashboard } from "./helpers";

test.describe("交易总览", () => {
  test("最近交易包含方向字段", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/overview", "交易总览");
    await expect(page.getByRole("columnheader", { name: "方向", exact: true })).toBeVisible();
    await expect(page.locator('[data-slot="badge"][data-variant="outline"]').last()).toBeVisible();
  });
});
