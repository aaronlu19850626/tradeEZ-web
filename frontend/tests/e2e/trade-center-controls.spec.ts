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

  test("全部视图页面与表格滚动时标题栏和表头保持吸顶", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/trade-center?view=all&currency=USD&market=fx", "交易记录");

    const workspace = page.locator('[data-slot="dashboard-workspace"]');
    const cardHeader = page.getByTestId("all-trades-card-header");
    const tableHeader = page.getByRole("columnheader", { name: "平仓时间", exact: true }).first();
    const tableContainer = tableHeader.locator('xpath=ancestor::div[@data-slot="table-container"]');
    const toolbar = page.getByTestId("trade-center-toolbar");

    await expect(cardHeader).toBeVisible();
    await workspace.evaluate((element) => {
      element.scrollTop = 320;
    });

    await expect(toolbar).toHaveAttribute("data-stuck", "true");
    const remainingOffset = await Promise.all([toolbar.boundingBox(), cardHeader.boundingBox()]).then(
      ([toolbarBox, headerBox]) =>
        toolbarBox && headerBox ? Math.max(0, headerBox.y - (toolbarBox.y + toolbarBox.height)) : 0,
    );
    if (remainingOffset > 0) {
      await workspace.evaluate((element, offset) => {
        element.scrollTop += offset;
      }, remainingOffset);
    }
    await expect
      .poll(async () => {
        const toolbarBox = await toolbar.boundingBox();
        const headerBox = await cardHeader.boundingBox();
        return toolbarBox && headerBox ? headerBox.y - (toolbarBox.y + toolbarBox.height) : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(8);

    await expect
      .poll(async () => {
        const headerBox = await cardHeader.boundingBox();
        const tableHeaderBox = await tableHeader.boundingBox();
        return headerBox && tableHeaderBox
          ? Math.abs(tableHeaderBox.y - (headerBox.y + headerBox.height))
          : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(2);

    await tableContainer.evaluate((element) => {
      element.scrollTop = Math.min(480, element.scrollHeight - element.clientHeight);
    });

    await expect
      .poll(async () => {
        const tableHeaderBox = await tableHeader.boundingBox();
        const containerBox = await tableContainer.boundingBox();
        return tableHeaderBox && containerBox ? Math.abs(tableHeaderBox.y - containerBox.y) : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(2);
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

  test("日视图和周视图表格滚到底后允许页面继续滚动", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/trade-center?currency=USD&market=fx", "交易记录");
    const dayContainer = page
      .getByRole("columnheader", { name: "平仓时间", exact: true })
      .first()
      .locator('xpath=ancestor::div[@data-slot="table-container"]');
    await expect(dayContainer).toHaveCSS("overscroll-behavior-y", "auto");

    await page.getByRole("radio", { name: "按周" }).click();
    await expect(page).toHaveURL(/view=week/);
    const weekContainer = page
      .getByRole("columnheader", { name: "平仓时间", exact: true })
      .first()
      .locator('xpath=ancestor::div[@data-slot="table-container"]');
    await expect(weekContainer).toHaveCSS("overscroll-behavior-y", "auto");
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
