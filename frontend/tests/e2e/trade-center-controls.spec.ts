import { expect, test } from "@playwright/test";

import { gotoDashboard } from "./helpers";

test.describe("交易记录视图与表格控制", () => {
  test("按天、按周、全部三种视图切换并保持分组状态", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/trade-center?currency=USD&market=fx", "交易记录");
    await expect(page.getByRole("radio", { name: "按天" })).toBeChecked();

    const dayToggles = page.locator('main [data-slot="card"] button[aria-expanded]');
    await expect(dayToggles.first()).toHaveAttribute("aria-expanded", "true");
    await expect(dayToggles.nth(1)).toHaveAttribute("aria-expanded", "false");

    await page.getByRole("radio", { name: "按周" }).click();
    await expect(page).toHaveURL(/view=week/);
    await expect(page.getByRole("radio", { name: "按周" })).toBeChecked();

    await page.getByRole("radio", { name: "全部" }).click();
    await expect(page).toHaveURL(/view=all/);
    await expect(page.getByText(/显示 1-100 \/ 共/)).toBeVisible();
  });

  test("全部视图分页、跳页和服务端排序", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/trade-center?view=all&currency=USD&market=fx", "交易记录");
    await expect(page.getByText(/显示 1-100 \/ 共/)).toBeVisible();

    await page.getByRole("button", { name: "下一页" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText(/显示 101-200 \/ 共/)).toBeVisible();
    await expect(page.getByLabel("跳转到第几页")).toHaveValue("2");

    const sortedRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/trades?") && request.url().includes("sort=net") && request.url().includes("page=1"),
    );
    await page.locator("thead").getByRole("button", { name: "净盈亏" }).click();
    await sortedRequest;
  });

  test("分组明细按展开状态懒加载", async ({ page }) => {
    let tradeRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/trades/group-trades?")) tradeRequests += 1;
    });
    await gotoDashboard(page, "/dashboard/trade-center?currency=USD&market=fx", "交易记录");

    const dayToggles = page.locator('main [data-slot="card"] button[aria-expanded]');
    await expect(dayToggles.first()).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => tradeRequests).toBe(1);

    const lazyRequest = page.waitForRequest((request) => request.url().includes("/api/v1/trades/group-trades?"));
    await dayToggles.nth(1).click();
    await lazyRequest;
    await expect(dayToggles.nth(1)).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => tradeRequests).toBe(2);
  });

  test("列显示支持搜索、关闭和恢复默认", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/trade-center?view=all&currency=USD&market=fx", "交易记录");
    await page.getByRole("button", { name: "列显示" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "选择列" })).toBeVisible();
    await dialog.getByPlaceholder("搜索列").fill("账户");
    await expect(dialog.getByText("账户", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "取消" }).click();

    await page.getByRole("button", { name: "列显示" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();
    await expect(page.getByRole("columnheader", { name: "账户" })).toBeVisible();
  });
});
