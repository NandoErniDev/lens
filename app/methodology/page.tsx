import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How LENS measures, scores and reports on a website: measurement sources, category formulas, weighting and the limits of a single-page audit.",
};

const WEIGHTS: { category: string; weight: string; basis: string }[] = [
  { category: "Performance", weight: "26%", basis: "Lab metric curves for LCP, CLS, TBT, FCP, transfer size and request count." },
  { category: "Accessibility", weight: "20%", basis: "Severity-weighted findings across alt text, labels, contrast, names, landmarks and ARIA." },
  { category: "SEO", weight: "19%", basis: "Weighted pass/partial/fail over eleven technical signals." },
  { category: "Mobile", weight: "16%", basis: "Viewport declaration, measured overflow, touch target and text-size checks at three widths." },
  { category: "Links", weight: "10%", basis: "Share of checked links and resources that resolved, weighted toward internal links." },
  { category: "Security", weight: "9%", basis: "Transport security plus the presence of hardened response headers." },
];

const CATEGORY_FORMULAS: { title: string; body: string[] }[] = [
  {
    title: "Performance",
    body: [
      "Each metric is scored on a curve: at or below Google's “good” threshold it scores 100; at the “poor” threshold it scores 50; beyond that it decays toward 0 at roughly three times the poor value.",
      "Weights: LCP 26%, CLS 25%, TBT 21%, FCP 14%, transfer size 9%, request count 5%. Weights are renormalised over the metrics that were actually measured.",
      "The score reflects measured speed only. Opportunities such as oversized images and render-blocking resources are reported as findings; they are not double-counted into the score.",
    ],
  },
  {
    title: "Accessibility",
    body: [
      "Starts at 100 and subtracts for each finding: critical −25, high −12, medium −5, low −2, with a floor of 10.",
      "Contrast is measured from computed styles against the nearest opaque ancestor background using WCAG relative luminance. It is sampled, not exhaustive.",
      "When no browser session is possible, contrast, focus order and rendered target sizes are reported as not assessed and the category coverage is marked as partial.",
    ],
  },
  {
    title: "SEO",
    body: [
      "Eleven signals are weighted: indexability (14), title (14), meta description (10), H1 (10), sitemap (10), canonical (6), Open Graph (6), structured data (6), robots.txt (6), image alt coverage (6), internal linking (6).",
      "A passing check earns full weight, a partial check earns 45%, a failing check earns nothing. The total is normalised to 100.",
      "A noindex directive or a 4xx/5xx main document caps the category at 35, because ranking is impossible in that state.",
    ],
  },
  {
    title: "Mobile",
    body: [
      "Rendering is measured at 390 × 844, 834 × 1112 and 1440 × 900 CSS pixels: overflow width, tap targets under 24 px, and text rendered below 12 px.",
      "Deductions: missing viewport meta −32, horizontal overflow at 390 px −24, at 834 px −8, zoom disabled −8, plus up to −14 for undersized targets and −10 for small text.",
      "No conclusion about responsiveness is drawn from static markup alone. If rendering fails, the category is reported as not assessed.",
    ],
  },
  {
    title: "Links",
    body: [
      "LENS checks a prioritised sample of up to 60 links and resources found on the analysed page — it does not crawl the site.",
      "Score is the weighted share of internal (×3) and external (×1) destinations that resolved. Blocked responses (401/403/429) are treated as inconclusive instead of broken, so anti-bot protection does not create false failures.",
      "Redirect chains of two or more hops and detected loops are reported separately.",
    ],
  },
  {
    title: "Security",
    body: [
      "Starts at 100 and subtracts fixed weights for missing headers: CSP −20, HSTS −15, X-Content-Type-Options −10, Referrer-Policy −10, Permissions-Policy −8, X-Frame-Options −7.",
      "Transport problems subtract further: no HTTPS −30, missing HTTP→HTTPS redirect −8, mixed content −15, invalid certificate −20.",
      "This is a configuration overview. LENS performs no exploitation, no credential testing and no intrusive scanning, and the result is not a security certification.",
    ],
  },
];

