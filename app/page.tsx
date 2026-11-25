import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Fingerprint,
  Gauge,
  Link2,
  ScanSearch,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { UrlForm } from "@/components/url-form";
import { MetricScale } from "@/components/metric-scale";
import { getReportStore, isPersistenceConfigured } from "@/lib/store/reports";
import { CATEGORY_LABELS, type CategoryKey } from "@/lib/types";

export const dynamic = "force-dynamic";

const CATEGORY_ICONS: Record<CategoryKey, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  performance: Gauge,
  mobile: Smartphone,
  accessibility: Fingerprint,
  seo: ScanSearch,
  links: Link2,
  security: ShieldCheck,
};

const CATEGORY_DETAIL: { key: CategoryKey; description: string; checks: string[] }[] = [
  {
    key: "performance",
    description: "Real lab metrics from a throttled mobile run of the page.",
    checks: ["LCP, CLS, TBT, FCP, TTFB", "Page weight and request mix", "Render-blocking resources"],
  },
  {
    key: "mobile",
    description: "The page rendered at three real viewport sizes.",
    checks: ["Horizontal overflow", "Touch target sizing", "Text size and viewport meta"],
  },
  {
    key: "accessibility",
    description: "Markup and rendering checks with computed styles.",
    checks: ["Alt text and form labels", "Measured colour contrast", "Headings, landmarks, ARIA"],
  },
  {
    key: "seo",
    description: "Technical signals that decide whether the page can rank.",
    checks: ["Titles, descriptions, canonicals", "Robots directives, sitemap, robots.txt", "Structured data and social metadata"],
  },
  {
    key: "links",
    description: "Sampled link and resource resolution, never a full-site crawl.",
    checks: ["Internal and external status codes", "Broken images and redirect chains", "Redirect loops"],
  },
  {
    key: "security",
    description: "A read-only configuration overview, not a penetration test.",
    checks: ["HTTPS, HSTS and certificate validity", "CSP, nosniff, referrer and permissions policies", "Mixed content and version disclosure"],
  },
];

const STATUS_TONE: Record<string, string> = {
  excellent: "var(--good)",
  good: "var(--good)",
  "needs-improvement": "var(--warn)",
  poor: "var(--bad)",
  unavailable: "var(--text-tertiary)",
};

