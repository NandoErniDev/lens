/** Mobile / responsive checks based on rendered viewports. */

import type { Check, Finding, MobileSection, ViewportResult } from "@/lib/types";
import type { ViewportCapture } from "../collect";
import { finding, plural } from "../findings";

export interface MobileResult {
  section: MobileSection;
  findings: Finding[];
  score: number | null;
  coverage: number;
}

export function buildMobile(captures: ViewportCapture[], finalUrl: string, browserAvailable: boolean): MobileResult {
  const findings: Finding[] = [];
  const checks: Check[] = [];

  if (!browserAvailable || captures.length === 0) {
    return {
      score: null,
      coverage: 0,
      findings: [],
      section: {
        available: false,
        note: "Rendering at real viewport sizes requires a browser session, which was not possible for this URL. LENS does not infer responsiveness from static markup, so this category is reported as not assessed.",
        viewportMeta: null,
        checks: [],
        viewports: [],
        findings: [],
      },
    };
  }

  const mobile = captures.find((capture) => capture.id === "mobile");
  const audit = mobile?.audit ?? null;
  const viewportMeta = audit?.meta.viewport ?? null;

  if (!viewportMeta) {
    findings.push(
      finding({
        category: "mobile",
        severity: "critical",
        title: "No viewport meta tag",
        detected: "The document does not declare a viewport.",
        impact: "Mobile browsers use a 980 px virtual viewport and zoom out, so text is tiny and taps are unreliable.",
        recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
        target: finalUrl,
        measured: true,
      }),
    );
    checks.push({ id: "viewport-meta", label: "Viewport meta", status: "fail", detail: "Missing" });
  } else if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/i.test(viewportMeta)) {
    findings.push(
      finding({
        category: "mobile",
        severity: "medium",
        title: "Zoom is disabled for mobile users",
        detected: `The viewport meta tag is “${viewportMeta}”.`,
        impact: "Users who need to enlarge content cannot pinch-zoom, an accessibility barrier recognised by WCAG 1.4.4.",
        recommendation: "Remove user-scalable=no and maximum-scale constraints.",
        evidence: viewportMeta,
        target: finalUrl,
        measured: true,
      }),
    );
    checks.push({ id: "viewport-meta", label: "Viewport meta", status: "warn", detail: "Zoom disabled" });
  } else {
    checks.push({ id: "viewport-meta", label: "Viewport meta", status: "pass", detail: viewportMeta });
  }

  const viewports: ViewportResult[] = captures.map((capture) => {
    const captureAudit = capture.audit;
    const overflow = captureAudit
      ? { scrollWidth: captureAudit.overflow.scrollWidth, clientWidth: captureAudit.overflow.clientWidth, overflowing: captureAudit.overflow.elements.length }
      : null;
    const viewportChecks: Check[] = [];

    if (captureAudit) {
      const horizontal = captureAudit.overflow.scrollWidth > captureAudit.overflow.clientWidth + 2;
      viewportChecks.push({
        id: "overflow",
        label: "Horizontal overflow",
        status: horizontal ? "fail" : "pass",
        detail: horizontal
          ? `Content is ${captureAudit.overflow.scrollWidth - captureAudit.overflow.clientWidth}px wider than the viewport`
          : "Content fits the viewport",
      });
      viewportChecks.push({
        id: "targets",
        label: "Touch targets",
        status: captureAudit.tapTargets.small.length ? "warn" : "pass",
        detail: captureAudit.tapTargets.small.length
          ? `${captureAudit.tapTargets.small.length} of ${captureAudit.tapTargets.checked} under 24px`
          : `${captureAudit.tapTargets.checked} targets checked`,
      });
      viewportChecks.push({
        id: "text-size",
        label: "Text size",
        status: captureAudit.smallText.count > 20 ? "warn" : "pass",
        detail: captureAudit.smallText.count ? `${captureAudit.smallText.count} elements below 12px` : "No text below 12px",
      });
    }

    return {
      id: capture.id,
      label: capture.label,
      width: capture.width,
      height: capture.height,
      deviceScaleFactor: capture.deviceScaleFactor,
      screenshot: capture.screenshot,
      screenshotNote: capture.screenshotNote,
      checks: viewportChecks,
      overflow,
      smallText: captureAudit?.smallText.count ?? null,
      smallTargets: captureAudit?.tapTargets.small.length ?? null,
      rendered: Boolean(captureAudit),
    };
  });

  const overflowingMobile = mobile?.audit ? mobile.audit.overflow.scrollWidth > mobile.audit.overflow.clientWidth + 2 : false;
  const overflowingTablet = captures.find((c) => c.id === "tablet")?.audit;
  const tabletOverflow = overflowingTablet ? overflowingTablet.overflow.scrollWidth > overflowingTablet.overflow.clientWidth + 2 : false;

  if (overflowingMobile) {
    const details = mobile?.audit?.overflow.elements ?? [];
    findings.push(
      finding({
        category: "mobile",
        severity: "high",
        title: "Horizontal scrolling on mobile",
        detected: `At a 390 px viewport the document is ${mobile?.audit?.overflow.scrollWidth} px wide, forcing sideways scrolling.`,
        impact: "Users must pan to read content, and fixed-width sections look broken on smaller phones.",
        recommendation:
          "Find the overflowing elements and make them fluid: max-width: 100%, box-sizing: border-box, and no fixed pixel widths above the viewport.",
        evidence: details.map((item) => `${item.tag} — ${item.width}px`).join("\n") || undefined,
        samples: details.map((item) => `${item.tag} ${item.width}px`),
        target: finalUrl,
        measured: true,
      }),
    );
  }
  checks.push({
    id: "overflow-390",
    label: "Layout at 390 px",
    status: overflowingMobile ? "fail" : "pass",
    detail: overflowingMobile ? "Horizontal overflow detected" : "Fits without horizontal scrolling",
  });
  checks.push({
    id: "overflow-834",
    label: "Layout at 834 px",
    status: tabletOverflow ? "warn" : "pass",
    detail: tabletOverflow ? "Horizontal overflow detected" : "Fits without horizontal scrolling",
  });

  const smallTargets = mobile?.audit?.tapTargets.small ?? [];
  if (smallTargets.length > 3) {
    findings.push(
      finding({
        category: "mobile",
        severity: "medium",
        title: `${plural(smallTargets.length, "touch target")} smaller than 24 px`,
        detected: `${smallTargets.length} interactive elements on the mobile viewport are under the 24 × 24 px minimum (WCAG 2.2 AA).`,
        impact: "Small targets cause mis-taps, especially for users with limited dexterity.",
        recommendation: "Increase padding on links, buttons and icon controls so each target is at least 44 × 44 px.",
        evidence: smallTargets.slice(0, 6).map((item) => `${item.tag} — ${item.width}×${item.height}px`).join("\n"),
        samples: smallTargets.slice(0, 6).map((item) => `${item.tag} ${item.width}×${item.height}`),
        target: finalUrl,
        measured: true,
      }),
    );
    checks.push({ id: "tap-targets", label: "Touch targets", status: "warn", detail: `${smallTargets.length} below 24px` });
  } else {
    checks.push({ id: "tap-targets", label: "Touch targets", status: "pass", detail: `${mobile?.audit?.tapTargets.checked ?? 0} controls checked` });
  }

  const smallText = mobile?.audit?.smallText.count ?? 0;
  if (smallText > 20) {
    findings.push(
      finding({
        category: "mobile",
        severity: "medium",
        title: "Body text renders below 12 px on mobile",
        detected: `${smallText} text elements use a font size under 12 px at a 390 px viewport.`,
        impact: "Small text is hard to read on phones without zooming.",
        recommendation: "Set a minimum body size of 16 px and keep secondary text at 13–14 px.",
        evidence: (mobile?.audit?.smallText.sample ?? []).join("\n") || undefined,
        target: finalUrl,
        measured: true,
      }),
    );
    checks.push({ id: "text-size", label: "Text size", status: "warn", detail: `${smallText} elements below 12px` });
  } else {
    checks.push({ id: "text-size", label: "Text size", status: "pass", detail: "Readable default sizes" });
  }

  const screenshots = viewports.filter((viewport) => viewport.screenshot).length;
  checks.push({
    id: "screenshots",
    label: "Viewport renders",
    status: screenshots === viewports.length ? "pass" : "warn",
    detail: `${screenshots}/${viewports.length} viewports captured`,
  });

  if (!screenshots) {
    findings.push(
      finding({
        category: "mobile",
        severity: "info",
        title: "Screenshots could not be captured",
        detected: "The page rendered, but the browser could not capture screenshots for this site.",
        impact: "Visual evidence is unavailable, so the responsive assessment relies on layout measurements only.",
        recommendation: "Re-run the analysis; if it persists, the site may block headless browsers.",
        target: finalUrl,
        measured: true,
      }),
    );
  }

  let score = 100;
  if (!viewportMeta) score -= 32;
  if (overflowingMobile) score -= 24;
  if (tabletOverflow) score -= 8;
  score -= Math.min(14, Math.ceil(smallTargets.length / 2));
  if (smallText > 20) score -= 10;
  if (viewportMeta && /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/i.test(viewportMeta)) score -= 8;

  return {
    score: Math.max(8, Math.min(100, Math.round(score))),
    coverage: 1,
    findings,
    section: {
      available: true,
      viewportMeta,
      checks,
      viewports,
      findings,
      note: "Responsive behaviour was measured by rendering this page in Chromium at 390 × 844, 834 × 1112 and 1440 × 900 CSS pixels.",
    },
  };
}
