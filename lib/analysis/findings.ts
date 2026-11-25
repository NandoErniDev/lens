/** Helpers for building findings and severity accounting. */

import type { CategoryKey, Finding, Severity } from "@/lib/types";

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 22,
  high: 10,
  medium: 4,
  low: 1.5,
  info: 0,
};

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

let counter = 0;

export function finding(input: Omit<Finding, "id">): Finding {
  counter += 1;
  const slug = input.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return { id: `${input.category}-${slug}-${counter}`, ...input };
}

export function emptySeverityCounts(): Record<Severity, number> {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

export function countSeverities(findings: Finding[]): Record<Severity, number> {
  const counts = emptySeverityCounts();
  for (const item of findings) counts[item.severity] += 1;
  return counts;
}

export function scoreFromFindings(
  findings: Finding[],
  options: { floor?: number; severityWeights?: Partial<Record<Severity, number>> } = {},
): number {
  const weights = { ...SEVERITY_WEIGHT, ...options.severityWeights };
  const penalty = findings.reduce((sum, item) => sum + (weights[item.severity] ?? 0), 0);
  const score = 100 - penalty;
  return Math.max(options.floor ?? 5, Math.min(100, Math.round(score)));
}

export function categoryFindings(findings: Finding[], category: CategoryKey): Finding[] {
  return findings.filter((item) => item.category === category);
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

export function percent(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}
