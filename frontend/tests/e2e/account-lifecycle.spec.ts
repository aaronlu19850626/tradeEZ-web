import { expect, request as playwrightRequest, test } from "@playwright/test";

import { gotoDashboard } from "./helpers";

const API_URL = "http://127.0.0.1:8000/api/v1/";
const TEST_LOGIN = "991000001";
const TEST_NAME = "E2E 生命周期账户";
const RENAMED_NAME = "E2E 已更名账户";

async function cleanupTestAccount(page: import("@playwright/test").Page) {
  const token = await page.evaluate(() => window.localStorage.getItem("tradesync-access-token"));
  const api = await playwrightRequest.newContext({ baseURL: API_URL });
  try {
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await api.get("accounts", { headers });
    if (!response.ok()) return;
    const accounts = (await response.json()) as { id: number; name: string | null; mt5_login: number | string }[];
    const account = accounts.find((item) => String(item.mt5_login) === TEST_LOGIN);
    if (account) {
      await api.delete(`accounts/${account.id}`, {
        headers,
        data: { name: account.name ?? TEST_NAME },
      });
    }
  } finally {
    await api.dispose();
  }
}

test.describe("交易账户创建与管理", () => {
  test.afterEach(async ({ page }) => {
    await cleanupTestAccount(page);
  });

  test("校验默认平台币种并完成创建、改名、密钥查看和删除", async ({ page }) => {
    await gotoDashboard(page, "/dashboard/account-center", "交易账户");
    await cleanupTestAccount(page);
    await page.reload({ waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "添加新账户" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "添加新账户" })).toBeVisible();

    const mt5 = dialog.getByRole("button", { name: /MetaTrader 5/ });
    const ctp = dialog.getByRole("button", { name: /CTP/ });
    const usd = dialog.getByRole("button", { name: /USD/ });
    const cny = dialog.getByRole("button", { name: /CNY/ });
    await expect(mt5).toHaveAttribute("aria-pressed", "true");
    await expect(usd).toHaveAttribute("aria-pressed", "true");

    await ctp.click();
    await expect(cny).toHaveAttribute("aria-pressed", "true");
    await expect(cny).toBeDisabled();
    await mt5.click();
    await expect(usd).toHaveAttribute("aria-pressed", "true");
    await expect(usd).toBeEnabled();

    await dialog.getByRole("button", { name: "创建账户" }).click();
    await expect(page.getByText("请填写账户名称、交易平台、币种和账号")).toBeVisible();

    await dialog.getByLabel("账户名称").fill(TEST_NAME);
    await dialog.getByLabel("券商服务器名").fill("E2E-Server");
    await dialog.getByLabel("账号").fill(TEST_LOGIN);
    await expect(dialog.getByText("留空默认同步全部历史交易。")).toBeVisible();
    await dialog.getByRole("button", { name: "创建账户" }).click();

    const keyDialog = page.getByRole("dialog");
    await expect(keyDialog.getByRole("heading", { name: "账户同步密钥" })).toBeVisible();
    await expect(keyDialog.getByText(/sk_live_/)).toBeVisible();
    await keyDialog.getByRole("button", { name: "关闭" }).click();

    let row = page.getByRole("row").filter({ hasText: TEST_NAME }).first();
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: TEST_NAME, exact: true }).click();
    const renameDialog = page.getByRole("dialog");
    await renameDialog.getByLabel("账户名称").fill(RENAMED_NAME);
    await renameDialog.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("账户名称已更新")).toBeVisible();

    row = page.getByRole("row").filter({ hasText: RENAMED_NAME }).first();
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: /更多操作/ }).click();
    await page.getByRole("menuitem", { name: "导入交易" }).click();
    const importDialog = page.getByRole("dialog");
    const csv = [
      "ticket,position_id,order_id,symbol,entry,type,volume,price,sl_price,tp_price,profit,swap,commission,magic,comment,time",
      "994000101,994000100,994000201,E2EIMP,0,0,0.10,2000.00,1990.00,2020.00,0,0,0,994001,open,2026-09-01T01:00:00Z",
      "994000102,994000100,994000202,E2EIMP,1,1,0.10,2010.00,1990.00,2020.00,100,-1,-2,994001,close,2026-09-01T02:00:00Z",
    ].join("\n");
    await importDialog.locator('input[type="file"]').setInputFiles({
      name: "e2e-import.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await importDialog.getByRole("button", { name: "开始导入" }).click();
    await expect(importDialog.getByText("新增")).toBeVisible();
    await expect(importDialog.getByText("2", { exact: true })).toBeVisible();
    await importDialog.getByRole("button", { name: "完成" }).click();

    await row.getByRole("button", { name: /更多操作/ }).click();
    await page.getByRole("menuitem", { name: "查看密钥" }).click();
    await expect(page.getByRole("heading", { name: "账户同步密钥" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "关闭" }).click();

    await row.getByRole("button", { name: /更多操作/ }).click();
    await page.getByRole("menuitem", { name: "删除账户" }).click();
    const deleteDialog = page.getByRole("dialog");
    await expect(deleteDialog.getByRole("heading", { name: "物理删除账户" })).toBeVisible();
    await deleteDialog.getByLabel("请输入账户名称确认").fill(RENAMED_NAME);
    await deleteDialog.getByRole("button", { name: "永久删除" }).click();
    await expect(page.getByText("账户已物理删除")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: RENAMED_NAME })).toHaveCount(0);
  });
});