async function loadRecent() {
  if (!isPersistenceConfigured()) return [];
  try {
    const store = getReportStore();
    const reports = await store.list(3);
    return reports;
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const recent = await loadRecent();

  return (
    <div className="landing">
      <section className="hero">
        <div className="container">
          <div className="hero-badge reveal">
            <Sparkles size={12} />
            <span>Website intelligence, measured in a real browser</span>
          </div>
          <h1 className="hero-title reveal reveal-2">
            See what your website
            <br />
            is made of.
          </h1>
          <p className="hero-lead reveal reveal-3">
            Enter any public URL. LENS renders the page, measures how it actually behaves, and turns six technical
            categories into one report you can act on — with the evidence behind every finding.
          </p>

          <div className="hero-form reveal reveal-4" id="analyze">
            <UrlForm autoFocus />
            <div className="hero-examples">
              <span className="dim">Try</span>
              {["stripe.com", "developer.mozilla.org", "wikipedia.org"].map((example) => (
                <ExampleChip key={example} host={example} />
              ))}
            </div>
          </div>

          <div className="hero-facts reveal reveal-4">
            <span><strong>6</strong> categories</span>
            <span className="dim" aria-hidden="true">·</span>
            <span><strong>40+</strong> individual checks</span>
            <span className="dim" aria-hidden="true">·</span>
            <span>No account required</span>
          </div>
        </div>
      </section>

      <section className="container landing-section">
        <div className="hero-board card">
          <div className="hero-board-head">
            <div>
              <p className="eyebrow">Report structure</p>
              <h2 className="section-title" style={{ marginTop: 6 }}>Six scores, one clear verdict</h2>
            </div>
            <span className="pill"><span className="pill-dot" style={{ color: "var(--good)" }} />Live data only</span>
          </div>
          <div className="hero-board-grid">
            {(Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((key) => {
              const Icon = CATEGORY_ICONS[key];
              return (
                <div key={key} className="hero-board-item">
                  <span className="hero-board-icon" data-category={key}>
                    <Icon size={14} strokeWidth={1.8} />
                  </span>
                  <span>{CATEGORY_LABELS[key]}</span>
                  <SourceTag category={key} />
                </div>
              );
            })}
          </div>
          <div className="hero-board-foot">
            <span className="dim mono">measurement source</span>
            <span className="dim mono">browser · lab · http</span>
          </div>
        </div>
      </section>

      <section className="container landing-section" id="categories">
        <div className="section-head">
          <div>
            <p className="eyebrow">Analysis categories</p>
            <h2 className="landing-title">What LENS examines</h2>
          </div>
          <Link href="/methodology" className="nav-link" style={{ padding: 0 }}>
            Read the methodology
          </Link>
        </div>
        <div className="grid grid-3">
          {CATEGORY_DETAIL.map((item) => {
            const Icon = CATEGORY_ICONS[item.key];
            return (
              <article key={item.key} className="card category-card" data-category={item.key}>
                <div className="category-card-head">
                  <span className="category-icon" data-category={item.key}>
                    <Icon size={17} strokeWidth={1.7} />
                  </span>
                  <h3>{CATEGORY_LABELS[item.key]}</h3>
                </div>
                <p className="muted" style={{ fontSize: 13.5 }}>{item.description}</p>
                <ul className="category-list">
                  {item.checks.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <section className="container landing-section" id="how">
        <div className="grid grid-2" style={{ alignItems: "start", gap: 28 }}>
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="landing-title">Measured, then explained</h2>
            <p className="muted" style={{ marginTop: 12, maxWidth: "52ch" }}>
              LENS does not guess from markup alone. It opens the page in headless Chromium, records what the browser
              actually did, and cross-checks the delivered HTML and HTTP configuration. Anything it cannot measure is
              labelled as not assessed — never filled in with an estimate.
            </p>
            <div className="steps">
              <div className="step">
                <span className="step-index mono">01</span>
                <div>
                  <h3>Validate and render</h3>
                  <p className="muted">The URL is normalised, DNS is resolved and private or internal targets are refused. A fresh browser context loads the page with mobile throttling.</p>
                </div>
              </div>
              <div className="step">
                <span className="step-index mono">02</span>
                <div>
                  <h3>Measure and inspect</h3>
                  <p className="muted">Web Vitals observers, network accounting, computed styles and three viewport renderings run alongside HTTP header, sitemap and link checks.</p>
                </div>
              </div>
              <div className="step">
                <span className="step-index mono">03</span>
                <div>
                  <h3>Score and prioritise</h3>
                  <p className="muted">Findings are weighted by severity and category relevance, then ranked so the fixes with the widest impact appear first.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Threshold reference</h3>
                <p className="panel-subtitle">The values LENS scores against — Google&apos;s Core Web Vitals and Web.dev thresholds.</p>
              </div>
            </div>
            <MetricScale />
            <div className="note" style={{ marginTop: 18 }}>
              <Activity size={15} style={{ flex: "none", marginTop: 2 }} />
              <span>
                Lab numbers come from a single throttled run and vary between runs. Field data is only shown when a
                real-user dataset exists for the origin.
              </span>
            </div>
          </div>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="container landing-section" id="recent">
          <div className="section-head">
            <div>
              <p className="eyebrow">Recently analysed</p>
              <h2 className="landing-title">Real reports from this instance</h2>
            </div>
            <Link href="/reports" className="nav-link" style={{ padding: 0 }}>
              All reports
            </Link>
          </div>
          <div className="grid grid-3">
            {recent.map((report) => (
              <Link key={report.id} href={`/report/${report.id}`} className="card recent-card">
                <div className="spread">
                  <span className="mono dim">{new Date(report.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                  <ArrowUpRight size={14} className="dim" />
                </div>
                <h3 style={{ marginTop: 10, fontSize: 15 }}>{report.host}</h3>
                <p className="dim" style={{ fontSize: 12.5, marginTop: 3 }}>{report.findingCount} findings</p>
                <div className="recent-score">
                  <span style={{ color: STATUS_TONE[report.overallScore === null ? "unavailable" : report.overallScore >= 90 ? "excellent" : report.overallScore >= 75 ? "good" : report.overallScore >= 50 ? "needs-improvement" : "poor"], fontSize: 26, fontWeight: 600, letterSpacing: "-0.04em" }}>
                    {report.overallScore ?? "—"}
                  </span>
                  <span className="dim" style={{ fontSize: 11 }}>/ 100</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="container landing-section">
        <div className="cta card">
          <div>
            <p className="eyebrow">Start here</p>
            <h2 className="landing-title" style={{ marginTop: 8 }}>Audit a page in under a minute</h2>
            <p className="muted" style={{ marginTop: 8, maxWidth: "48ch" }}>
              One URL in, one technical report out. No sign-up, no stored credentials, no crawling of your site.
            </p>
          </div>
          <Link href="/#analyze" className="btn btn-accent">
            Analyze a website
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </section>
    </div>
  );
}

function ExampleChip({ host }: { host: string }) {
  return (
    <Link href={`/analyze?url=${encodeURIComponent(`https://${host}`)}`} className="chip">
      {host}
    </Link>
  );
}

function SourceTag({ category }: { category: CategoryKey }) {
  const source = category === "performance" || category === "mobile" ? "browser" : category === "security" ? "http" : "markup";
  return <span className="source-tag mono">{source}</span>;
}
