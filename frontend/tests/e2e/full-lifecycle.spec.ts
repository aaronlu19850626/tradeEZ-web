import {
  type APIRequestContext,
  expect,
  type Page,
  request as playwrightRequest,
  type TestInfo,
  test,
} from "@playwright/test";

import { gotoDashboard } from "./helpers";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";

const API_URL = "http://127.0.0.1:8000/api/v1/";
const DATABASE_URL = "postgresql://aaron@127.0.0.1:5432/tradeez_dev";
const TEST_LOGIN = "993000001";
const TEST_NAME = "E2E 完整生命周期";
const SYMBOL = "E2EUSD";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function signedPost(api: APIRequestContext, path: string, token: string, payload: Record<string, unknown>) {
  const body = stableStringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", token)
    .update(Buffer.concat([Buffer.from(body), Buffer.from(timestamp)]))
    .digest("hex");
  return api.post(path, {
    data: body,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Timestamp": timestamp,
      "X-Signature": signature,
    },
  });
}

async function webApi(page: Page) {
  const token = await page.evaluate(() => window.localStorage.getItem("tradesync-access-token"));
  const api = await playwrightRequest.newContext({ baseURL: API_URL });
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return { api, headers };
}

async function cleanupTestAccount(page: Page) {
  const { api, headers } = await webApi(page);
  try {
    const response = await api.get("accounts", { headers });
    if (!response.ok()) return;
    const accounts = (await response.json()) as { id: number; name: string | null; mt5_login: number | string }[];
    const account = accounts.find((item) => String(item.mt5_login) === TEST_LOGIN);
    if (account) {
      await api.delete(`accounts/${account.id}`, { headers, data: { name: account.name ?? TEST_NAME } });
    }
  } finally {
    await api.dispose();
  }
}

async function findTestAccount(page: Page) {
  const { api, headers } = await webApi(page);
  try {
    const response = await api.get("accounts", { headers });
    expect(response.ok()).toBeTruthy();
    const accounts = (await response.json()) as { id: number; name: string; mt5_login: number | string }[];
    const account = accounts.find((item) => String(item.mt5_login) === TEST_LOGIN);
    expect(account).toBeTruthy();
    return account as { id: number; name: string; mt5_login: number | string };
  } finally {
    await api.dispose();
  }
}

