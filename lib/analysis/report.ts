/** Assembles the final report: category scores, findings, priority fixes and notes. */

import type {
  CategoryKey,
  CategoryScore,
  Coverage,
  Finding,
  PriorityFix,
  Report,
  Severity,
} from "@/lib/types";
import { buildCategoryScores, computeOverall, rankFindings, statusFor } from "./scoring";
import { plural } from "./findings";
import type { PageSnapshot } from "./collect";

export const ENGINE_VERSION = "1.0.0";

export interface ReportInput {
  id: string;
  requestedUrl: string;
  finalUrl: string;
  host: string;
  title: string;
  description: string | null;
  themeColor: string | null;
  createdAt: string;
  durationMs: number;
  status: Report["status"];
  coverage: Coverage;
  performance: Report["performance"];
  mobile: Report["mobile"];
  accessibility: Report["accessibility"];
  seo: Report["seo"];
  links: Report["links"];
  security: Report["security"];
  scores: {
    performance: { score: number | null; coverage: number };
    mobile: { score: number | null; coverage: number };
    accessibility: { score: number | null; coverage: number };
    seo: { score: number | null; coverage: number };
    links: { score: number | null; coverage: number };
    security: { score: number | null; coverage: number };
  };
  findings: Finding[];
  notes: string[];
  snapshot: PageSnapshot | null;
  linkTruncated: boolean;
}

const CATEGORY_SUMMARY: Record<CategoryKey, (score: number, findings: Finding[]) => string> = {
  performance: (score, findings) => {
    if (score >= 90) return "Lab metrics are within Google's good thresholds on a throttled mobile profile.";
    if (score >= 75) return "Fast overall, with some headroom in loading and main-thread work.";
    if (score >= 50) return `Noticeably slow on mobile: ${findings.length} performance issues reduce the score.`;
    return "Heavy and slow to render — the metrics indicate real friction for mobile visitors.";
  },
  mobile: (score) => {
    if (score >= 90) return "The layout holds up at mobile, tablet and desktop widths.";
    if (score >= 75) return "Responsive overall, with minor issues at smaller viewports.";
    if (score >= 50) return "Usable on mobile, but layout or target sizing causes friction.";
    return "The mobile experience has structural problems that affect real use.";
  },
  accessibility: (score, findings) => {
    if (score >= 90) return "No blocking accessibility issues were detected in this scan.";
    if (score >= 75) return `Mostly accessible, with ${plural(findings.length, "issue")} worth fixing.`;
    if (score >= 50) return "Several accessibility problems affect screen-reader and keyboard users.";
    return "Multiple critical accessibility barriers were detected.";
  },
  seo: (score) => {
    if (score >= 90) return "Metadata, crawlability and structure are well configured.";
    if (score >= 75) return "Good technical SEO baseline with a few gaps.";
    if (score >= 50) return "Essential signals are inconsistent or incomplete.";
    return "Core technical SEO signals are missing.";
  },
  links: (score, findings) => {
    if (score >= 95) return "All checked links and resources resolved.";
    if (score >= 80) return `Most links resolve, with ${plural(findings.length, "link issue")} found.`;
    if (score >= 50) return "A meaningful share of checked links do not resolve correctly.";
    return "Broken links are common on this page.";
  },
  security: (score) => {
    if (score >= 90) return "HTTPS and browser security headers are in place.";
    if (score >= 75) return "Solid transport security with some headers missing.";
    if (score >= 50) return "Basic HTTPS is in place, but hardening headers are incomplete.";
    return "Important transport or header protections are missing.";
  },
};

