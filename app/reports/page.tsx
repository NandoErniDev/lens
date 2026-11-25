import type { Metadata } from "next";
import { ReportsBrowser } from "@/components/reports-browser";

export const metadata: Metadata = {
  title: "Saved reports",
  description: "Saved LENS reports on this instance, plus the analyses you ran in this browser.",
  robots: { index: false, follow: false },
};

export default function ReportsPage() {
  return (
    <div className="container" style={{ paddingTop: 48, paddingBottom: 40 }}>
      <header style={{ marginBottom: 28 }}>
        <p className="eyebrow">Archive</p>
        <h1 className="landing-title">Saved reports</h1>
        <p className="muted" style={{ marginTop: 10, maxWidth: "62ch", fontSize: 14.5 }}>
          Reports saved on this LENS instance, plus a local record of the analyses run in this browser. Select two
          reports of the same site to compare them.
        </p>
      </header>
      <ReportsBrowser />
    </div>
  );
}
