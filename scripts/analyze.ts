/**
 * CLI harness for the analysis engine.
 * Usage: npx tsx scripts/analyze.ts https://example.com [--full]
 */

import { writeFile } from "node:fs/promises";
import { runAnalysis } from "../lib/analysis/orchestrator";
import { getReportStore } from "../lib/store/reports";
import type { Report } from "../lib/types";

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: tsx scripts/analyze.ts <url>");
    process.exit(1);
  }

  const started = Date.now();
  const report = await runAnalysis({
    input,
    onProgress: (event) => {
      console.log(`[${String(Math.round(event.progress * 100)).padStart(3)}%] ${event.stage.padEnd(12)} ${event.detail ?? ""}`);
    },
    budgetMs: 60_000,
  });

  const summary = {
    id: report.id,
    host: report.host,
    status: report.status,
    overall: report.overall.score,
    durationMs: Date.now() - started,
    coverage: report.coverage,
    categories: report.categories.map((category) => ({
      key: category.key,
      score: category.score,
      coverage: category.coverage,
      findings: category.findings,
    })),
    performance: report.performance.metrics.map((metric) => `${metric.shortLabel}=${metric.display} (${metric.rating})`),
    links: report.links.summary,
    findings: report.findings.map((finding) => `${finding.severity}: ${finding.title}`),
    priorityFixes: report.priorityFixes.map((fix) => `${fix.rank}. ${fix.title}`),
    notes: report.notes.length,
  };

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  const path = `/tmp/lens-report-${report.id}.json`;
  await writeFile(path, JSON.stringify(report, null, 2));
  const saved = await getReportStore().save(report);
  console.log(`\nfull report: ${path}`);
  console.log(`stored: ${saved} · report URL: /report/${report.id}`);

  if (process.argv.includes("--checks")) {
    printChecks(report);
  }
}

function printChecks(report: Report) {
  const groups: [string, { label: string; status: string; detail: string }[]][] = [
    ["SEO", report.seo.checks],
    ["Accessibility", report.accessibility.checks],
    ["Security", report.security.checks],
    ["Mobile", report.mobile.checks],
  ];
  for (const [name, checks] of groups) {
    console.log(`\n--- ${name} ---`);
    for (const check of checks) console.log(`${check.status.padEnd(11)} ${check.label}: ${check.detail}`);
  }
}

main().catch((error) => {
  console.error("analysis failed:", error);
  process.exit(1);
});
