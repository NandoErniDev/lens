"use client";

import { useState } from "react";
import { Check, Copy, Link2, Printer } from "lucide-react";
import type { Report } from "@/lib/types";
import { buildPortableLink } from "@/lib/share";

export function ReportActions({
  report,
  shareable,
  portable = false,
}: {
  report: Report;
  shareable: boolean;
  portable?: boolean;
}) {
  const [copied, setCopied] = useState<"link" | "summary" | null>(null);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const copy = async (kind: "link" | "summary") => {
    if (kind === "summary") {
      const ok = await copyText(buildSummary(report));
      if (ok) {
        setCopied("summary");
        setTimeout(() => setCopied(null), 1800);
      }
      return;
    }

    if (shareable) {
      const ok = await copyText(`${window.location.origin}/report/${report.id}`);
      if (ok) {
        setCopied("link");
        setTimeout(() => setCopied(null), 1800);
      }
      return;
    }

    setBusy(true);
    setWarning(null);
    try {
      const { url, tooLong } = await buildPortableLink(report);
      const ok = await copyText(url);
      if (ok) {
        setCopied("link");
        setTimeout(() => setCopied(null), 1800);
      }
      if (tooLong) {
        setWarning("This report is large, so the portable link is long. Shorten or share the PDF instead.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="report-actions no-print">
      <button type="button" className="btn btn-sm" onClick={() => void copy("link")} disabled={busy}>
        {copied === "link" ? <Check size={13} /> : <Link2 size={13} />}
        {copied === "link" ? "Link copied" : busy ? "Building link…" : portable ? "Copy portable link" : shareable ? "Copy link" : "Copy portable link"}
      </button>
      <button type="button" className="btn btn-sm" onClick={() => void copy("summary")}>
        {copied === "summary" ? <Check size={13} /> : <Copy size={13} />}
        {copied === "summary" ? "Copied" : "Copy summary"}
      </button>
      <button type="button" className="btn btn-sm" onClick={() => window.print()}>
        <Printer size={13} />
        Export PDF
      </button>
      {warning && (
        <span className="dim" style={{ fontSize: 11.5, alignSelf: "center" }}>{warning}</span>
      )}
    </div>
  );
}

export function buildSummary(report: Report): string {
  const lines = [
    `LENS report — ${report.host}`,
    report.finalUrl,
    `Overall ${report.overall.score ?? "n/a"}/100 · analysed ${new Date(report.createdAt).toLocaleString()}`,
    "",
    ...report.categories.map(
      (category) => `${category.label}: ${category.score ?? "not assessed"}${category.score === null ? "" : "/100"} — ${category.summary}`,
    ),
    "",
    `Findings: ${report.findings.filter((item) => item.severity !== "info").length} (${report.findings.filter((item) => item.severity === "critical").length} critical)`,
    "",
    "Priority fixes:",
    ...report.priorityFixes.map((fix) => `${fix.rank}. ${fix.title} (${fix.severity})`),
    "",
    `Full report: ${typeof window !== "undefined" ? window.location.href : ""}`,
  ];
  return lines.join("\n");
}
