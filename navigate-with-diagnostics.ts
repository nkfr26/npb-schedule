import type { Page, Request, Response, Route } from "@playwright/test";

export async function navigateWithDiagnostics(page: Page, url: string) {
  const pending = new Map<Request, number>();
  const onRequest = (request: Request) => pending.set(request, Date.now());
  const onFinished = (request: Request) => pending.delete(request);
  const onFailed = (request: Request) => {
    pending.delete(request);
    if (request.resourceType() !== "document") return;
    console.error(
      "[request failed]",
      request.resourceType(),
      request.url(),
      request.failure()?.errorText,
    );
  };
  const onResponse = (response: Response) => {
    console.log("[HTTP]", response.status(), response.url());
  };
  // The schedule is in the HTML; scripts, styles and images are unnecessary.
  const documentOnly = (route: Route) =>
    route.request().resourceType() === "document"
      ? route.fallback()
      : route.abort();

  await page.route("**/*", documentOnly);
  page.on("request", onRequest);
  page.on("requestfinished", onFinished);
  page.on("requestfailed", onFailed);
  page.on("response", onResponse);
  console.log("[navigation start]", url);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  } catch (error) {
    console.error("[navigation failed]", url, error);
    console.error(
      "[pending requests]",
      JSON.stringify(
        [...pending].map(([request, startedAt]) => ({
          url: request.url(),
          resourceType: request.resourceType(),
          elapsedMs: Date.now() - startedAt,
        })),
      ),
    );
    throw error;
  } finally {
    page.off("request", onRequest);
    page.off("requestfinished", onFinished);
    page.off("requestfailed", onFailed);
    page.off("response", onResponse);
    await page.unroute("**/*", documentOnly);
  }
}
