/**
 * Analysis orchestrator.
 *
 * Runs the pipeline in a fixed order with per-stage timeouts and a global budget, and
 * emits real progress events as each stage actually completes. Nothing about the
 * progress is simulated: a stage is only reported when it has run.
 */

import { randomBytes } from "node:crypto";
import { normalizeInputUrl, assertSafeUrl, UnsafeUrlError } from "@/lib/url-safety";
import { safeFetch } from "@/lib/http/safe-fetch";
import { launchChromium } from "./chromium";
import { collectPage, NavigationError, type PageSnapshot } from "./collect";
import { auditHtml } from "./static-audit";
import { buildPerformance } from "./checks/performance";
import { buildMobile } from "./checks/mobile";
import { buildAccessibility } from "./checks/accessibility";
import { buildSeo, seoSummary } from "./checks/seo";
import { buildSecurity } from "./checks/security";
import { buildLinks, type LinkCandidate } from "./checks/links";
import { buildReport } from "./report";
import type { Finding, ProgressEvent, Report } from "@/lib/types";

export interface AnalyzeOptions {
  input: string;
  onProgress: (event: ProgressEvent) => void;
  signal?: AbortSignal;
  budgetMs?: number;
}

const STAGE_PROGRESS: Record<string, { progress: number; label: string }> = {
  validating: { progress: 0.05, label: "Validating address" },
  fetching: { progress: 0.16, label: "Fetching the document" },
  launching: { progress: 0.26, label: "Starting a browser session" },
  performance: { progress: 0.45, label: "Measuring performance" },
  mobile: { progress: 0.6, label: "Rendering mobile, tablet and desktop" },
  accessibility: { progress: 0.7, label: "Auditing accessibility" },
  seo: { progress: 0.78, label: "Inspecting SEO signals" },
  links: { progress: 0.86, label: "Checking links and resources" },
  security: { progress: 0.93, label: "Reviewing security configuration" },
  scoring: { progress: 0.97, label: "Scoring and assembling the report" },
};

function newReportId(): string {
  return randomBytes(8).toString("hex");
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), Math.max(500, ms));
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

