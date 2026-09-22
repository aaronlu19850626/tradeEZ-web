import { expect, test } from "@playwright/test";

import { gotoDashboard, monitorPage } from "./helpers";

test.describe("核心页面加载", () => {
  test("账户、交易记录和总览可正常打开且无运行时异常", async ({ page }) => {
    const monitor = monitorPage(page);

    await gotoDashboard(page, "/dashboard/account-center", "交易账户");
    await expect(page.getByText("Sim-CTP-Commodity-A")).toBeVisible();
    await expect(page.getByText("Sim-CTP-Financial-B")).toBeVisible();

    await gotoDashboard(page, "/dashboard/trade-center", "交易记录");
    await expect(page.getByRole("button", { name: /筛选器/ })).toBeVisible();

    await gotoDashboard(page, "/dashboard/overview", "交易总览");
    await expect(page.getByText("最近交易")).toBeVisible();

    expect(monitor.errors.filter((message) => !message.includes("width(-1) and height(-1)"))).toEqual([]);
  });
});
