import { expect, request as playwrightRequest, test as setup } from "@playwright/test";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const FRONTEND_URL = process.env.TRADEEZ_BASE_URL ?? "http://127.0.0.1:3000";
const API_URL = process.env.TRADEEZ_API_URL ?? "http://127.0.0.1:8000/api/v1/";
const AUTH_STATE_PATH = path.resolve(process.env.PLAYWRIGHT_AUTH_STATE ?? ".playwright/auth.json");
const TEST_EMAIL = "e2e@example.com";
const TEST_CODE = "123456";

async function obtainToken(): Promise<string> {
  const api = await playwrightRequest.newContext({ baseURL: API_URL });
  try {
    const payload = { email: TEST_EMAIL, code: TEST_CODE };
    let response = await api.post("auth/verify-code", { data: payload });
    if (!response.ok()) {
      let send = await api.post("auth/send-code", { data: { email: TEST_EMAIL } });
      if (send.status() === 429) {
        const retryAfter = Number(send.headers()["retry-after"] ?? 60);
        await new Promise((resolve) => setTimeout(resolve, (retryAfter + 1) * 1000));
        send = await api.post("auth/send-code", { data: { email: TEST_EMAIL } });
      }
      if (!send.ok()) {
        throw new Error(`Unable to send login code: ${send.status()} ${await send.text()}`);
      }
      response = await api.post("auth/verify-code", { data: payload });
    }
    expect(response.ok(), `Login failed: ${response.status()} ${await response.text()}`).toBeTruthy();
    const body = (await response.json()) as { access_token: string };
    return body.access_token;
  } finally {
    await api.dispose();
  }
}

setup.setTimeout(90_000);

setup("authenticate dashboard user", async () => {
  const token = await obtainToken();
  await mkdir(path.dirname(AUTH_STATE_PATH), { recursive: true });
  await writeFile(
    AUTH_STATE_PATH,
    JSON.stringify(
      {
        cookies: [
          {
            name: "tradeez-session",
            value: token,
            domain: new URL(FRONTEND_URL).hostname,
            path: "/",
            expires: -1,
            httpOnly: false,
            secure: false,
            sameSite: "Lax",
          },
        ],
        origins: [
          {
            origin: new URL(FRONTEND_URL).origin,
            localStorage: [{ name: "tradesync-access-token", value: token }],
          },
        ],
      },
      null,
      2,
    ),
  );
});
