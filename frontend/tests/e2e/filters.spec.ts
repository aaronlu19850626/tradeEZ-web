import { expect, test } from "@playwright/test";

import { gotoDashboard } from "./helpers";

test.describe("全局多条件筛选器", () => {
  test("左右布局、选项顺序和已选条件", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/trade-center?currency=USD&market=fx", "交易记录");
    await page.getByRole("button", { name: /筛选器/ }).click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    const groupButtons = [
      menu.getByRole("radio", { name: "方向", exact: true }),
      menu.getByRole("radio", { name: "结果", exact: true }),
      menu.getByRole("radio", { name: "市场", exact: true }),
      menu.getByRole("radio", { name: "币种", exact: true }),
      menu.getByRole("radio", { name: "品种", exact: true }),
    ];
    for (const button of groupButtons) await expect(button).toBeVisible();

    await expect(page.locator("main [inert]")).toHaveCount(0);
    await groupButtons[0].focus();
    await page.keyboard.press("ArrowDown");
    await expect(groupButtons[1]).toBeFocused();
    await page.keyboard.press("Space");
    await expect(groupButtons[1]).toHaveAttribute("data-state", "on");

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

  test("日期范围清除按钮可独立键盘操作", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/trade-center?currency=USD&market=fx", "交易记录");
    const clearDate = page.getByRole("button", { name: "清除日期" });
    await expect(clearDate).toBeVisible();
    await expect(page.locator("main [inert]")).toHaveCount(0);
    await clearDate.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "全部日期" })).toBeVisible();
    await expect(page).not.toHaveURL(/from=/);
    await expect(page.getByText("快捷选择")).toHaveCount(0);

    await page.getByRole("button", { name: "选择日期范围" }).click();
    await expect(page.getByText("快捷选择")).toBeVisible();
  });

  test("英文环境下多条件摘要不残留中文等项文案", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/trade-center?currency=USD&market=fx", "交易记录");
    await page.getByRole("button", { name: /筛选器/ }).click();
    const filterMenu = page.getByRole("menu");
    await filterMenu.getByRole("radio", { name: "做多", exact: true }).click();
    await filterMenu.getByRole("radio", { name: "结果", exact: true }).click();
    await filterMenu.getByRole("radio", { name: "盈利", exact: true }).click();
    await filterMenu.getByRole("button", { name: "确认" }).click();
    await expect(page.getByRole("button", { name: /筛选器 · .*等4项/ })).toBeVisible();

    await expect(page.locator("main [inert]")).toHaveCount(0);
    await page.getByRole("button", { name: /账户 · 全部/ }).click();
    const accountMenu = page.getByRole("menu");
    const accountOptions = accountMenu.locator("label");
    await accountOptions.first().click();
    for (const index of [1, 2, 3, 4]) await accountOptions.nth(index).click();
    await accountMenu.getByRole("button", { name: "确认" }).click();
    await expect(page.getByRole("button", { name: /账户 · .*等4项/ })).toBeVisible();

    await page.getByRole("button", { name: "切换为英文" }).click();
    const filterButton = page.getByRole("button", { name: /^Filters ·/ });
    const accountButton = page.getByRole("button", { name: /^Accounts ·/ });
    await expect(filterButton).toContainText(/and 4 more/);
    await expect(accountButton).toContainText(/and 4 more/);
    await expect(filterButton).not.toContainText("等");
    await expect(accountButton).not.toContainText("等");
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
    await menu.getByRole("radio", { name: "品种", exact: true }).click();
    const audusd = menu.locator("label").filter({ hasText: "AUDUSD" }).first();
    await expect(audusd).toContainText("Sim-Gold-A");
    await expect(audusd).toContainText("Sim-Gold-B");
    await expect(audusd.locator("span.bg-border")).toHaveCount(3);
  });
});
