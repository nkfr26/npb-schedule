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
    "timeout preserves the error and identifies only unfinished requests",
    async () => {
      logs.length = 0;
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(1500);
      await page.route("**/*", (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/failed.js") return route.abort("connectionfailed");
        if (path === "/stalled.js") return;
        return route.fulfill({
          status: 200,
          contentType: "text/html",
          body: '<script src="/failed.js"></script><script src="/stalled.js"></script>',
        });
      });
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
      assert.ok(
        logs.some(
          ([label, , url, error]) =>
            label === "[request failed]" &&
            url.endsWith("/failed.js") &&
            error.includes("CONNECTION_FAILED"),
        ),
      );
      const pending = JSON.parse(
        logs.find(([label]) => label === "[pending requests]")[1],
      );
      assert.equal(pending.length, 1);
      assert.equal(pending[0].url, "https://diagnostics.test/stalled.js");
      assert.equal(pending[0].resourceType, "script");
      assert.ok(pending[0].elapsedMs > 0);
      assert.equal(page.listenerCount("request"), 0);
      assert.equal(page.listenerCount("requestfinished"), 0);
      assert.equal(page.listenerCount("requestfailed"), 0);
      assert.equal(page.listenerCount("response"), 0);
      await page.close();
    },
  );
});
