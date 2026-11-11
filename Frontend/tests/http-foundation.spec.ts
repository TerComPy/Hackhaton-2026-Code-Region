import { test, expect } from "@playwright/test";

test("transport failures, cancellation, timeout, invalid JSON and 401 lifecycle", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createApi, ApiError } = await import("/src/shared/api.ts");
    const original = window.fetch;
    const codes: string[] = [];
    const api = createApi("", () => "jwt", { onUnauthorized: () => codes.push("cleared") });
    async function capture(run: () => Promise<unknown>) {
      try { await run(); } catch (e) { if (!(e instanceof ApiError)) throw e; codes.push(e.code); }
    }
    try {
      window.fetch = async () => { throw new TypeError("offline"); };
      await capture(() => api.health());
      window.fetch = async () => new Response("bad json", { status: 200 });
      await capture(() => api.health());
      window.fetch = async () => new Response("not json", { status: 401 });
      await capture(() => api.health());
      window.fetch = async (_url, init) => new Promise((_resolve, reject) => {
        const abort = () => reject(new DOMException("aborted", "AbortError"));
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener("abort", abort, { once: true });
      });
      await capture(() => api.health({ timeoutMs: 5 }));
      const controller = new AbortController();
      controller.abort();
      await capture(() => api.health({ signal: controller.signal }));
    } finally { window.fetch = original; }
    return codes;
  });
  expect(result).toEqual(["NETWORK_ERROR", "INVALID_RESPONSE", "cleared", "HTTP_ERROR", "TIMEOUT", "ABORTED"]);
});

test("real Express liveness and MySQL readiness through Vite proxy", async ({ request }) => {
  test.skip(process.env.LIVE_API !== "1", "Requires running local Express and MySQL");
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });
  const ready = await request.get("/api/ready");
  console.log("Real /api/ready:", ready.status(), await ready.text());
  expect(ready.status(), "MySQL must be reachable").toBe(200);
  expect(await ready.json()).toEqual({ status: "ready", database: "ok" });
});
