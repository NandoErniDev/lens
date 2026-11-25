/** Accessibility checks derived from the rendered document. */

import type { AccessibilitySection, Check, Finding } from "@/lib/types";
import type { DomAudit } from "../audit-script";
import { finding, plural, scoreFromFindings } from "../findings";

export interface AccessibilityResult {
  section: AccessibilitySection;
  findings: Finding[];
  score: number | null;
  coverage: number;
  note?: string;
}

const A11Y_WEIGHTS: Record<string, number> = {
  critical: 25,
  high: 12,
  medium: 5,
  low: 2,
  info: 0,
};

export function buildAccessibility(audit: DomAudit, finalUrl: string, browserMeasured: boolean): AccessibilityResult {
  const findings: Finding[] = [];
  const checks: Check[] = [];

  const images = audit.images.filter((image) => image.role !== "presentation");
  const missingAlt = images.filter((image) => !image.hasAlt);
  if (images.length) {
    if (missingAlt.length) {
      findings.push(
        finding({
          category: "accessibility",
          severity: missingAlt.length / images.length > 0.3 ? "high" : "medium",
          title: `${plural(missingAlt.length, "image")} without alternative text`,
          detected: `${missingAlt.length} of ${images.length} images have no alt attribute at all.`,
          impact: "Screen-reader users hear the file name or nothing, and the image disappears from the content.",
          recommendation:
            "Add concise alt text for informative images and alt=\"\" for decorative ones. Use aria-hidden only when the image carries no meaning.",
          evidence: missingAlt.slice(0, 6).map((image) => image.src.split("/").pop() || image.src).join("\n"),
          samples: missingAlt.slice(0, 6).map((image) => image.src),
          target: finalUrl,
          measured: browserMeasured,
        }),
      );
      checks.push({
        id: "img-alt",
        label: "Image alternative text",
        status: "fail",
        detail: `${missingAlt.length}/${images.length} images missing alt`,
      });
    } else {
      checks.push({ id: "img-alt", label: "Image alternative text", status: "pass", detail: `All ${images.length} images have alt attributes` });
    }
  } else {
    checks.push({ id: "img-alt", label: "Image alternative text", status: "info", detail: "No images on this page" });
  }

  const fields = audit.fields;
  const unlabeled = fields.filter((field) => !field.hasLabel);
  if (fields.length) {
    if (unlabeled.length) {
      findings.push(
        finding({
          category: "accessibility",
          severity: "critical",
          title: `${plural(unlabeled.length, "form field")} without an accessible label`,
          detected: `${unlabeled.length} of ${fields.length} form controls have no <label>, aria-label or aria-labelledby.`,
          impact: "Screen-reader users cannot tell what the field expects, and dictation software cannot target it.",
          recommendation: "Associate every control with a visible <label for>, or provide aria-label when a visual label is impossible.",
          evidence: unlabeled.slice(0, 6).map((field) => `${field.tag}[type=${field.type}]${field.name ? ` name=${field.name}` : ""}`).join("\n"),
          target: finalUrl,
          measured: browserMeasured,
        }),
      );
      checks.push({ id: "form-labels", label: "Form labels", status: "fail", detail: `${unlabeled.length}/${fields.length} unlabelled` });
    } else {
      checks.push({ id: "form-labels", label: "Form labels", status: "pass", detail: `${fields.length} labelled controls` });
    }
  } else {
    checks.push({ id: "form-labels", label: "Form labels", status: "info", detail: "No form controls" });
  }

  const unnamed = audit.interactive.filter((element) => !element.name);
  if (unnamed.length) {
    findings.push(
      finding({
        category: "accessibility",
        severity: "high",
        title: `${plural(unnamed.length, "interactive element")} without an accessible name`,
        detected: `${unnamed.length} buttons or links expose no text, label or title to assistive technology.`,
        impact: "These controls are announced as “button” or “link” with no purpose, so they are unusable with a screen reader.",
        recommendation: "Give each control visible text, or an aria-label that describes the action. Decorative icon-only buttons still need a name.",
        evidence: unnamed.slice(0, 6).map((element) => element.html.slice(0, 80)).join("\n"),
        samples: unnamed.slice(0, 6).map((element) => element.html),
        target: finalUrl,
        measured: browserMeasured,
      }),
    );
    checks.push({ id: "names", label: "Accessible names", status: "fail", detail: `${unnamed.length} unnamed controls` });
  } else if (audit.interactive.length === 0) {
    checks.push({ id: "names", label: "Accessible names", status: "info", detail: "No interactive controls" });
  } else {
    checks.push({ id: "names", label: "Accessible names", status: "pass", detail: `${audit.interactive.length} controls named` });
  }

  if (audit.contrast.checked > 0) {
    const failures = audit.contrast.failures;
    if (failures.length) {
      findings.push(
        finding({
          category: "accessibility",
          severity: "high",
          title: "Insufficient text contrast",
          detected: `${failures.length} sampled text elements fall below the WCAG AA contrast ratio (4.5:1 for body text, 3:1 for large text).`,
          impact: "Low-contrast text is hard to read for everyone and unreadable for users with low vision or in bright light.",
          recommendation: "Darken the text or lighten the background until the ratio reaches at least 4.5:1; verify with a contrast checker.",
          evidence: failures
            .slice(0, 5)
            .map((item) => `“${item.text}” — ${item.ratio}:1 (${item.color} on ${item.background}, ${item.size}px)`)
            .join("\n"),
          samples: failures.slice(0, 5).map((item) => `“${item.text}” ${item.ratio}:1`),
          target: finalUrl,
          measured: true,
        }),
      );
      checks.push({
        id: "contrast",
        label: "Colour contrast",
        status: "fail",
        detail: `${failures.length} of ${audit.contrast.checked} sampled elements below AA`,
      });
    } else {
      checks.push({ id: "contrast", label: "Colour contrast", status: "pass", detail: `${audit.contrast.checked} text elements sampled` });
    }
  } else {
    checks.push({
      id: "contrast",
      label: "Colour contrast",
      status: "unavailable",
      detail: "Contrast needs a rendered page with computed styles",
    });
  }

  if (!audit.lang) {
    findings.push(
      finding({
        category: "accessibility",
        severity: "high",
        title: "Page language is not declared",
        detected: "The <html> element has no lang attribute.",
        impact: "Screen readers may read the page with the wrong pronunciation rules.",
        recommendation: "Add an ISO 639 language tag, for example <html lang=\"en\">.",
        target: finalUrl,
      }),
    );
    checks.push({ id: "lang", label: "Language declared", status: "fail", detail: "No lang attribute" });
  } else {
    checks.push({ id: "lang", label: "Language declared", status: "pass", detail: `lang="${audit.lang}"` });
  }

  if (audit.headingJumps.length) {
    findings.push(
      finding({
        category: "accessibility",
        severity: "low",
        title: `${plural(audit.headingJumps.length, "heading level jump")}`,
        detected: "Heading levels skip (for example H2 followed by H4), which breaks the document outline.",
        impact: "Screen-reader users navigating by heading lose the sense of structure.",
        recommendation: "Use heading levels in order, styling with CSS instead of choosing a heading for its size.",
        evidence: audit.headingJumps.slice(0, 5).map((jump) => `H${jump.from} → H${jump.to}: ${jump.text}`).join("\n"),
        target: finalUrl,
      }),
    );
    checks.push({ id: "headings", label: "Heading hierarchy", status: "warn", detail: `${audit.headingJumps.length} skipped levels` });
  } else if (audit.headings.length === 0) {
    checks.push({ id: "headings", label: "Heading hierarchy", status: "info", detail: "No headings on this page" });
  } else {
    checks.push({ id: "headings", label: "Heading hierarchy", status: "pass", detail: `${audit.headings.length} headings in order` });
  }

  if (audit.landmarks.main === 0) {
    findings.push(
      finding({
        category: "accessibility",
        severity: "medium",
        title: "No main landmark",
        detected: "The page has no <main> element or role=\"main\".",
        impact: "Keyboard and screen-reader users cannot jump straight to the primary content.",
        recommendation: "Wrap the primary content in <main> and keep navigation inside <nav>.",
        target: finalUrl,
      }),
    );
    checks.push({ id: "landmarks", label: "Landmarks", status: "warn", detail: "No main landmark" });
  } else {
    checks.push({ id: "landmarks", label: "Landmarks", status: "pass", detail: `${audit.landmarks.nav} nav · main · ${audit.landmarks.footer} footer` });
  }

  const ariaHiddenFocusable = audit.ariaIssues.filter((issue) => issue.kind === "aria-hidden-focusable");
  const invalidRoles = audit.ariaIssues.filter((issue) => issue.kind === "invalid-role");
  if (ariaHiddenFocusable.length) {
    findings.push(
      finding({
        category: "accessibility",
        severity: "medium",
        title: "Focusable elements hidden from assistive technology",
        detected: "An element with aria-hidden=\"true\" contains focusable controls.",
        impact: "Keyboard users can reach controls that screen readers are told to ignore, causing disorientation.",
        recommendation: "Remove aria-hidden from containers with interactive children, or make those children inert.",
        evidence: ariaHiddenFocusable.slice(0, 4).map((issue) => issue.detail).join("\n"),
        target: finalUrl,
        measured: browserMeasured,
      }),
    );
  }
  if (invalidRoles.length) {
    findings.push(
      finding({
        category: "accessibility",
        severity: "low",
        title: `${plural(invalidRoles.length, "invalid ARIA role")}`,
        detected: "Roles were found that are not part of the ARIA specification.",
        impact: "Unknown roles are ignored, so the intended semantics are lost.",
        recommendation: "Use a valid ARIA role or, preferably, the native HTML element.",
        evidence: invalidRoles.slice(0, 4).map((issue) => issue.detail).join("\n"),
        target: finalUrl,
      }),
    );
  }
  checks.push({
    id: "aria",
    label: "ARIA usage",
    status: ariaHiddenFocusable.length || invalidRoles.length ? "warn" : "pass",
    detail: ariaHiddenFocusable.length || invalidRoles.length ? `${audit.ariaIssues.length} issue(s) detected` : "No misuse detected",
  });

  if (audit.duplicates.ids.length) {
    findings.push(
      finding({
        category: "accessibility",
        severity: "low",
        title: "Duplicate element IDs",
        detected: `Duplicate id attributes were found: ${audit.duplicates.ids.slice(0, 4).join(", ")}.`,
        impact: "Label associations and fragment links can resolve to the wrong element.",
        recommendation: "Make every id unique on the page.",
        target: finalUrl,
      }),
    );
  }

  if (audit.iframes.withoutTitle > 0) {
    findings.push(
      finding({
        category: "accessibility",
        severity: "medium",
        title: `${plural(audit.iframes.withoutTitle, "iframe")} without a title`,
        detected: "Embedded frames have no title attribute.",
        impact: "Screen-reader users cannot tell what the frame contains before entering it.",
        recommendation: "Add a descriptive title to every iframe.",
        target: finalUrl,
      }),
    );
  }

  if (audit.videos.withoutCaptions > 0) {
    findings.push(
      finding({
        category: "accessibility",
        severity: "medium",
        title: `${plural(audit.videos.withoutCaptions, "video")} without captions`,
        detected: "Video elements have no caption or subtitle track.",
        impact: "Deaf and hard-of-hearing users cannot access the audio content.",
        recommendation: "Add a <track kind=\"captions\"> with a WebVTT file for each video.",
        target: finalUrl,
      }),
    );
  }

  if (audit.focus.positiveTabIndex > 0) {
    findings.push(
      finding({
        category: "accessibility",
        severity: "low",
        title: "Positive tabindex values",
        detected: `${plural(audit.focus.positiveTabIndex, "element")} use a positive tabindex.`,
        impact: "Positive tabindex overrides natural document order and usually creates a confusing focus sequence.",
        recommendation: "Use tabindex=\"0\" only for custom controls and rely on DOM order for sequencing.",
        target: finalUrl,
      }),
    );
  }

  if (!audit.hasSkipLink && audit.links.length > 12) {
    findings.push(
      finding({
        category: "accessibility",
        severity: "low",
        title: "No skip-to-content link",
        detected: "The page has many navigation links but no skip link.",
        impact: "Keyboard users must tab through the whole navigation on every page.",
        recommendation: "Add a visually hidden “Skip to content” link as the first focusable element.",
        target: finalUrl,
      }),
    );
  }

  const score = scoreFromFindings(
    findings.filter((item) => item.severity !== "info"),
    { floor: 10, severityWeights: A11Y_WEIGHTS },
  );

  const coverage = audit.contrast.checked > 0 ? 1 : 0.75;

  return {
    score,
    coverage,
    findings,
    note: browserMeasured
      ? undefined
      : "Static markup inspection only: contrast, focus order and rendered touch targets could not be measured without a browser.",
    section: {
      available: true,
      checks,
      counts: {
        images: images.length,
        imagesMissingAlt: missingAlt.length,
        formFields: fields.length,
        unlabeledFields: unlabeled.length,
        headings: audit.headings.length,
        headingJumps: audit.headingJumps.length,
        contrastSamples: audit.contrast.checked,
        contrastFailures: audit.contrast.failures.length,
        unnamedInteractive: unnamed.length,
        landmarks: audit.landmarks.nav + audit.landmarks.main + audit.landmarks.header + audit.landmarks.footer,
      },
    },
  };
}
