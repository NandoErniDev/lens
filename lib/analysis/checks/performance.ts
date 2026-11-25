/**
 * Performance: real lab measurements from the rendered page, plus resource
 * diagnostics. Field data (CrUX) is only ever attached when an upstream source
 * actually returned it.
 */

import type { Finding, Metric, PerformanceSection, Rating, ResourceGroup } from "@/lib/types";
import type { PageSnapshot } from "../collect";
import { finding, plural } from "../findings";

export interface PerformanceResult {
  section: PerformanceSection;
  findings: Finding[];
  /** 0–100, or null when no lab measurement is available. */
  score: number | null;
  coverage: number;
}

export function metricScore(value: number, good: number, poor: number): number {
  if (value <= good) return 100;
  if (value <= poor) return Math.round(100 - 50 * ((value - good) / (poor - good)));
  const beyond = (value - poor) / Math.max(poor, 1);
  return Math.max(0, Math.round(50 - 50 * Math.min(1, beyond)));
}

export function ratingFor(value: number | null, good: number, poor: number, lowerIsBetter = true): Rating {
  if (value === null || Number.isNaN(value)) return "unavailable";
  if (lowerIsBetter) {
    if (value <= good) return "good";
    if (value <= poor) return "needs-improvement";
    return "poor";
  }
  if (value >= good) return "good";
  if (value >= poor) return "needs-improvement";
  return "poor";
}

