import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  Clock,
  Globe2,
  Info,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { Check, Report, ReportSummary } from "@/lib/types";
import { CATEGORY_LABELS, SEVERITY_LABELS } from "@/lib/types";
import { ScoreRing, toneForScore } from "./score-ring";
import { CategoryBars, LinkStatusBar, LinkTable, MetricTile, ResourceBar, ScoreHistory, SeverityBar, categoryColor, formatBytes } from "./charts";
import { FindingsList } from "./findings-list";
import { MobilePreview } from "./mobile-preview";
import { ReportActions } from "./report-actions";

const STATUS_TEXT: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  "needs-improvement": "Needs improvement",
  poor: "Poor",
  unavailable: "Not assessed",
};

function CheckIcon({ status }: { status: Check["status"] }) {
  if (status === "pass") return <CheckCircle2 size={13} style={{ color: "var(--good)" }} />;
  if (status === "fail") return <XCircle size={13} style={{ color: "var(--bad)" }} />;
  if (status === "warn") return <AlertTriangle size={13} style={{ color: "var(--warn)" }} />;
  if (status === "unavailable") return <CircleDashed size={13} style={{ color: "var(--text-tertiary)" }} />;
  return <Info size={13} style={{ color: "var(--text-tertiary)" }} />;
}

function ChecksList({ checks }: { checks: Check[] }) {
  if (!checks.length) return <div className="empty-inline">No checks recorded for this category.</div>;
  return (
    <ul className="checks-list">
      {checks.map((check) => (
        <li key={check.id} className="check-row">
          <CheckIcon status={check.status} />
          <span className="check-label">{check.label}</span>
          <span className="check-detail">{check.detail}</span>
          <span className={`check-status ${check.status}`}>
            {check.status === "pass" ? "Pass" : check.status === "fail" ? "Fail" : check.status === "warn" ? "Attention" : check.status === "info" ? "Info" : "Not assessed"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({
  id,
  eyebrow,
  title,
  subtitle,
  children,
  action,
}: {
  id: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="report-section" id={id}>
      <div className="section-head" style={{ marginBottom: 14 }}>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="landing-title" style={{ fontSize: 22 }}>{title}</h2>
          {subtitle && <p className="panel-subtitle" style={{ marginTop: 6 }}>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ReportView({
  report,
  history = [],
  shareable = true,
  portable = false,
}: {
  report: Report;
  history?: ReportSummary[];
  shareable?: boolean;
  portable?: boolean;
}) {
  const faviconUrl = report.favicon ?? resolveFavicon(report.origin);
  const timestamp = new Date(report.createdAt);
  const severityTotals = report.findings.reduce<Record<string, number>>((acc, item) => {
    acc[item.severity] = (acc[item.severity] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <article className="report">
      <header className="report-header">
        <div className="report-identity">
          <div className="identity-row">
            <span className="favicon-tile" aria-hidden="true">
              {faviconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={faviconUrl} alt="" width={22} height={22} loading="lazy" />
              ) : (
                report.host.slice(0, 1).toUpperCase()
              )}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="identity-host-row">
                <h1 className="report-host">{report.host}</h1>
                <span className="pill" data-tone={report.status === "complete" ? "good" : "warn"}>
                  <span className="pill-dot" />
                  {report.status === "complete" ? "Complete analysis" : "Partial analysis"}
                </span>
              </div>
              <p className="report-page-title">{report.title}</p>
            </div>
          </div>

          <a href={report.finalUrl} target="_blank" rel="noreferrer noopener" className="report-url mono">
            <Globe2 size={13} />
            <span className="truncate">{report.finalUrl}</span>
            <ArrowUpRight size={12} />
          </a>

          <div className="report-meta">
            <span className="meta-item">
              <Clock size={12} />
              {timestamp.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="meta-item">
              Mobile · 390 × 844 · Slow 4G · 4× CPU
            </span>
            <span className="meta-item">{Math.round(report.durationMs / 1000)}s runtime</span>
            <span className="meta-item">{report.engine.name} {report.engine.version}</span>
          </div>

          <ReportActions report={report} shareable={shareable} portable={portable} />
        </div>

        <div className="report-score">
          <ScoreRing score={report.overall.score} size={148} stroke={8} status={report.overall.status} />
          <div className="report-score-meta">
            <span className="eyebrow">LENS score</span>
            <span className={`score-status ${toneForScore(report.overall.score)}`}>{STATUS_TEXT[report.overall.status]}</span>
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: 260 }}>{report.overall.summary}</p>
          </div>
        </div>
      </header>

      <div className="coverage-strip">
        <CoverageChip label="Browser render" active={report.coverage.browser} />
        <CoverageChip label="Viewport screenshots" active={report.coverage.screenshots} />
        <CoverageChip label="Link sample" active={report.coverage.links} />
        <CoverageChip label="Sitemap & robots" active={report.coverage.sitemap} />
        <CoverageChip label="Field data (CrUX)" active={report.coverage.fieldData} />
        <span className="dim mono" style={{ marginLeft: "auto" }}>
          {report.overall.assessedCategories}/6 categories assessed
        </span>
      </div>

      <nav className="report-nav no-print" aria-label="Report sections">
        {[
          ["overview", "Overview"],
          ["priority", "Priority fixes"],
          ["findings", "Findings"],
          ["performance", "Performance"],
          ["mobile", "Mobile"],
          ["accessibility", "Accessibility"],
          ["seo", "SEO"],
          ["links", "Links"],
          ["security", "Security"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`}>{label}</a>
        ))}
      </nav>

      <Section
        id="overview"
        eyebrow="Overview"
        title="Category results"
        subtitle="Each category is scored from measured evidence. Categories that could not be assessed are marked as such and excluded from the overall score."
      >
        <div className="category-grid">
          {report.categories.map((category) => (
            <div key={category.key} className="category-tile" data-category={category.key} style={{ borderTopColor: categoryColor(category.key) }}>
              <div className="category-tile-head">
                <span className="category-tile-name">{category.label}</span>
                <span className={`pill`} data-tone={category.score === null ? "neutral" : category.score >= 75 ? "good" : category.score >= 50 ? "warn" : "bad"}>
                  {STATUS_TEXT[category.status]}
                </span>
              </div>
              <div className="category-tile-score">
                <ScoreRing score={category.score} size={76} stroke={5} />
                <div className="category-tile-meta">
                  <span className="mono dim">{category.findings} findings</span>
                  <span className="mono dim">{Math.round(category.coverage * 100)}% coverage</span>
                  <span className="mono dim">weight {Math.round(category.weight * 100)}%</span>
                </div>
              </div>
              <p className="category-tile-summary">{category.summary}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-2" style={{ marginTop: 14 }}>
          <div className="card">
            <h3 className="section-title" style={{ marginBottom: 16 }}>Category comparison</h3>
            <CategoryBars categories={report.categories.map((category) => ({ key: category.key, label: category.label, score: category.score }))} />
          </div>
          <div className="card">
            <h3 className="section-title" style={{ marginBottom: 16 }}>Findings by severity</h3>
            <SeverityBar
              counts={{
                critical: severityTotals.critical ?? 0,
                high: severityTotals.high ?? 0,
                medium: severityTotals.medium ?? 0,
                low: severityTotals.low ?? 0,
                info: severityTotals.info ?? 0,
              }}
            />
            <div className="severity-summary">
              {(["critical", "high", "medium", "low"] as const).map((severity) => (
                <div key={severity} className="severity-summary-row">
                  <span className="severity" data-severity={severity}>{SEVERITY_LABELS[severity]}</span>
                  <span className="mono dim">{severityTotals[severity] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {report.priorityFixes.length > 0 && (
        <Section
          id="priority"
          eyebrow="Do these first"
          title="Priority fixes"
          subtitle="Ranked from the findings in this report by severity, category weight and evidence confidence."
        >
          <div className="priority-list">
            {report.priorityFixes.map((fix) => (
              <div key={fix.findingId} className="priority-item">
                <span className="priority-rank mono">{String(fix.rank).padStart(2, "0")}</span>
                <div className="priority-body">
                  <div className="priority-head">
                    <h3>{fix.title}</h3>
                    <span className="severity" data-severity={fix.severity}>{SEVERITY_LABELS[fix.severity]}</span>
                  </div>
                  <p className="muted" style={{ fontSize: 13 }}>{fix.rationale}</p>
                  <p className="dim mono" style={{ fontSize: 11.5, marginTop: 6 }}>
                    {CATEGORY_LABELS[fix.category]} · {fix.estimatedImpact}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section
        id="findings"
        eyebrow="Evidence"
        title={`All findings (${report.findings.length})`}
        subtitle="Every finding states what was detected, why it matters, how to fix it and the evidence behind it."
      >
        <div className="card">
          <FindingsList findings={report.findings} />
        </div>
      </Section>

      <Section
        id="performance"
        eyebrow="Performance"
        title="Measured in the browser"
        subtitle={report.performance.lab.note}
        action={<span className="pill">{report.performance.lab.device === "mobile" ? "Mobile lab" : "Desktop lab"}</span>}
      >
        <div className="card">
          <div className="metric-grid">
            {report.performance.metrics.map((metric) => (
              <MetricTile key={metric.id} metric={metric} />
            ))}
          </div>

          <div className="perf-summary">
            <div>
              <span className="eyebrow">Requests</span>
              <p className="perf-number">{report.performance.totals.requests ?? "—"}</p>
            </div>
            <div>
              <span className="eyebrow">Transferred</span>
              <p className="perf-number">{formatBytes(report.performance.totals.bytes)}</p>
            </div>
            <div>
              <span className="eyebrow">JavaScript</span>
              <p className="perf-number">{formatBytes(report.performance.totals.jsBytes)}</p>
            </div>
            <div>
              <span className="eyebrow">Images</span>
              <p className="perf-number">{formatBytes(report.performance.totals.imageBytes)}</p>
            </div>
            <div>
              <span className="eyebrow">Throttling</span>
              <p className="perf-small">{report.performance.lab.throttling}</p>
            </div>
          </div>

          {report.performance.resources.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <h3 className="section-title" style={{ marginBottom: 12 }}>Transfer size breakdown</h3>
              <ResourceBar groups={report.performance.resources} />
            </div>
          )}
        </div>

        {report.performance.diagnostics.thirdParty.length > 0 && (
          <div className="card" style={{ marginTop: 14 }}>
            <h3 className="section-title" style={{ marginBottom: 12 }}>Third-party origins</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Origin</th><th>Requests</th><th>Transferred</th></tr>
                </thead>
                <tbody>
                  {report.performance.diagnostics.thirdParty.map((origin) => (
                    <tr key={origin.origin}>
                      <td className="mono truncate">{origin.origin}</td>
                      <td className="mono">{origin.requests}</td>
                      <td className="mono">{formatBytes(origin.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {report.performance.field.note && (
          <div className="note" style={{ marginTop: 14 }}>
            <Info size={15} style={{ flex: "none", marginTop: 2 }} />
            <span><strong style={{ color: "var(--text)" }}>Field data:</strong> {report.performance.field.note}</span>
          </div>
        )}
      </Section>

      <Section
        id="mobile"
        eyebrow="Mobile"
        title="Rendered at three viewports"
        subtitle={report.mobile.note ?? "Responsive behaviour was measured at real viewport sizes."}
      >
        <div className="card">
          {report.mobile.available ? (
            <MobilePreview viewports={report.mobile.viewports} />
          ) : (
            <div className="empty-state">
              <CircleDashed size={20} style={{ color: "var(--text-tertiary)" }} />
              <div>
                <h3 className="section-title">Mobile experience was not assessed</h3>
                <p className="muted" style={{ marginTop: 6, fontSize: 13.5 }}>{report.mobile.note}</p>
              </div>
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <ChecksList checks={report.mobile.checks} />
          </div>
        </div>
      </Section>

      <div className="grid grid-2" style={{ marginTop: 44 }}>
        <section id="accessibility" className="card">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Accessibility</p>
              <h2 className="panel-title" style={{ marginTop: 6 }}>Markup and rendering checks</h2>
            </div>
            <span className={`mono ${toneForScore(report.categories.find((c) => c.key === "accessibility")?.score ?? null)}`} style={{ fontSize: 18, fontWeight: 600 }}>
              {report.categories.find((c) => c.key === "accessibility")?.score ?? "—"}
            </span>
          </div>
          <ChecksList checks={report.accessibility.checks} />
          <div className="count-grid">
            <CountItem label="Images" value={report.accessibility.counts.images} note={`${report.accessibility.counts.imagesMissingAlt} without alt`} />
            <CountItem label="Form fields" value={report.accessibility.counts.formFields} note={`${report.accessibility.counts.unlabeledFields} unlabelled`} />
            <CountItem label="Headings" value={report.accessibility.counts.headings} note={`${report.accessibility.counts.headingJumps} level jumps`} />
            <CountItem label="Contrast samples" value={report.accessibility.counts.contrastSamples} note={`${report.accessibility.counts.contrastFailures} below AA`} />
          </div>
        </section>

        <section id="seo" className="card">
          <div className="panel-head">
            <div>
              <p className="eyebrow">SEO</p>
              <h2 className="panel-title" style={{ marginTop: 6 }}>Technical signals</h2>
            </div>
            <span className={`mono ${toneForScore(report.categories.find((c) => c.key === "seo")?.score ?? null)}`} style={{ fontSize: 18, fontWeight: 600 }}>
              {report.categories.find((c) => c.key === "seo")?.score ?? "—"}
            </span>
          </div>
          <ChecksList checks={report.seo.checks} />
          <div className="keyvalue">
            <KeyValue label="Title" value={report.seo.title ?? "—"} mono={false} />
            <KeyValue label="Description" value={report.seo.description ?? "—"} mono={false} />
            <KeyValue label="Canonical" value={report.seo.canonical ?? "none"} />
            <KeyValue label="Robots" value={report.seo.robotsMeta ?? "—"} />
            <KeyValue label="Structured data" value={report.seo.structuredData.types.join(", ") || "none"} />
            <KeyValue label="Sitemap" value={`${report.seo.sitemap.available ? "available" : "not found"}${report.seo.sitemap.urls ? ` · ${report.seo.sitemap.urls} URLs` : ""}`} />
          </div>
        </section>
      </div>

      <Section
        id="links"
        eyebrow="Links"
        title="Link and resource health"
        subtitle={
          report.links.available
            ? `${report.links.checked} of ${report.links.discovered} discovered destinations checked${report.links.truncated ? " — a prioritised sample, not a crawl" : ""}.`
            : "Link checking was not available for this URL."
        }
      >
        <div className="card">
          {report.links.available ? (
            <>
              <LinkStatusBar summary={report.links.summary} />
              <div style={{ marginTop: 18 }}>
                <LinkTable items={report.links.items} />
              </div>
              {report.links.discovered > 60 && (
                <p className="dim" style={{ fontSize: 12, marginTop: 12 }}>
                  Showing the first 60 checked destinations. LENS samples links instead of crawling the whole site.
                </p>
              )}
            </>
          ) : (
            <div className="empty-inline">No link data was collected.</div>
          )}
        </div>
      </Section>

      <Section
        id="security"
        eyebrow="Security"
        title="Configuration overview"
        subtitle="Read-only checks of transport security and response headers. This is not a penetration test or a security certification."
      >
        <div className="grid grid-2">
          <div className="card">
            <h3 className="section-title" style={{ marginBottom: 12 }}>Transport</h3>
            <div className="keyvalue">
              <KeyValue label="HTTPS" value={report.security.https.supported ? "enabled" : "missing"} />
              <KeyValue label="HTTP → HTTPS" value={report.security.https.redirectedFromHttp ? "redirects" : "no redirect detected"} />
              <KeyValue label="Certificate issuer" value={report.security.https.certificate?.issuer ?? "—"} mono={false} />
              <KeyValue
                label="Expires"
                value={
                  report.security.https.certificate?.validTo
                    ? `${new Date(report.security.https.certificate.validTo).toLocaleDateString()} (${report.security.https.certificate.daysRemaining} days)`
                    : "—"
                }
              />
              <KeyValue label="Mixed content" value={report.security.mixedContent.count ? `${report.security.mixedContent.count} insecure resources` : "none detected"} />
              <KeyValue label="Server header" value={report.security.serverInfo.server ?? "not exposed"} />
            </div>
            <div className="note" style={{ marginTop: 16 }}>
              <ShieldCheck size={15} style={{ flex: "none", marginTop: 2 }} />
              <span>Only observable configuration was checked. No exploitation, credential testing or vulnerability scanning was performed.</span>
            </div>
          </div>

          <div className="card">
            <h3 className="section-title" style={{ marginBottom: 12 }}>Response headers</h3>
            <CheckListGroup checks={report.security.checks} />
          </div>
        </div>
      </Section>

      {history.length > 0 && (
        <Section
          id="history"
          eyebrow="History"
          title="Previous analyses of this site"
          subtitle="Scores from earlier runs of the same host on this LENS instance."
        >
          <div className="card">
            <ScoreHistory
              points={[{ at: report.createdAt, score: report.overall.score, id: report.id }, ...history.map((item) => ({ at: item.createdAt, score: item.overallScore, id: item.id }))].reverse()}
            />
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Overall</th><th>Findings</th><th /></tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td className="mono">{new Date(item.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="mono">{item.overallScore ?? "—"}</td>
                      <td className="mono">{item.findingCount}</td>
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <Link href={`/report/${item.id}`} className="nav-link" style={{ padding: 0 }}>Open</Link>
                          <Link href={`/compare?a=${item.id}&b=${report.id}`} className="nav-link" style={{ padding: 0 }}>Compare</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}

      <Section id="notes" eyebrow="Method & limits" title="How to read this report" subtitle="The context that keeps a technical score honest.">
        <div className="card">
          <ul className="notes-list">
            {report.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <div className="row" style={{ gap: 12, marginTop: 18, flexWrap: "wrap" }}>
            <Link href="/methodology" className="btn btn-sm">Read the full methodology</Link>
            <Link href={`/analyze?url=${encodeURIComponent(report.url)}`} className="btn btn-sm">Re-run this analysis</Link>
          </div>
        </div>
      </Section>
    </article>
  );
}

function CoverageChip({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`coverage-chip${active ? "" : " off"}`}>
      {active ? <CheckCircle2 size={12} /> : <CircleDashed size={12} />}
      {label}
    </span>
  );
}

function CountItem({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="count-item">
      <span className="eyebrow">{label}</span>
      <span className="count-number">{value}</span>
      <span className="dim" style={{ fontSize: 11.5 }}>{note}</span>
    </div>
  );
}

function KeyValue({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="kv-row">
      <span className="kv-label">{label}</span>
      <span className={`kv-value${mono ? " mono" : ""}`}>{value}</span>
    </div>
  );
}

function CheckListGroup({ checks }: { checks: Check[] }) {
  if (!checks.length) return <div className="empty-inline">No header checks were recorded.</div>;
  return <ChecksList checks={checks} />;
}

function resolveFavicon(origin: string): string | null {
  try {
    return `${origin}/favicon.ico`;
  } catch {
    return null;
  }
}
