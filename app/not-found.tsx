import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="container" style={{ paddingTop: 96, paddingBottom: 96, maxWidth: 620 }}>
      <span className="pill"><span className="pill-dot" /></span>
      <div style={{ marginTop: 22, display: "flex", gap: 16, alignItems: "flex-start" }}>
        <SearchX size={26} style={{ color: "var(--text-tertiary)", marginTop: 3 }} />
        <div>
          <h1 style={{ fontSize: 28 }}>This report is not available</h1>
          <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>
            The link may be incomplete, or the report was created on another LENS instance. Reports are stored per
            instance, and analyses are never fabricated to fill a missing page.
          </p>
          <div className="row" style={{ gap: 10, marginTop: 22, flexWrap: "wrap" }}>
            <Link href="/" className="btn btn-primary">
              Analyze a website
            </Link>
            <Link href="/reports" className="btn">
              Browse saved reports
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
