"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { Report } from "@/lib/types";
import { ReportView } from "./report-view";
import { getLocalReport } from "@/lib/local-reports";

/**
 * Renders a report stored in this browser's archive.
 *
 * Used when the deployment has no durable server-side store, so a report link
 * resolves against the archive of the browser that ran the analysis instead of
 * failing with a 404.
 */
export function LocalReportLoader({ id }: { id: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    void getLocalReport(id).then((stored) => {
      if (!active) return;
      if (stored) setReport(stored);
      else setMissing(true);
    });
    return () => {
      active = false;
    };
  }, [id]);

  if (missing) {
    return (
      <div className="container" style={{ paddingTop: 80, maxWidth: 620 }}>
        <h1 style={{ fontSize: 24 }}>This analysis is not stored in this browser</h1>
        <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>
          This LENS instance has no server-side store configured, so reports live in the browser that created them.
          Run the analysis again to create a new report.
        </p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: 20 }}>
          <ArrowLeft size={14} />
          Analyze a website
        </Link>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="container" style={{ paddingTop: 80 }}>
        <p className="row" style={{ gap: 8, color: "var(--text-secondary)" }}>
          <Loader2 size={14} className="spin" />
          Loading saved report…
        </p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="note no-print" style={{ marginTop: 22 }}>
        <span>
          Stored in this browser. Share it with <strong style={{ color: "var(--text)" }}>Copy portable link</strong> to
          send the report itself, or export a PDF.
        </span>
      </div>
      <ReportView report={report} shareable={false} portable />
    </div>
  );
}
