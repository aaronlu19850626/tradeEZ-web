import { expect, type Page } from "@playwright/test";

export function monitorPage(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return { errors };
}

export async function gotoDashboard(page: Page, path: string, heading: string | RegExp = /./) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({ timeout: 30_000 });
}
