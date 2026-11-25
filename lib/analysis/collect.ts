/**
 * Browser collection: renders the target page once, records real lab metrics and
 * network activity, then captures responsive evidence at three viewport sizes.
 */

import type { Browser, Page } from "puppeteer-core";
import { auditPage, type DomAudit } from "./audit-script";

export interface ViewportCapture {
  id: "mobile" | "tablet" | "desktop";
  label: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  screenshot: string | null;
  screenshotNote?: string;
  audit: DomAudit | null;
}

export interface NetworkEntry {
  url: string;
  origin: string;
  type: string;
  status: number;
  bytes: number;
  mime: string;
  thirdParty: boolean;
  durationMs: number | null;
}

export interface LabMetrics {
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  tbt: number | null;
  ttfb: number | null;
  domContentLoaded: number | null;
  load: number | null;
  lcpElement: string | null;
  longTasks: number;
  firstPaint: number | null;
}

export interface PageSnapshot {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  html: string;
  lab: LabMetrics;
  network: NetworkEntry[];
  consoleErrors: { message: string; url: string | null }[];
  failedRequests: { url: string; error: string }[];
  captures: ViewportCapture[];
  browserVersion: string;
  mainAudit: DomAudit;
  mixedContent: string[];
  pageErrors: string[];
}

const MOBILE_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";

const VIEWPORTS: { id: "tablet" | "desktop"; label: string; width: number; height: number; dpr: number; mobile: boolean }[] = [
  { id: "tablet", label: "Tablet · 834 × 1112", width: 834, height: 1112, dpr: 1, mobile: false },
  { id: "desktop", label: "Desktop · 1440 × 900", width: 1440, height: 900, dpr: 1, mobile: false },
];

