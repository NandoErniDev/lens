/** Transparent scoring: category scores, status labels and the overall LENS score. */

import type { CategoryKey, CategoryScore, Finding, Severity, StatusLabel } from "@/lib/types";
import { SEVERITY_ORDER } from "@/lib/types";
import { countSeverities } from "./findings";

export const CATEGORY_WEIGHTS: Record<CategoryKey, number> = {
  performance: 0.26,
  accessibility: 0.2,
  seo: 0.19,
  mobile: 0.16,
  links: 0.1,
  security: 0.09,
};

export const CATEGORY_ORDER: CategoryKey[] = ["performance", "mobile", "accessibility", "seo", "links", "security"];

export const CATEGORY_NAMES: Record<CategoryKey, string> = {
  performance: "Performance",
  mobile: "Mobile",
  accessibility: "Accessibility",
  seo: "SEO",
  links: "Links",
  security: "Security",
};

export function statusFor(score: number | null): StatusLabel {
  if (score === null) return "unavailable";
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "needs-improvement";
  return "poor";
}

export const STATUS_TEXT: Record<StatusLabel, string> = {
  excellent: "Excellent",
  good: "Good",
  "needs-improvement": "Needs improvement",
  poor: "Poor",
  unavailable: "Not assessed",
};

export interface CategoryInput {
  key: CategoryKey;
  score: number | null;
  coverage: number;
  summary: string;
  findings: Finding[];
}

export function buildCategoryScores(inputs: CategoryInput[]): CategoryScore[] {
  return CATEGORY_ORDER.map((key) => {
    const input = inputs.find((item) => item.key === key);
    const score = input?.score ?? null;
    const counts = countSeverities(input?.findings ?? []);
    const relevant = (input?.findings ?? []).filter((item) => item.severity !== "info");
    return {
      key,
      label: CATEGORY_NAMES[key],
      score,
      status: statusFor(score),
      summary: input?.summary ?? "Not assessed.",
      coverage: input?.coverage ?? 0,
      findings: relevant.length,
      counts,
      weight: CATEGORY_WEIGHTS[key],
    };
  });
}

export interface OverallScore {
  score: number | null;
  status: StatusLabel;
  summary: string;
  assessedCategories: number;
}

export function computeOverall(categories: CategoryScore[]): OverallScore {
  const assessed = categories.filter((category) => category.score !== null);
  if (!assessed.length) {
    return {
      score: null,
      status: "unavailable",
      summary: "No category could be assessed for this URL.",
      assessedCategories: 0,
    };
  }

  const totalWeight = assessed.reduce((sum, category) => sum + category.weight, 0);
  const weighted = assessed.reduce((sum, category) => sum + (category.score ?? 0) * category.weight, 0) / totalWeight;
  const score = Math.round(weighted);

  const weakest = [...assessed].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
  const strongest = [...assessed].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

  const coverageNote = assessed.length < 6 ? ` Based on ${assessed.length} of 6 categories, so this score is partial.` : "";
  const summary =
    assessed.length < 3
      ? `${weakest.label} is the weakest area at ${weakest.score}/100.${coverageNote}`
      : `${strongest.label} is the strongest area at ${strongest.score}/100 and ${weakest.label} the weakest at ${weakest.score}/100.${coverageNote} This is a technical assessment of a single page, not a complete judgment of the website.`;

  return { score, status: statusFor(score), summary, assessedCategories: assessed.length };
}

/** Rank findings by likely impact: severity × category weight × confidence. */
export function rankFindings(findings: Finding[], categories: CategoryScore[]): (Finding & { impactScore: number })[] {
  const weightOf = new Map(categories.map((category) => [category.key, category.weight]));
  return [...findings]
    .filter((item) => item.severity !== "info")
    .map((item) => {
      const severityWeight: Record<Severity, number> = { critical: 100, high: 55, medium: 22, low: 8, info: 0 };
      const base = severityWeight[item.severity] * (weightOf.get(item.category) ?? 0.1) * 5;
      const confidence = item.measured ? 1.15 : 0.9;
      return { ...item, impactScore: base * confidence };
    })
    .sort((a, b) => b.impactScore - a.impactScore);
}

export function severityTotals(findings: Finding[]): Record<Severity, number> {
  const totals: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const item of findings) totals[item.severity] += 1;
  return totals;
}

export function sortedSeverities(): Severity[] {
  return SEVERITY_ORDER;
}