export default function MethodologyPage() {
  return (
    <div className="container" style={{ paddingTop: 48, paddingBottom: 40, maxWidth: 900 }}>
      <Link href="/" className="nav-link" style={{ padding: 0, display: "inline-flex", gap: 6, alignItems: "center" }}>
        <ArrowLeft size={14} />
        Back to LENS
      </Link>

      <header style={{ marginTop: 26 }}>
        <p className="eyebrow">Methodology</p>
        <h1 className="landing-title" style={{ fontSize: "clamp(32px, 4vw, 44px)", marginTop: 10 }}>
          How the score is calculated
        </h1>
        <p className="muted" style={{ marginTop: 14, maxWidth: "68ch", fontSize: 15.5 }}>
          Every number in a LENS report comes from a measurement that was actually performed. This page documents the
          formulas, the weights and — just as importantly — the things a single-page audit cannot tell you.
        </p>
      </header>

      <section className="card" style={{ marginTop: 32 }}>
        <h2 className="section-title">Measurement sources</h2>
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Used for</th>
                <th>Provenance label</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Headless Chromium (real render)</td>
                <td>Lab Web Vitals, network accounting, computed styles, contrast, layout overflow, touch targets, screenshots</td>
                <td className="mono">lab / browser</td>
              </tr>
              <tr>
                <td>Delivered HTML</td>
                <td>Metadata, headings, structured data, form labelling, link inventory</td>
                <td className="mono">markup</td>
              </tr>
              <tr>
                <td>HTTP responses</td>
                <td>Status codes, redirects, cache and security headers, robots.txt, sitemap, certificate</td>
                <td className="mono">http</td>
              </tr>
              <tr>
                <td>Chrome UX Report (optional)</td>
                <td>Real-user field metrics, only when a dataset exists for the origin</td>
                <td className="mono">field</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: 34 }}>
        <h2 className="landing-title" style={{ fontSize: 24 }}>Overall LENS Score</h2>
        <p className="muted" style={{ marginTop: 10, maxWidth: "70ch" }}>
          The overall score is the weight of each assessed category multiplied by its score, normalised over the
          categories that could be assessed. Categories that could not be measured are excluded from both the numerator
          and the denominator, so an unmeasurable check never counts as a failure.
        </p>
        <div className="table-wrap card" style={{ marginTop: 16, padding: 0 }}>
          <table className="table" style={{ padding: 0 }}>
            <thead>
              <tr>
                <th style={{ paddingLeft: 18 }}>Category</th>
                <th>Weight</th>
                <th>Basis</th>
              </tr>
            </thead>
            <tbody>
              {WEIGHTS.map((row) => (
                <tr key={row.category}>
                  <td style={{ paddingLeft: 18 }}>{row.category}</td>
                  <td className="mono">{row.weight}</td>
                  <td>{row.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="status-legend" style={{ marginTop: 16 }}>
          <span className="pill" data-tone="good"><span className="pill-dot" /> 90–100 Excellent</span>
          <span className="pill" data-tone="good"><span className="pill-dot" /> 75–89 Good</span>
          <span className="pill" data-tone="warn"><span className="pill-dot" /> 50–74 Needs improvement</span>
          <span className="pill" data-tone="bad"><span className="pill-dot" /> 0–49 Poor</span>
        </div>
      </section>

      <section style={{ marginTop: 34 }}>
        <h2 className="landing-title" style={{ fontSize: 24 }}>Category formulas</h2>
        <div className="grid" style={{ marginTop: 16, gap: 14 }}>
          {CATEGORY_FORMULAS.map((section) => (
            <article key={section.title} className="card card-tight">
              <h3 className="section-title">{section.title}</h3>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="muted" style={{ marginTop: 9, fontSize: 13.5, lineHeight: 1.65 }}>
                  {paragraph}
                </p>
              ))}
            </article>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 34 }}>
        <h2 className="landing-title" style={{ fontSize: 24 }}>What a single-page audit cannot tell you</h2>
        <ul className="limits">
          <li>Real-user field performance for a whole origin. LENS shows field data only when Chrome UX Report coverage exists, and always labels it separately.</li>
          <li>Sitewide crawl health. Link checking is a sample of the analysed page, not a crawl of the domain.</li>
          <li>Responsiveness on physical devices. Viewport rendering is a strong signal, not a substitute for device testing.</li>
          <li>Whether a page is indexed by a search engine right now. LENS reads the page&apos;s own directives and indexability signals.</li>
          <li>Security posture beyond observable configuration. No exploitation or vulnerability discovery is attempted.</li>
          <li>Content quality, brand, conversion performance or business outcomes.</li>
        </ul>
      </section>

      <section className="card" style={{ marginTop: 34 }}>
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <ShieldAlert size={18} style={{ flex: "none", marginTop: 3, color: "var(--warn)" }} />
          <div>
            <h3 className="section-title">Ethics and access</h3>
            <p className="muted" style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.65 }}>
              LENS only analyses publicly reachable http/https pages. Requests are rate-limited, capped in size and
              duration, and limited in number. Targets that resolve to private, loopback or link-local address space are
              refused, and every redirect is re-validated. LENS does not bypass authentication, CAPTCHAs, paywalls or
              firewalls, and it does not store credentials, cookies or personal data from analysed pages.
            </p>
          </div>
        </div>
      </section>

      <div style={{ marginTop: 30 }}>
        <Link href="/#analyze" className="btn btn-primary">
          Analyze a website
        </Link>
      </div>
    </div>
  );
}
