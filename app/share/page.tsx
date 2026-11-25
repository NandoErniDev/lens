"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import type { Report } from "@/lib/types";
import { ReportView } from "@/components/report-view";
import { decodeReport } from "@/lib/share";

export default function SharedReportPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const token = window.location.hash.replace(/^#/, "");
    if (!token) {
      setState("error");
      return;
    }
    void decodeReport(token).then((decoded) => {
      if (decoded) {
        setReport(decoded);
        setState("ready");
      } else {
        setState("error");
      }
    });
  }, []);

  if (state === "loading") {
    return (
      <div className="container" style={{ paddingTop: 80, maxWidth: 620 }}>
        <p className="eyebrow">Opening report</p>
        <p className="muted" style={{ marginTop: 10 }}>Decoding the portable report from this link…</p>
      </div>
    );
  }

  if (state === "error" || !report) {
    return (
      <div className="container" style={{ paddingTop: 80, maxWidth: 620 }}>
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <TriangleAlert size={22} style={{ color: "var(--warn)", marginTop: 2 }} />
          <div>
            <h1 style={{ fontSize: 24 }}>This link could not be decoded</h1>
            <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>
              Portable links carry the report inside the URL. If the link was truncated by a chat app or email client,
              the payload is incomplete. Ask the sender for the full link, or run the analysis again.
            </p>
            <div className="row" style={{ gap: 10, marginTop: 20 }}>
              <Link href="/" className="btn btn-primary">
                <ArrowLeft size={14} />
                Analyze a website
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="note no-print" style={{ marginTop: 22 }}>
        <span>
          Portable report — this page carries its own data and was not read from a server. Screenshots are omitted from
          portable links.
        </span>
      </div>
      <ReportView report={report} shareable={false} portable />
    </div>
  );
}
