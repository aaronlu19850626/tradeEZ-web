import { expect, test } from "@playwright/test";

import { gotoDashboard } from "./helpers";

test.describe("全局多条件筛选器", () => {
  test("左右布局、选项顺序和已选条件", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/trade-center?currency=USD&market=fx", "交易记录");
    await page.getByRole("button", { name: /筛选器/ }).click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    const groupButtons = [
      menu.getByRole("button", { name: "方向", exact: true }),
      menu.getByRole("button", { name: "结果", exact: true }),
      menu.getByRole("button", { name: "市场", exact: true }),
      menu.getByRole("button", { name: "币种", exact: true }),
      menu.getByRole("button", { name: "品种", exact: true }),
    ];
    for (const button of groupButtons) await expect(button).toBeVisible();

    const marketBox = await groupButtons[2].boundingBox();
    const currencyBox = await groupButtons[3].boundingBox();
    expect(marketBox?.y).toBeLessThan(currencyBox?.y ?? Number.POSITIVE_INFINITY);

    await expect(menu.getByRole("button", { name: "市场：外汇市场" })).toBeVisible();
    await expect(menu.getByRole("button", { name: "币种：USD" })).toBeVisible();

    await groupButtons[2].click();
    const foreignMarket = menu.getByText("外汇市场", { exact: true });
    const domesticMarket = menu.getByText("国内期货", { exact: true });
    expect((await foreignMarket.boundingBox())?.y).toBeLessThan(
      (await domesticMarket.boundingBox())?.y ?? Number.POSITIVE_INFINITY,
    );

    await groupButtons[3].click();
    const usd = menu.getByText("USD", { exact: true });
    const cny = menu.getByText("CNY", { exact: true });
    expect((await usd.boundingBox())?.y).toBeLessThan((await cny.boundingBox())?.y ?? Number.POSITIVE_INFINITY);
  });

  test("临时删除市场和币种后确认仍恢复默认值", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/trade-center?currency=USD&market=fx", "交易记录");
    await page.getByRole("button", { name: /筛选器/ }).click();
    const menu = page.getByRole("menu");
    await menu.getByRole("button", { name: "市场：外汇市场" }).click();
    await menu.getByRole("button", { name: "币种：USD" }).click();
    await menu.getByRole("button", { name: "确认" }).click();
    await expect(page).toHaveURL(/currency=USD/);
    await expect(page).toHaveURL(/market=fx/);
  });

  test("品种显示账户且按账户聚合", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/trade-center?currency=USD&market=fx", "交易记录");
    await page.getByRole("button", { name: /筛选器/ }).click();
    const menu = page.getByRole("menu");
    await menu.getByRole("button", { name: "品种", exact: true }).click();
    const audusd = menu.locator("label").filter({ hasText: "AUDUSD" }).first();
    await expect(audusd).toContainText("Sim-Gold-A");
    await expect(audusd).toContainText("Sim-Gold-B");
    await expect(audusd.locator("span.bg-border")).toHaveCount(3);
  });
});
