import { setTimeout as delay } from "node:timers/promises";
import type { Page, Route } from "@playwright/test";

export async function navigateSchedule(
  page: Page,
  url: string,
  maxAttempts = 1,
) {
  // The schedule is in the HTML; scripts, styles and images are unnecessary.
  const documentOnly = (route: Route) =>
    route.request().resourceType() === "document"
      ? route.fallback()
      : route.abort();
  await page.route("**/*", documentOnly);
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        return;
      } catch (error) {
        if (attempt >= maxAttempts) throw error;
        console.warn("[navigation retry]", url, `${attempt}/${maxAttempts}`);
        await delay(2000);
      }
    }
  } finally {
    await page.unroute("**/*", documentOnly);
  }
}
