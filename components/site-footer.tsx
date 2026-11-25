import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer no-print">
      <div className="container footer-inner">
        <div className="row" style={{ gap: 10 }}>
          <span className="brand-mark" aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 6 }} />
          <span>LENS · Website Intelligence &amp; Audit Platform</span>
        </div>
        <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
          <Link href="/methodology" className="nav-link" style={{ padding: 0 }}>
            Methodology
          </Link>
          <Link href="/reports" className="nav-link" style={{ padding: 0 }}>
            Saved reports
          </Link>
          <a href="https://github.com/NandoErniDev/lens" target="_blank" rel="noreferrer noopener" className="nav-link" style={{ padding: 0 }}>
            Source
          </a>
        </div>
        <p style={{ maxWidth: "58ch", lineHeight: 1.6 }}>
          LENS analyses publicly accessible pages only. Reports are technical assessments, not security certifications
          or complete judgments of a website&apos;s quality.
        </p>
      </div>
    </footer>
  );
}
