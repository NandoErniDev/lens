"use client";

import type { Report, ReportSummary } from "@/lib/types";

const KEY = "lens:reports";
const LIMIT = 40;

export function saveLocalSummary(report: Report): void {
  if (typeof window === "undefined") return;
  try {
    const existing = listLocalSummaries();
    const summary: ReportSummary = {
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
    const next = [summary, ...existing.filter((item) => item.id !== report.id)].slice(0, LIMIT);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or unavailable */
  }
}

export function listLocalSummaries(): ReportSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReportSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function removeLocalSummary(id: string): ReportSummary[] {
  const next = listLocalSummaries().filter((item) => item.id !== id);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