/** Performance observers are installed before any script on the page runs. */
function installObservers(): void {
  type Store = {
    lcp: number;
    lcpElement: string;
    cls: number;
    fcp: number;
    longTasks: number;
    tbt: number;
    errors: string[];
  };
  const store: Store = { lcp: 0, lcpElement: "", cls: 0, fcp: 0, longTasks: 0, tbt: 0, errors: [] };
  (window as unknown as { __lensMetrics: Store }).__lensMetrics = store;

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e = entry as PerformanceEntry & { element?: Element };
        store.lcp = Math.round(entry.startTime);
        if (e.element) {
          const el = e.element;
          store.lcpElement = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${
            el.className && typeof el.className === "string" ? `.${el.className.split(/\s+/).slice(0, 2).join(".")}` : ""
          }`;
        }
      }
    }).observe({ type: "largest-contentful-paint", buffered: true } as PerformanceObserverInit);
  } catch {
    /* unsupported */
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) store.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true } as PerformanceObserverInit);
  } catch {
    /* unsupported */
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") store.fcp = Math.round(entry.startTime);
      }
    }).observe({ type: "paint", buffered: true });
  } catch {
    /* unsupported */
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        store.longTasks += 1;
        store.tbt += Math.max(0, entry.duration - 50);
      }
    }).observe({ type: "longtask", buffered: true } as PerformanceObserverInit);
  } catch {
    /* unsupported */
  }

  window.addEventListener("error", (event) => {
    store.errors.push(String(event.message).slice(0, 200));
  });
}

async function readMetrics(page: Page): Promise<LabMetrics> {
  return page.evaluate(() => {
    const store = (window as unknown as { __lensMetrics?: Record<string, unknown> }).__lensMetrics ?? {};
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const paint = performance.getEntriesByType("paint").find((entry) => entry.name === "first-paint");
    return {
      fcp: (store.fcp as number) ?? null,
      lcp: (store.lcp as number) || null,
      cls: typeof store.cls === "number" ? Math.round((store.cls as number) * 1000) / 1000 : null,
      tbt: typeof store.tbt === "number" ? Math.round(store.tbt as number) : null,
      ttfb: nav ? Math.max(0, Math.round(nav.responseStart)) : null,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      load: nav ? Math.round(nav.loadEventEnd) : null,
      lcpElement: (store.lcpElement as string) || null,
      longTasks: (store.longTasks as number) ?? 0,
      firstPaint: paint ? Math.round(paint.startTime) : null,
    };
  });
}

export interface CollectOptions {
  url: string;
  browser: Browser;
  browserVersion: string;
  timeoutMs?: number;
  withScreenshots?: boolean;
  signal?: AbortSignal;
}

export async function collectPage(options: CollectOptions): Promise<PageSnapshot> {
  const { url, browser, browserVersion, timeoutMs = 30_000, withScreenshots = true, signal } = options;
  const page = await browser.newPage();
  const consoleErrors: { message: string; url: string | null }[] = [];
  const failedRequests: { url: string; error: string }[] = [];
  const pageErrors: string[] = [];

  const network = new Map<string, NetworkEntry>();

  await page.setUserAgent(MOBILE_USER_AGENT);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(installObservers);

  page.on("console", (message) => {
    if (message.type() === "error" && consoleErrors.length < 20) {
      consoleErrors.push({
        message: message.text().slice(0, 300),
        url: message.location()?.url ?? null,
      });
    }
  });
  page.on("pageerror", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (pageErrors.length < 10) pageErrors.push(message.slice(0, 250));
  });
  page.on("requestfailed", (request) => {
    if (failedRequests.length < 20) {
      failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "failed" });
    }
  });

  const cdp = await page.createCDPSession();
  await cdp.send("Network.enable");
  const requestMeta = new Map<string, { url: string; type: string; status: number; mime: string; start: number }>();

  cdp.on("Network.responseReceived", (event) => {
    const response = event.response;
    requestMeta.set(event.requestId, {
      url: response.url,
      type: event.type,
      status: response.status,
      mime: response.mimeType ?? "",
      start: Date.now(),
    });
  });

  cdp.on("Network.loadingFinished", (event) => {
    const meta = requestMeta.get(event.requestId);
    if (!meta) return;
    network.set(event.requestId, {
      url: meta.url,
      origin: safeOrigin(meta.url),
      type: meta.type,
      status: meta.status,
      bytes: event.encodedDataLength ?? 0,
      mime: meta.mime,
      thirdParty: false,
      durationMs: null,
    });
    requestMeta.delete(event.requestId);
  });

  // Simulated mobile network + CPU throttling, so lab numbers resemble a mid-tier phone.
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  let status = 0;
  let headers: Record<string, string> = {};
  let finalUrl = url;

  try {
    const response = await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
    status = response?.status() ?? 0;
    headers = (response?.headers() ?? {}) as Record<string, string>;
    finalUrl = page.url();
  } catch (error) {
    await page.close().catch(() => undefined);
    throw new NavigationError(
      error instanceof Error ? error.message : "Navigation failed",
      /timeout|Timeout/i.test(String(error)) ? "timeout" : "navigation",
    );
  }

  if (signal?.aborted) {
    await page.close().catch(() => undefined);
    throw new NavigationError("Analysis cancelled", "cancelled");
  }

  await page.waitForNetworkIdle({ idleTime: 1200, timeout: 6000 }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const lab = await readMetrics(page);
  const html = await page.content().catch(() => "");
  const mainAudit = (await page.evaluate(auditPage).catch(() => null)) as DomAudit | null;
  if (!mainAudit) {
    await page.close().catch(() => undefined);
    throw new NavigationError("The page finished loading but could not be inspected.", "audit_failed");
  }

  let screenshot: string | null = null;
  let screenshotNote: string | undefined;
  if (withScreenshots) {
    try {
      screenshot = await page.screenshot({ type: "jpeg", quality: 62, encoding: "base64", fullPage: false });
    } catch (error) {
      screenshotNote = `Screenshot capture failed: ${error instanceof Error ? error.message : "unknown error"}`;
    }
  }

  const mobileCapture: ViewportCapture = {
    id: "mobile",
    label: "Mobile · 390 × 844",
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    screenshot,
    screenshotNote,
    audit: mainAudit,
  };

  // Release throttling before resizing, so responsive checks are not artificially slow.
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => undefined);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  }).catch(() => undefined);

  const captures: ViewportCapture[] = [mobileCapture];

  for (const viewport of VIEWPORTS) {
    if (signal?.aborted) break;
    try {
      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.dpr,
        isMobile: viewport.mobile,
        hasTouch: viewport.mobile,
      });
      await new Promise((resolve) => setTimeout(resolve, 900));
      const audit = (await page.evaluate(auditPage).catch(() => null)) as DomAudit | null;
      let shot: string | null = null;
      let note: string | undefined;
      if (withScreenshots) {
        try {
          shot = await page.screenshot({ type: "jpeg", quality: 62, encoding: "base64", fullPage: false });
        } catch (error) {
          note = `Screenshot capture failed: ${error instanceof Error ? error.message : "unknown error"}`;
        }
      }
      captures.push({
        id: viewport.id,
        label: viewport.label,
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.dpr,
        screenshot: shot,
        screenshotNote: note,
        audit,
      });
    } catch (error) {
      captures.push({
        id: viewport.id,
        label: viewport.label,
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.dpr,
        screenshot: null,
        screenshotNote: error instanceof Error ? error.message : "Viewport capture failed",
        audit: null,
      });
    }
  }

  await page.close().catch(() => undefined);

  const pageOrigin = safeOrigin(finalUrl);
  const entries = Array.from(network.values()).map((entry) => ({
    ...entry,
    thirdParty: entry.origin !== pageOrigin && entry.origin !== "",
  }));

  return {
    requestedUrl: url,
    finalUrl,
    status,
    headers,
    html,
    lab,
    network: entries,
    consoleErrors,
    failedRequests,
    captures,
    browserVersion,
    mainAudit,
    mixedContent: mainAudit.mixedContent,
    pageErrors,
  };
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export class NavigationError extends Error {
  constructor(
    message: string,
    public kind: "timeout" | "navigation" | "audit_failed" | "cancelled",
  ) {
    super(message);
    this.name = "NavigationError";
  }
}

export async function captureFavicon(browser: Browser, url: string): Promise<string | null> {
  try {
    const page = await browser.newPage();
    const response = await page.goto(url, { timeout: 6_000 });
    if (!response?.ok()) {
      await page.close().catch(() => undefined);
      return null;
    }
    const buffer = await response.buffer();
    await page.close().catch(() => undefined);
    if (buffer.byteLength > 60_000) return null;
    const type = response.headers()["content-type"] ?? "image/x-icon";
    if (!/image\//.test(type)) return null;
    return `data:${type.split(";")[0]};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}