export async function runAnalysis(options: AnalyzeOptions): Promise<Report> {
  const started = Date.now();
  const budgetMs = options.budgetMs ?? 48_000;
  const deadline = started + budgetMs;
  const emit = (stage: keyof typeof STAGE_PROGRESS, detail?: string) => {
    const meta = STAGE_PROGRESS[stage];
    options.onProgress({
      type: "progress",
      stage: stage as ProgressEvent["stage"],
      label: meta.label,
      detail,
      progress: meta.progress,
      at: Date.now(),
    });
  };

  const notes: string[] = [];
  const findings: Finding[] = [];

  emit("validating");
  const parsed = normalizeInputUrl(options.input);
  await assertSafeUrl(parsed.url);

  emit("fetching", parsed.url.hostname);
  let documentResponse = null as Awaited<ReturnType<typeof safeFetch>> | null;
  let documentError: string | null = null;
  try {
    documentResponse = await safeFetch(parsed.url.toString(), {
      timeoutMs: Math.min(15_000, Math.max(5_000, deadline - Date.now() - 30_000)),
      maxBytes: 3_000_000,
      signal: options.signal,
    });
  } catch (error) {
    documentError = error instanceof Error ? error.message : "The document could not be fetched.";
  }

  if (!documentResponse && documentError) {
    if (documentError.includes("Too many redirects")) {
      throw new UnsafeUrlError("The site redirects too many times.", "Check the URL in a browser and try the final address.");
    }
  }

  const effectiveUrl = documentResponse?.url ?? parsed.url.toString();
  const host = new URL(effectiveUrl).hostname;

  emit("launching");
  let snapshot: PageSnapshot | null = null;
  let browserError: string | null = null;
  let browser: Awaited<ReturnType<typeof launchChromium>> | null = null;

  try {
    const launched = await Promise.race([
      launchChromium(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
    ]);
    if (launched) {
      browser = launched;
    } else {
      browserError = "The browser session timed out while starting.";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : "Unknown browser error";
    browserError = message.slice(0, 160);
  }

  // Budget: the browser phase must finish early enough that the remaining checks
  // still fit inside the serverless limit, even on slow or bot-protected pages.
  const collectBudget = deadline - Date.now() - 14_000;
  if (browser && collectBudget < 12_000) {
    await browser.browser.close().catch(() => undefined);
    browser = null;
    browserError = "Not enough time remained to render the page in a browser.";
  }

  if (browser) {
    try {
      emit("performance");
      snapshot = await collectPage({
        url: parsed.url.toString(),
        browser: browser.browser,
        browserVersion: browser.browserVersion,
        timeoutMs: Math.min(20_000, Math.max(8_000, collectBudget)),
        withScreenshots: true,
        signal: options.signal,
        deadline: deadline - 11_000,
      });
      emit("mobile");
    } catch (error) {
      if (error instanceof NavigationError && error.kind === "cancelled") {
        throw error;
      }
      browserError = error instanceof Error ? error.message : "The browser session failed.";
      notes.push(
        `The browser session could not complete for this URL (${browserError}). LENS fell back to static HTML inspection and marked every browser-dependent check as not assessed.`,
      );
    } finally {
      await browser.browser.close().catch(() => undefined);
    }
  } else if (browserError) {
    notes.push(
      `A browser session was not available for this URL (${browserError}). Performance, responsive rendering and contrast were not assessed rather than scored as failures.`,
    );
  }

  const html = snapshot?.html ?? documentResponse?.body ?? "";
  const finalUrl = snapshot?.finalUrl ?? effectiveUrl;
  const status = snapshot?.status ?? documentResponse?.status ?? 0;
  const headers = snapshot?.headers ?? documentResponse?.headers ?? {};

  if (!html) {
    throw new UnsafeUrlError(
      "The site did not return any HTML to analyse.",
      documentResponse ? `The server responded with HTTP ${documentResponse.status} and no readable document.` : "The request failed before any content arrived.",
      "empty_document",
    );
  }

  const audit = snapshot?.mainAudit ?? auditHtml(html, finalUrl);

  emit("accessibility");
  const performance = buildPerformance(snapshot, Boolean(snapshot));
  const mobile = buildMobile(snapshot?.captures ?? [], finalUrl, Boolean(snapshot));
  const accessibility = buildAccessibility(audit, finalUrl, Boolean(snapshot));
  findings.push(...performance.findings, ...mobile.findings, ...accessibility.findings);

  emit("seo");
  const seo = await withTimeout(
    buildSeo({ audit, finalUrl, origin: new URL(finalUrl).origin, status, signal: options.signal }),
    Math.max(2_500, deadline - Date.now() - 10_000),
    {
      score: null,
      coverage: 0,
      findings: [],
      section: {
        available: false,
        title: audit.title || null,
        titleLength: audit.title.length,
        description: audit.meta.description,
        descriptionLength: audit.meta.description?.length ?? 0,
        canonical: audit.meta.canonical,
        robotsMeta: audit.meta.robots,
        h1: audit.headings.filter((heading) => heading.level === 1).map((heading) => heading.text),
        headings: audit.headings,
        openGraph: audit.meta.og,
        twitter: audit.meta.twitter,
        structuredData: { types: Array.from(new Set(audit.jsonLd)), blocks: 0 },
        sitemap: { url: `${new URL(finalUrl).origin}/sitemap.xml`, available: false, status: null, urls: null },
        robotsTxt: { url: `${new URL(finalUrl).origin}/robots.txt`, available: false, status: null },
        checks: [],
        internalLinks: audit.links.filter((link) => link.internal).length,
        externalLinks: audit.links.filter((link) => !link.internal).length,
        indexable: true,
      },
    },
  );
  findings.push(...seo.findings);

  emit("links");
  const candidates: LinkCandidate[] = [
    ...audit.links.map((link) => ({
      url: link.href,
      type: link.internal ? ("internal" as const) : ("external" as const),
      kind: "link" as const,
      anchor: link.text || undefined,
      foundOn: finalUrl,
    })),
    ...audit.images
      .filter((image) => image.src.startsWith("http"))
      .map((image) => ({
        url: image.src,
        type: new URL(image.src).origin === new URL(finalUrl).origin ? ("internal" as const) : ("external" as const),
        kind: "image" as const,
        foundOn: finalUrl,
      })),
  ];

  const links = await withTimeout(
    buildLinks({
      candidates,
      origin: new URL(finalUrl).origin,
      finalUrl,
      budgetMs: Math.max(2_500, Math.min(12_000, deadline - Date.now() - 6_000)),
      signal: options.signal,
    }),
    Math.max(2_500, deadline - Date.now() - 3_500),
    {
      score: null,
      coverage: 0,
      findings: [],
      section: {
        available: false,
        discovered: candidates.length,
        checked: 0,
        truncated: false,
        summary: { ok: 0, redirect: 0, broken: 0, blocked: 0, timeout: 0, unchecked: candidates.length },
        items: [],
        redirectChains: [],
        loops: [],
      },
    },
  );
  findings.push(...links.findings);

  emit("security");
  const security = await withTimeout(
    buildSecurity({ finalUrl, headers, mixedContent: audit.mixedContent }),
    Math.max(2_000, deadline - Date.now() - 1_500),
    {
      score: null,
      coverage: 0,
      findings: [],
      section: {
        available: false,
        https: {
          supported: finalUrl.startsWith("https://"),
          redirectedFromHttp: false,
          redirectTarget: null,
          certificate: null,
        },
        headers: [],
        mixedContent: { count: 0, samples: [] },
        serverInfo: { server: null, poweredBy: null, exposed: false },
        checks: [],
      },
    },
  );
  findings.push(...security.findings);

  emit("scoring");

  const skippedViewports = (snapshot?.captures ?? []).filter((capture) => !capture.audit).map((capture) => capture.label);
  if (skippedViewports.length) {
    notes.push(
      `The time budget expired before ${skippedViewports.join(", ")} could be rendered. Those viewport checks are reported as not assessed, not as failures.`,
    );
  }

  const coverage = {
    browser: Boolean(snapshot),
    fieldData: false,
    links: links.section.available,
    screenshots: Boolean(snapshot?.captures.some((capture) => capture.screenshot)),
    sitemap: seo.section.sitemap.available,
  };

  const report = buildReport({
    id: newReportId(),
    requestedUrl: parsed.url.toString(),
    finalUrl,
    host,
    title: audit.title || host,
    description: audit.meta.description,
    themeColor: audit.meta.themeColor,
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    status:
      coverage.browser && links.section.available && seo.section.available && skippedViewports.length === 0
        ? "complete"
        : "partial",
    coverage,
    performance: performance.section,
    mobile: mobile.section,
    accessibility: accessibility.section,
    seo: { ...seo.section },
    links: links.section,
    security: security.section,
    scores: {
      performance: { score: performance.score, coverage: performance.coverage },
      mobile: { score: mobile.score, coverage: mobile.coverage },
      accessibility: { score: accessibility.score, coverage: accessibility.coverage },
      seo: { score: seo.score, coverage: seo.coverage },
      links: { score: links.score, coverage: links.coverage },
      security: { score: security.score, coverage: security.coverage },
    },
    findings,
    notes,
    snapshot,
    linkTruncated: links.section.truncated,
  });

  return {
    ...report,
    categories: report.categories.map((category) =>
      category.key === "seo" ? { ...category, summary: category.score === null ? category.summary : seoSummary(report.seo, category.score) } : category,
    ),
  };
}
