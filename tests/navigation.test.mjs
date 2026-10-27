import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { navigateWithDiagnostics } from "../dist/navigate-with-diagnostics.js";

test("navigation diagnostics report responses, failures and pending requests", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const logs = [];
  t.mock.method(console, "log", (...args) => logs.push(args));
  t.mock.method(console, "error", (...args) => logs.push(args));
  t.mock.method(console, "warn", (...args) => logs.push(args));

  await t.test(
    "successful navigation logs HTTP status and removes listeners",
    async () => {
      const page = await browser.newPage();
      await page.route("**/*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<p>OK</p>",
        }),
      );
      const events = [
        "request",
        "requestfinished",
        "requestfailed",
        "response",
      ];
      const before = events.map((event) => page.listenerCount(event));
      await navigateWithDiagnostics(page, "https://diagnostics.test/success");
      assert.ok(
        logs.some(([label, status]) => label === "[HTTP]" && status === 200),
      );
      assert.deepEqual(
        events.map((event) => page.listenerCount(event)),
        before,
      );
      assert.ok(!logs.some(([label]) => label === "[navigation failed]"));
      await page.close();
    },
  );

  await t.test(
    "timeout preserves the error and identifies the unfinished document",
    async () => {
      logs.length = 0;
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(1500);
      await page.route("**/*", () => {});
      let reportedError;
      await assert.rejects(
        navigateWithDiagnostics(page, "https://diagnostics.test/timeout"),
        (error) => {
          reportedError = error;
          return error.name === "TimeoutError";
        },
      );
      assert.equal(
        logs.find(([label]) => label === "[navigation failed]")[2],
        reportedError,
      );
      const pending = JSON.parse(
        logs.find(([label]) => label === "[pending requests]")[1],
      );
      assert.equal(pending.length, 1);
      assert.equal(pending[0].url, "https://diagnostics.test/timeout");
      assert.equal(pending[0].resourceType, "document");
      assert.ok(pending[0].elapsedMs > 0);
      assert.equal(page.listenerCount("request"), 0);
      assert.equal(page.listenerCount("requestfinished"), 0);
      assert.equal(page.listenerCount("requestfailed"), 0);
      assert.equal(page.listenerCount("response"), 0);
      await page.close();
    },
  );

  await t.test(
    "failed document requests retain their network error",
    async () => {
      logs.length = 0;
      const page = await browser.newPage();
      await page.route("**/*", (route) => route.abort("connectionfailed"));
      await assert.rejects(
        navigateWithDiagnostics(page, "https://diagnostics.test/failed"),
        /ERR_CONNECTION_FAILED/,
      );
      assert.ok(
        logs.some(
          ([label, , , error]) =>
            label === "[request failed]" && error.includes("CONNECTION_FAILED"),
        ),
      );
      await page.close();
    },
  );

  await t.test(
    "HTML schedule is readable without waiting for assets",
    async () => {
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(1500);
      const assetRequests = [];
      await page.route("**/*", (route) => {
        if (route.request().resourceType() !== "document") {
          assetRequests.push(route.request().url());
          return;
        }
        return route.fulfill({
          contentType: "text/html",
          body: '<link rel="stylesheet" href="/stalled.css"><script src="/stalled.js"></script><table id="schedule_detail"><tbody><tr><td>Game</td></tr></tbody></table><img src="/stalled.png">',
        });
      });
      await navigateWithDiagnostics(page, "https://diagnostics.test/schedule");
      assert.equal(await page.locator("#schedule_detail tbody tr").count(), 1);
      assert.equal(await page.locator("#schedule_detail").innerText(), "Game");
      assert.deepEqual(assetRequests, []);
      await page.close();
    },
  );
  await t.test(
    "a transient document failure retries the same URL",
    async () => {
      const page = await browser.newPage();
      let attempts = 0;
      await page.route("**/*", (route) => {
        attempts++;
        return attempts === 1
          ? route.abort("connectionfailed")
          : route.fulfill({
              contentType: "text/html",
              body: "<p>Recovered</p>",
            });
      });
      await navigateWithDiagnostics(page, "https://diagnostics.test/retry", 3);
      assert.equal(attempts, 2);
      assert.equal(await page.locator("p").innerText(), "Recovered");
      await page.close();
    },
  );

  await t.test(
    "retries stop at the limit and preserve the final error",
    async () => {
      logs.length = 0;
      const page = await browser.newPage();
      let attempts = 0;
      await page.route("**/*", (route) => {
        attempts++;
        return route.abort("connectionfailed");
      });
      let finalError;
      await assert.rejects(
        navigateWithDiagnostics(
          page,
          "https://diagnostics.test/retry-limit",
          2,
        ),
        (error) => {
          finalError = error;
          return error.message.includes("ERR_CONNECTION_FAILED");
        },
      );
      assert.equal(attempts, 2);
      assert.equal(
        logs.filter(([label]) => label === "[navigation failed]").at(-1)[2],
        finalError,
      );
      assert.equal(page.listenerCount("request"), 0);
      await page.close();
    },
  );
});
