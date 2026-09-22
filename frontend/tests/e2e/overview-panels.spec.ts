import { expect, test } from "@playwright/test";

import { gotoDashboard } from "./helpers";

test.describe("交易总览面板交互", () => {
  test("综合评分明细展示六维数据", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/overview", "交易总览");
    await page.getByRole("button", { name: "评分明细" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "评分明细" })).toBeVisible();
    for (const label of ["期望值", "风险控制", "盈亏比", "恢复因子", "稳定性", "胜率"]) {
      await expect(dialog.getByText(label, { exact: true })).toBeVisible();
    }
    await dialog.getByRole("button", { name: "关闭" }).click();
  });

  test("累计净损益可打开全范围弹窗", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/overview", "交易总览");
    await page.getByRole("button", { name: "查看全范围累计净损益" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "累计净损益" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("交易时段设置可切换开仓与平仓口径", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/overview", "交易总览");
    await page.getByRole("button", { name: "交易时段设置" }).click();
    await page.getByRole("menuitem", { name: "平仓时间" }).click();
    await page.getByRole("button", { name: "交易时段设置" }).click();
    await expect(page.getByRole("menuitem", { name: "平仓时间" })).toHaveClass(/font-semibold/);
    await page.getByRole("menuitem", { name: "开仓时间" }).click();
  });

  test("月度日历点击交易日复用共享日详情", async ({ page }, testInfo) => {
    await gotoDashboard(page, "/dashboard/overview", "交易总览");
    const tradedDay = page.getByRole("button", { name: /\d+ \$/ }).first();
    await tradedDay.scrollIntoViewIfNeeded();
    if (testInfo.project.name === "mobile") {
      await page.locator('[data-slot="dashboard-workspace"]').evaluate((element) => {
        element.scrollTop = Math.max(0, element.scrollTop - 180);
      });
    }
    await tradedDay.click({ position: { x: 6, y: 6 } });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("净损益", { exact: true })).toBeVisible();
    await expect(dialog.locator("table")).toBeVisible();
    await dialog.getByRole("button", { name: "关闭" }).click();
  });
});
