import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { navigateSchedule } from "../dist/navigate-schedule.js";

test("schedule navigation", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  t.mock.method(console, "warn", () => {});

  await t.test("reads HTML without waiting for assets", async () => {
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
    await navigateSchedule(page, "https://schedule.test/html");
    assert.equal(await page.locator("#schedule_detail tbody tr").count(), 1);
    assert.equal(await page.locator("#schedule_detail").innerText(), "Game");
    assert.deepEqual(assetRequests, []);
    await page.close();
  });

  await t.test("recovers from a transient document failure", async () => {
    const page = await browser.newPage();
    let attempts = 0;
    await page.route("**/*", (route) => {
      attempts++;
      return attempts === 1
        ? route.abort("connectionfailed")
        : route.fulfill({ contentType: "text/html", body: "<p>Recovered</p>" });
    });
    await navigateSchedule(page, "https://schedule.test/retry", 3);
    assert.equal(attempts, 2);
    assert.equal(await page.locator("p").innerText(), "Recovered");
    await page.close();
  });

  await t.test("stops at the retry limit and throws the error", async () => {
    const page = await browser.newPage();
    let attempts = 0;
    await page.route("**/*", (route) => {
      attempts++;
      return route.abort("connectionfailed");
    });
    await assert.rejects(
      navigateSchedule(page, "https://schedule.test/retry-limit", 2),
      /ERR_CONNECTION_FAILED/,
    );
    assert.equal(attempts, 2);
    await page.close();
  });
});