function formatMs(value: number | null): string {
  if (value === null) return "Not measured";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

export function buildMetrics(snapshot: PageSnapshot | null): Metric[] {
  const lab = snapshot?.lab ?? null;
  const lcp = lab?.lcp ?? null;
  const fcp = lab?.fcp ?? null;
  const cls = lab?.cls ?? null;
  const tbt = lab?.tbt ?? null;
  const ttfb = lab?.ttfb ?? null;

  return [
    {
      id: "lcp",
      label: "Largest Contentful Paint",
      shortLabel: "LCP",
      value: lcp,
      unit: "ms",
      display: formatMs(lcp),
      rating: ratingFor(lcp, 2500, 4000),
      source: "lab",
      good: 2500,
      poor: 4000,
      lowerIsBetter: true,
      description: "When the largest visible element finished rendering. The main perceived-loading metric.",
      note: lab?.lcpElement ? `LCP element: ${lab.lcpElement}` : undefined,
    },
    {
      id: "cls",
      label: "Cumulative Layout Shift",
      shortLabel: "CLS",
      value: cls,
      unit: "",
      display: cls === null ? "Not measured" : cls.toFixed(3),
      rating: ratingFor(cls, 0.1, 0.25),
      source: "lab",
      good: 0.1,
      poor: 0.25,
      lowerIsBetter: true,
      description: "Unexpected movement of visible content during load. Higher values mean a jumpy page.",
    },
    {
      id: "tbt",
      label: "Total Blocking Time",
      shortLabel: "TBT",
      value: tbt,
      unit: "ms",
      display: formatMs(tbt),
      rating: ratingFor(tbt, 200, 600),
      source: "lab",
      good: 200,
      poor: 600,
      lowerIsBetter: true,
      description: "How long the main thread was blocked by long tasks, delaying input handling.",
    },
    {
      id: "fcp",
      label: "First Contentful Paint",
      shortLabel: "FCP",
      value: fcp,
      unit: "ms",
      display: formatMs(fcp),
      rating: ratingFor(fcp, 1800, 3000),
      source: "lab",
      good: 1800,
      poor: 3000,
      lowerIsBetter: true,
      description: "When the first text or image was painted.",
    },
    {
      id: "ttfb",
      label: "Time to First Byte",
      shortLabel: "TTFB",
      value: ttfb,
      unit: "ms",
      display: formatMs(ttfb),
      rating: ratingFor(ttfb, 800, 1800),
      source: "lab",
      good: 800,
      poor: 1800,
      lowerIsBetter: true,
      description: "Server response time for the main document.",
    },
  ];
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const GROUP_LABELS: Record<string, string> = {
  Document: "Document",
  Script: "JavaScript",
  Stylesheet: "CSS",
  Image: "Images",
  Font: "Fonts",
  Media: "Media",
  XHR: "XHR",
  Fetch: "Fetch",
  Other: "Other",
  Preflight: "Preflight",
  Manifest: "Manifest",
  TextTrack: "Text tracks",
};

export function buildPerformance(snapshot: PageSnapshot | null, performanceAvailable: boolean): PerformanceResult {
  const findings: Finding[] = [];
  const metrics = buildMetrics(snapshot);

  if (!snapshot) {
    return {
      score: null,
      coverage: 0,
      findings: [],
      section: {
        lab: {
          device: "mobile",
          viewport: { width: 390, height: 844 },
          throttling: "Not applied — no browser measurement was possible",
          browser: "Unavailable",
          available: false,
          note: "LENS could not run a browser measurement for this URL, so no performance metric is reported. Nothing here is estimated.",
        },
        field: {
          available: false,
          note: "Real-user field data requires Chrome UX Report coverage for this origin. LENS never substitutes lab numbers for field data.",
        },
        metrics,
        resources: [],
        totals: { requests: null, bytes: null, jsBytes: null, cssBytes: null, imageBytes: null, fontBytes: null },
        opportunities: [],
        diagnostics: { renderBlocking: [], oversizedImages: [], thirdParty: [] },
      },
    };
  }

  const totals = {
    requests: snapshot.network.length,
    bytes: snapshot.network.reduce((sum, entry) => sum + entry.bytes, 0),
    jsBytes: sum(snapshot.network, "Script"),
    cssBytes: sum(snapshot.network, "Stylesheet"),
    imageBytes: sum(snapshot.network, "Image"),
    fontBytes: sum(snapshot.network, "Font"),
  };

  const groups = new Map<string, ResourceGroup>();
  for (const entry of snapshot.network) {
    const key = GROUP_LABELS[entry.type] ?? "Other";
    const current = groups.get(key) ?? { type: key, requests: 0, bytes: 0 };
    current.requests += 1;
    current.bytes += entry.bytes;
    groups.set(key, current);
  }

  const lab = snapshot.lab;

  if (lab.lcp !== null && lab.lcp > 4000) {
    findings.push(
      finding({
        category: "performance",
        severity: "critical",
        title: "Largest Contentful Paint exceeds 4 seconds",
        detected: `The largest element finished rendering at ${formatMs(lab.lcp)} on a simulated mid-tier phone.`,
        impact: "Visitors wait several seconds before seeing meaningful content, which is the clearest signal of a slow page.",
        recommendation:
          "Prioritise the LCP element: serve it from the same origin, preload critical images, avoid lazy-loading above-the-fold media, and reduce main-thread work before first paint.",
        evidence: `LCP ${formatMs(lab.lcp)} (threshold 2.5 s good / 4 s poor)`,
        measured: true,
        target: snapshot.finalUrl,
      }),
    );
  } else if (lab.lcp !== null && lab.lcp > 2500) {
    findings.push(
      finding({
        category: "performance",
        severity: "high",
        title: "Largest Contentful Paint needs improvement",
        detected: `LCP was ${formatMs(lab.lcp)} under 4× CPU throttling and a simulated Slow 4G connection.`,
        impact: "The page is usable, but slower than the 2.5 second target on mobile hardware.",
        recommendation:
          "Reduce server response time, preload the hero image, and remove render-blocking work that delays the first meaningful paint.",
        evidence: `LCP ${formatMs(lab.lcp)}`,
        measured: true,
        target: snapshot.finalUrl,
      }),
    );
  }

  if (lab.tbt !== null && lab.tbt > 600) {
    findings.push(
      finding({
        category: "performance",
        severity: "critical",
        title: "Main thread blocked for more than 600 ms",
        detected: `${lab.longTasks} long tasks blocked the main thread for a total of ${formatMs(lab.tbt)}.`,
        impact: "Taps and clicks feel unresponsive while scripts are executing.",
        recommendation:
          "Split large JavaScript bundles, defer non-critical scripts, and move expensive work into a web worker or the server.",
        evidence: `TBT ${formatMs(lab.tbt)} across ${plural(lab.longTasks, "long task")}`,
        measured: true,
      }),
    );
  } else if (lab.tbt !== null && lab.tbt > 200) {
    findings.push(
      finding({
        category: "performance",
        severity: "high",
        title: "Main thread blocked for more than 200 ms",
        detected: `${lab.longTasks} long tasks created ${formatMs(lab.tbt)} of total blocking time.`,
        impact: "Interactions can be delayed while the browser is busy executing scripts.",
        recommendation: "Reduce the cost of hydration and third-party scripts, and break up long tasks.",
        evidence: `TBT ${formatMs(lab.tbt)}`,
        measured: true,
      }),
    );
  }

  if (lab.cls !== null && lab.cls > 0.25) {
    findings.push(
      finding({
        category: "performance",
        severity: "high",
        title: "Significant layout shift during load",
        detected: `Cumulative Layout Shift reached ${lab.cls.toFixed(3)}.`,
        impact: "Content jumps while loading, which causes misclicks and makes the page feel unstable.",
        recommendation:
          "Reserve space with width/height (or aspect-ratio) on images and embeds, avoid inserting content above existing content, and use font-display with a matched fallback.",
        evidence: `CLS ${lab.cls.toFixed(3)} (0.1 good / 0.25 poor)`,
        measured: true,
      }),
    );
  } else if (lab.cls !== null && lab.cls > 0.1) {
    findings.push(
      finding({
        category: "performance",
        severity: "medium",
        title: "Moderate layout shift during load",
        detected: `Cumulative Layout Shift was ${lab.cls.toFixed(3)}.`,
        impact: "Visible elements move while the page loads, which is disruptive on mobile.",
        recommendation: "Set explicit dimensions on media and avoid late-loading banners or cookie strips above content.",
        evidence: `CLS ${lab.cls.toFixed(3)}`,
        measured: true,
      }),
    );
  }

  if (totals.bytes > 5 * 1024 * 1024) {
    findings.push(
      finding({
        category: "performance",
        severity: "high",
        title: "Page transfers more than 5 MB",
        detected: `The initial load transferred ${formatBytes(totals.bytes)} across ${plural(totals.requests ?? 0, "request")}.`,
        impact: "Large payloads are slow on mobile networks and expensive for visitors with limited data.",
        recommendation: "Compress images to modern formats, remove unused JavaScript, and lazy-load below-the-fold media.",
        evidence: `Total transfer ${formatBytes(totals.bytes)}`,
        measured: true,
      }),
    );
  } else if (totals.bytes > 2.5 * 1024 * 1024) {
    findings.push(
      finding({
        category: "performance",
        severity: "medium",
        title: "Heavy page weight",
        detected: `The initial load transferred ${formatBytes(totals.bytes)}.`,
        impact: "Every additional megabyte increases load time, especially on mobile connections.",
        recommendation: "Audit images and JavaScript bundles; compress and remove what does not affect the first screen.",
        evidence: `Total transfer ${formatBytes(totals.bytes)}`,
        measured: true,
      }),
    );
  }

  const oversized = snapshot.mainAudit.images
    .filter((image) => image.naturalWidth > 0 && image.width > 0)
    .filter((image) => image.naturalWidth > image.width * 2 && image.naturalWidth > 600)
    .slice(0, 8)
    .map((image) => ({
      url: image.src,
      bytes: estimateImageBytes(image.naturalWidth, image.naturalHeight),
      displayed: `${image.width}×${image.height}`,
    }));

  if (oversized.length) {
    findings.push(
      finding({
        category: "performance",
        severity: "high",
        title: `${plural(oversized.length, "image")} rendered far smaller than the source file`,
        detected: `At least ${plural(oversized.length, "image")} is served at more than twice the displayed size, so the browser downloads pixels it never shows.`,
        impact: "Oversized images are one of the largest avoidable contributors to page weight on mobile.",
        recommendation:
          "Serve responsive images with srcset and sizes, use AVIF or WebP, and cap the intrinsic width to what the layout needs.",
        evidence: oversized.map((item) => `${item.displayed} displayed · ${item.url.split("/").pop()}`).join("\n"),
        samples: oversized.map((item) => item.url),
        measured: true,
      }),
    );
  }

  const renderBlocking = snapshot.mainAudit.renderBlocking;
  if (renderBlocking.length >= 2) {
    findings.push(
      finding({
        category: "performance",
        severity: renderBlocking.length > 6 ? "high" : "medium",
        title: `${plural(renderBlocking.length, "render-blocking resource")} in <head>`,
        detected: `${renderBlocking.length} scripts or stylesheets block the first paint before any content can be shown.`,
        impact: "The browser must download and parse each resource before painting, which delays First Contentful Paint.",
        recommendation:
          "Inline critical CSS, defer non-critical styles, and load scripts with defer, async or type=module.",
        evidence: renderBlocking.map((item) => `${item.type}: ${item.url}`).join("\n"),
        samples: renderBlocking.map((item) => item.url),
        measured: true,
      }),
    );
  }

  if (totals.jsBytes > 1_200_000) {
    findings.push(
      finding({
        category: "performance",
        severity: "medium",
        title: "Heavy JavaScript payload",
        detected: `JavaScript accounted for ${formatBytes(totals.jsBytes)} of the initial load.`,
        impact: "Large bundles increase parse and execution time, delaying interactivity on slower devices.",
        recommendation: "Shrink bundles, remove unused dependencies and code-split routes so only needed code loads.",
        evidence: `JavaScript ${formatBytes(totals.jsBytes)}`,
        measured: true,
      }),
    );
  }

  if (snapshot.failedRequests.length) {
    findings.push(
      finding({
        category: "performance",
        severity: "medium",
        title: `${plural(snapshot.failedRequests.length, "request")} failed during load`,
        detected: "Some subresources could not be fetched while the page was loading.",
        impact: "Failed resources can break layout, analytics or functionality, and add wasted round trips.",
        recommendation: "Fix or remove the failing resources, and confirm they are not blocked by the site's own CSP or firewall.",
        evidence: snapshot.failedRequests.slice(0, 8).map((item) => `${item.url} — ${item.error}`).join("\n"),
        samples: snapshot.failedRequests.slice(0, 6).map((item) => item.url),
        measured: true,
      }),
    );
  }

  if (snapshot.pageErrors.length) {
    findings.push(
      finding({
        category: "performance",
        severity: "high",
        title: "Uncaught JavaScript error on load",
        detected: `The page threw ${plural(snapshot.pageErrors.length, "uncaught exception")} while loading.`,
        impact: "An uncaught error can abort hydration or event handlers, leaving parts of the page unresponsive.",
        recommendation: "Reproduce the error in the browser console and guard the failing code path.",
        evidence: snapshot.pageErrors.slice(0, 5).join("\n"),
        measured: true,
      }),
    );
  } else if (snapshot.consoleErrors.length > 3) {
    findings.push(
      finding({
        category: "performance",
        severity: "low",
        title: `${plural(snapshot.consoleErrors.length, "console error")} during load`,
        detected: "The page logged errors to the browser console while loading.",
        impact: "Console errors often indicate missing assets, failing API calls or misconfigured third parties.",
        recommendation: "Review the console output and resolve the underlying failed requests.",
        evidence: snapshot.consoleErrors.slice(0, 5).map((item) => item.message).join("\n"),
        measured: true,
      }),
    );
  }

  const score = computePerformanceScore({
    lcp: lab.lcp,
    tbt: lab.tbt,
    cls: lab.cls,
    fcp: lab.fcp,
    bytes: totals.bytes,
    requests: totals.requests,
  });

  const thirdPartyMap = new Map<string, { requests: number; bytes: number }>();
  for (const entry of snapshot.network.filter((item) => item.thirdParty)) {
    if (!entry.origin) continue;
    const current = thirdPartyMap.get(entry.origin) ?? { requests: 0, bytes: 0 };
    current.requests += 1;
    current.bytes += entry.bytes;
    thirdPartyMap.set(entry.origin, current);
  }

  return {
    score: performanceAvailable ? score : null,
    coverage: performanceAvailable ? 1 : 0,
    findings,
    section: {
      lab: {
        device: "mobile",
        viewport: { width: 390, height: 844 },
        throttling: "Simulated Slow 4G (1.6 Mbps, 150 ms RTT) · 4× CPU throttling",
        browser: snapshot.browserVersion,
        available: true,
        note: "Laboratory measurement in headless Chromium with synthetic throttling. Numbers vary between runs and are not real-user data.",
      },
      field: {
        available: false,
        note: "Real-user field data (Chrome UX Report) was not available for this origin during the analysis. Lab numbers are shown separately and are never presented as field data.",
      },
      metrics,
      resources: Array.from(groups.values()).sort((a, b) => b.bytes - a.bytes),
      totals,
      opportunities: findings,
      diagnostics: {
        renderBlocking: renderBlocking.map((item) => item.url),
        oversizedImages: oversized,
        thirdParty: Array.from(thirdPartyMap.entries())
          .map(([origin, value]) => ({ origin, ...value }))
          .sort((a, b) => b.bytes - a.bytes)
          .slice(0, 8),
        lcpElement: lab.lcpElement ?? undefined,
      },
    },
  };
}

function sum(entries: { type: string; bytes: number }[], type: string): number {
  return entries.filter((entry) => entry.type === type).reduce((total, entry) => total + entry.bytes, 0);
}

function estimateImageBytes(width: number, height: number): number {
  // Rough upper bound for a photographic JPEG/WebP at this resolution.
  return Math.round(width * height * 0.35);
}

export function computePerformanceScore(input: {
  lcp: number | null;
  tbt: number | null;
  cls: number | null;
  fcp: number | null;
  bytes: number | null;
  requests: number | null;
}): number {
  const parts: { score: number; weight: number }[] = [];
  if (input.lcp !== null) parts.push({ score: metricScore(input.lcp, 2500, 4000), weight: 0.26 });
  if (input.cls !== null) parts.push({ score: metricScore(input.cls, 0.1, 0.25), weight: 0.25 });
  if (input.tbt !== null) parts.push({ score: metricScore(input.tbt, 200, 600), weight: 0.21 });
  if (input.fcp !== null) parts.push({ score: metricScore(input.fcp, 1800, 3000), weight: 0.14 });
  if (input.bytes !== null) parts.push({ score: metricScore(input.bytes, 1_600_000, 4_000_000), weight: 0.09 });
  if (input.requests !== null) parts.push({ score: metricScore(input.requests, 50, 120), weight: 0.05 });

  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  if (!totalWeight) return 0;
  const weighted = parts.reduce((sum, part) => sum + part.score * part.weight, 0) / totalWeight;
  return Math.round(weighted);
}