async function resetAccount(page: Page, account: { id: number; name: string }, fromDay: string) {
  const { api, headers } = await webApi(page);
  try {
    const response = await api.post(`accounts/${account.id}/reset-sync`, {
      headers,
      data: { name: account.name, sync_start_date: fromDay },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  } finally {
    await api.dispose();
  }
}

function dbValue(sql: string): string {
  return execFileSync("psql", [DATABASE_URL, "-Atc", sql], { encoding: "utf8" }).trim();
}

function refreshClosedTrades() {
  execFileSync("psql", [DATABASE_URL, "-Atc", "SELECT refresh_closed_trades()"], { encoding: "utf8" });
}

async function capture(page: Page, testInfo: TestInfo, step: string) {
  if (process.env.E2E_EVIDENCE !== "1") return;
  await page.screenshot({
    path: `test-results/evidence/${testInfo.project.name}/${step}.png`,
    fullPage: true,
  });
}

function lifecycleDeals(baseTime: number) {
  const firstOpen = baseTime - 7200;
  const firstClose = baseTime - 3600;
  const secondOpen = baseTime - 3600;
  const secondCloseA = baseTime - 1800;
  const secondCloseB = baseTime - 600;
  return [
    {
      ticket: 993000101,
      position_id: 993000100,
      order_id: 993000201,
      symbol: SYMBOL,
      entry: 0,
      type: 0,
      volume: 0.1,
      price: 2000,
      sl_price: 1990,
      tp_price: 2020,
      profit: 0,
      swap: 0,
      commission: 0,
      magic: 993001,
      comment: "lifecycle-open-1",
      open_time: firstOpen,
      deal_time: firstOpen,
    },
    {
      ticket: 993000102,
      position_id: 993000100,
      order_id: 993000202,
      symbol: SYMBOL,
      entry: 1,
      type: 1,
      volume: 0.1,
      price: 2010,
      sl_price: 1990,
      tp_price: 2020,
      profit: 100,
      swap: -2,
      commission: -1.5,
      magic: 993001,
      comment: "lifecycle-close-1",
      open_time: firstOpen,
      deal_time: firstClose,
    },
    {
      ticket: 993000103,
      position_id: 993000200,
      order_id: 993000203,
      symbol: SYMBOL,
      entry: 0,
      type: 0,
      volume: 0.3,
      price: 2000,
      sl_price: 1980,
      tp_price: 2030,
      profit: 0,
      swap: 0,
      commission: 0,
      magic: 993002,
      comment: "lifecycle-open-2",
      open_time: secondOpen,
      deal_time: secondOpen,
    },
    {
      ticket: 993000104,
      position_id: 993000200,
      order_id: 993000204,
      symbol: SYMBOL,
      entry: 1,
      type: 1,
      volume: 0.1,
      price: 2010,
      sl_price: 1980,
      tp_price: 2030,
      profit: 20,
      swap: 0,
      commission: -0.5,
      magic: 993002,
      comment: "lifecycle-partial-1",
      open_time: secondOpen,
      deal_time: secondCloseA,
    },
    {
      ticket: 993000105,
      position_id: 993000200,
      order_id: 993000205,
      symbol: SYMBOL,
      entry: 1,
      type: 1,
      volume: 0.2,
      price: 2012,
      sl_price: 1980,
      tp_price: 2030,
      profit: 30,
      swap: -5,
      commission: -0.5,
      magic: 993002,
      comment: "lifecycle-partial-2",
      open_time: secondOpen,
      deal_time: secondCloseB,
    },
  ];
}

test.describe("MT5 完整生命周期", () => {
  test.setTimeout(120_000);

  test.afterEach(async ({ page }) => {
    await cleanupTestAccount(page);
  });

  test("创建、同步、查询、重置、重同步、轮换密钥和删除", async ({ page }, testInfo) => {
    await gotoDashboard(page, "/dashboard/account-center", "交易账户");
    await cleanupTestAccount(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await capture(page, testInfo, "01-account-center");

    await page.getByRole("button", { name: "添加新账户" }).first().click();
    const addDialog = page.getByRole("dialog");
    await capture(page, testInfo, "02-create-default");
    await addDialog.locator("label").filter({ hasText: "CTP" }).first().click();
    await capture(page, testInfo, "03-ctp-currency-lock");
    await addDialog
      .locator("label")
      .filter({ hasText: /MetaTrader 5/ })
      .first()
      .click();
    await addDialog.getByLabel("账户名称").fill(TEST_NAME);
    await addDialog.getByLabel("券商服务器名").fill("E2E-Lifecycle-Server");
    await addDialog.getByLabel("账号").fill(TEST_LOGIN);
    await capture(page, testInfo, "04-create-filled");
    await addDialog.getByRole("button", { name: "创建账户" }).click();

    const keyDialog = page.getByRole("dialog");
    await expect(keyDialog.getByRole("heading", { name: "账户同步密钥" })).toBeVisible();
    const keyText = await keyDialog.getByText(/sk_live_/).textContent();
    expect(keyText).toBeTruthy();
    const initialKey = keyText?.trim() ?? "";
    await capture(page, testInfo, "05-account-key");
    await keyDialog.getByRole("button", { name: "关闭" }).click();

    const account = await findTestAccount(page);
    const now = Math.floor(Date.now() / 1000);
    const { api } = await webApi(page);
    try {
      const symbols = await signedPost(api, "ingest/symbols", initialKey, {
        mt5_login: Number(TEST_LOGIN),
        symbols: [{ name: SYMBOL, digits: 2, point: 0.01, tick_value: 1, contract_size: 100 }],
      });
      expect(symbols.ok(), await symbols.text()).toBeTruthy();

      const snapshots = await signedPost(api, "ingest/snapshots", initialKey, {
        mt5_login: Number(TEST_LOGIN),
        snapshots: [{ balance: 10000, equity: 10000, margin: 0, free_margin: 10000, snapshot_time: now }],
      });
      expect(snapshots.ok(), await snapshots.text()).toBeTruthy();

      const dealsPayload = { mt5_login: Number(TEST_LOGIN), deals: lifecycleDeals(now) };
      const firstDeals = await signedPost(api, "ingest/deals", initialKey, dealsPayload);
      expect(firstDeals.ok(), await firstDeals.text()).toBeTruthy();
      expect((await firstDeals.json()).inserted).toBe(5);

      const duplicateDeals = await signedPost(api, "ingest/deals", initialKey, dealsPayload);
      expect(duplicateDeals.ok(), await duplicateDeals.text()).toBeTruthy();
      expect((await duplicateDeals.json()).duplicated).toBe(5);

      const cursor = await signedPost(api, "sync/update_last_sync_time", initialKey, {
        mt5_login: Number(TEST_LOGIN),
        last_sync_time: now - 600,
      });
      expect(cursor.ok(), await cursor.text()).toBeTruthy();

      refreshClosedTrades();
      expect(dbValue(`SELECT COUNT(*) FROM closed_trades WHERE account_login=${TEST_LOGIN}`)).toBe("2");
      expect(
        dbValue(
          `SELECT ROUND(SUM(profit+swap+commission)::numeric,2) FROM closed_trades WHERE account_login=${TEST_LOGIN}`,
        ),
      ).toBe("140.50");

      await page.goto(
        `/dashboard/trade-center?view=all&currency=USD&market=fx&accounts=${account.id}&symbol=${SYMBOL}`,
      );
      await expect(page.getByRole("heading", { name: "交易记录" })).toBeVisible();
      await expect(page.locator("tbody tr")).toHaveCount(2);
      await expect(page.locator("tbody")).toContainText("$96.50");
      await expect(page.locator("tbody")).toContainText("$44.00");
      await capture(page, testInfo, "06-synced-trades");

      await page.goto("/dashboard/account-center");
      let row = page.getByRole("row").filter({ hasText: TEST_NAME }).first();
      await row.getByRole("button", { name: /更多操作/ }).click();
      await page.getByRole("menuitem", { name: "重置交易" }).click();
      const resetDialog = page.getByRole("dialog");
      await expect(resetDialog.getByRole("heading", { name: "重置交易" })).toBeVisible();
      await expect(resetDialog.getByText(/重置会清空/)).toBeVisible();
      await capture(page, testInfo, "07-reset-dialog");
      await resetDialog.getByRole("button", { name: "取消" }).click();

      await resetAccount(page, account, "2026-09-01");
      expect(dbValue(`SELECT COUNT(*) FROM closed_trades WHERE account_login=${TEST_LOGIN}`)).toBe("0");

      const afterResetCursor = await signedPost(api, "sync/last_sync_time", initialKey, {
        mt5_login: Number(TEST_LOGIN),
      });
      expect(afterResetCursor.ok(), await afterResetCursor.text()).toBeTruthy();
      const replayDeals = await signedPost(api, "ingest/deals", initialKey, dealsPayload);
      expect(replayDeals.ok(), await replayDeals.text()).toBeTruthy();
      const replayCursor = await signedPost(api, "sync/update_last_sync_time", initialKey, {
        mt5_login: Number(TEST_LOGIN),
        last_sync_time: now - 600,
      });
      expect(replayCursor.ok(), await replayCursor.text()).toBeTruthy();
      refreshClosedTrades();
      expect(dbValue(`SELECT COUNT(*) FROM closed_trades WHERE account_login=${TEST_LOGIN}`)).toBe("2");

      await page.reload({ waitUntil: "domcontentloaded" });
      row = page.getByRole("row").filter({ hasText: TEST_NAME }).first();
      await row.getByRole("button", { name: /更多操作/ }).click();
      await page.getByRole("menuitem", { name: "重置密钥" }).click();
      const rotateDialog = page.getByRole("dialog");
      await rotateDialog.getByRole("button", { name: "确认重置密钥" }).click();
      const rotatedKeyDialog = page.getByRole("dialog");
      await expect(rotatedKeyDialog.getByRole("heading", { name: "账户同步密钥" })).toBeVisible();
      const rotatedKey = (await rotatedKeyDialog.getByText(/sk_live_/).textContent())?.trim() ?? "";
      expect(rotatedKey).not.toBe(initialKey);
      await capture(page, testInfo, "08-rotated-key");
      await rotatedKeyDialog.getByRole("button", { name: "关闭" }).click();

      const oldKeyResponse = await signedPost(api, "ingest/symbols", initialKey, {
        mt5_login: Number(TEST_LOGIN),
        symbols: [{ name: SYMBOL, digits: 2, point: 0.01, tick_value: 1, contract_size: 100 }],
      });
      expect(oldKeyResponse.status()).toBe(401);
      const newKeyResponse = await signedPost(api, "ingest/symbols", rotatedKey, {
        mt5_login: Number(TEST_LOGIN),
        symbols: [{ name: SYMBOL, digits: 2, point: 0.01, tick_value: 1, contract_size: 100 }],
      });
      expect(newKeyResponse.ok(), await newKeyResponse.text()).toBeTruthy();

      await page.reload({ waitUntil: "domcontentloaded" });
      row = page.getByRole("row").filter({ hasText: TEST_NAME }).first();
      await row.getByRole("button", { name: /更多操作/ }).click();
      await page.getByRole("menuitem", { name: "删除账户" }).click();
      const deleteDialog = page.getByRole("dialog");
      await deleteDialog.getByLabel("请输入账户名称确认").fill(TEST_NAME);
      await capture(page, testInfo, "09-delete-confirmation");
      await deleteDialog.getByRole("button", { name: "永久删除" }).click();
      await expect(page.getByText("账户已物理删除")).toBeVisible();
      await capture(page, testInfo, "10-deleted");

      expect(dbValue(`SELECT COUNT(*) FROM accounts WHERE mt5_login=${TEST_LOGIN}`)).toBe("0");
      expect(dbValue(`SELECT COUNT(*) FROM deals WHERE account_login=${TEST_LOGIN}`)).toBe("0");
      expect(dbValue(`SELECT COUNT(*) FROM closed_trades WHERE account_login=${TEST_LOGIN}`)).toBe("0");
      expect(dbValue(`SELECT COUNT(*) FROM snapshots WHERE account_login=${TEST_LOGIN}`)).toBe("0");
    } finally {
      await api.dispose();
    }
  });
});