export function buildReport(input: ReportInput): Report {
  const categories = buildCategoryScores([
    {
      key: "performance",
      score: input.scores.performance.score,
      coverage: input.scores.performance.coverage,
      findings: input.findings.filter((item) => item.category === "performance"),
      summary: "",
    },
    {
      key: "mobile",
      score: input.scores.mobile.score,
      coverage: input.scores.mobile.coverage,
      findings: input.findings.filter((item) => item.category === "mobile"),
      summary: "",
    },
    {
      key: "accessibility",
      score: input.scores.accessibility.score,
      coverage: input.scores.accessibility.coverage,
      findings: input.findings.filter((item) => item.category === "accessibility"),
      summary: "",
    },
    {
      key: "seo",
      score: input.scores.seo.score,
      coverage: input.scores.seo.coverage,
      findings: input.findings.filter((item) => item.category === "seo"),
      summary: "",
    },
    {
      key: "links",
      score: input.scores.links.score,
      coverage: input.scores.links.coverage,
      findings: input.findings.filter((item) => item.category === "links"),
      summary: "",
    },
    {
      key: "security",
      score: input.scores.security.score,
      coverage: input.scores.security.coverage,
      findings: input.findings.filter((item) => item.category === "security"),
      summary: "",
    },
  ]).map((category) => ({
    ...category,
    summary:
      category.score === null
        ? "Not assessed for this URL."
        : CATEGORY_SUMMARY[category.key](
            category.score,
            input.findings.filter((item) => item.category === category.key),
          ),
  }));

  const overall = computeOverall(categories);
  const ranked = rankFindings(input.findings, categories);

  const priorityFixes: PriorityFix[] = ranked.slice(0, 5).map((item, index) => ({
    rank: index + 1,
    findingId: item.id,
    title: item.title,
    category: item.category,
    severity: item.severity,
    rationale: rationaleFor(item),
    estimatedImpact: impactFor(item.severity, item.category),
  }));

  const notes = [...input.notes];
  if (input.coverage.browser) {
    notes.push(
      "Lab performance was measured in headless Chromium with simulated Slow 4G and 4× CPU throttling on a 390 × 844 mobile viewport. Repeat runs vary by roughly 5–10%.",
    );
  } else if (!notes.some((note) => /browser/i.test(note))) {
    notes.push(
      "A browser session was not available for this URL, so performance, mobile rendering and contrast were not assessed. They are marked as not assessed rather than scored as failures.",
    );
  }
  if (!input.coverage.fieldData) {
    notes.push(
      "Real-user field data (Chrome UX Report) was not available, so all speed numbers in this report are laboratory measurements.",
    );
  }
  if (input.linkTruncated) {
    notes.push(
      "Link checking is sample-based: LENS checks a prioritised subset of links and resources from the analysed page instead of crawling the whole site.",
    );
  }
  notes.push(
    "Security checks are a non-invasive configuration overview. No exploitation, credential testing or vulnerability scanning is performed, and this report is not a security certification.",
  );

  return {
    id: input.id,
    version: 1,
    url: input.requestedUrl,
    finalUrl: input.finalUrl,
    origin: new URL(input.finalUrl).origin,
    host: input.host,
    title: input.title,
    description: input.description,
    favicon: null,
    themeColor: input.themeColor,
    createdAt: input.createdAt,
    durationMs: input.durationMs,
    status: input.status,
    coverage: input.coverage,
    overall,
    categories,
    performance: input.performance,
    mobile: input.mobile,
    accessibility: input.accessibility,
    seo: input.seo,
    links: input.links,
    security: input.security,
    findings: [...input.findings].sort(bySeverity),
    priorityFixes,
    notes,
    engine: {
      name: "LENS Engine",
      version: ENGINE_VERSION,
      method: "Headless Chromium measurement + static markup inspection + HTTP configuration checks",
    },
  };
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function bySeverity(a: Finding, b: Finding): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.title.localeCompare(b.title);
}

function rationaleFor(finding: Finding): string {
  switch (finding.category) {
    case "performance":
      return finding.severity === "critical"
        ? "Critical speed issues affect every visitor and usually have measurable, fixable causes."
        : "Improving this reduces load time and main-thread work on mobile devices.";
    case "mobile":
      return "Mobile traffic is often the majority, and layout problems there directly reduce usability.";
    case "accessibility":
      return "This blocks assistive-technology users and is typically a contained markup fix.";
    case "seo":
      return "Search visibility depends on these technical signals being complete and consistent.";
    case "links":
      return "Broken destinations waste visitor attention and crawler budget on every page load.";
    case "security":
      return "Missing browser protections widen the impact of any script injection or transport downgrade.";
    default:
      return "This issue was ranked by severity and confidence.";
  }
}

function impactFor(severity: Severity, category: CategoryKey): string {
  const map: Record<Severity, string> = {
    critical: "High — affects most visitors or blocks a core capability.",
    high: "High — measurable impact on experience or visibility.",
    medium: "Moderate — noticeable for a subset of visitors or crawlers.",
    low: "Low — polish and consistency rather than a functional problem.",
    info: "Informational — no direct user impact measured.",
  };
  if (category === "security" && severity === "high") return "High — closes a well-known browser attack surface.";
  return map[severity];
}

export function reportSummary(report: Report) {
  return {
    id: report.id,
    url: report.url,
    finalUrl: report.finalUrl,
    host: report.host,
    title: report.title,
    favicon: report.favicon,
    createdAt: report.createdAt,
    status: report.status,
    overallScore: report.overall.score,
    scores: Object.fromEntries(report.categories.map((category) => [category.key, category.score])),
    findingCount: report.findings.filter((item) => item.severity !== "info").length,
    criticalCount: report.findings.filter((item) => item.severity === "critical").length,
    coverage: report.coverage,
  };
}

export function statusLabel(score: number | null) {
  return statusFor(score);
}
