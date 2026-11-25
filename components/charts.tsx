import type { LinkItem, Metric, ResourceGroup, Severity } from "@/lib/types";

const CATEGORY_COLOR: Record<string, string> = {
  performance: "var(--perf)",
  mobile: "var(--mobile)",
  accessibility: "var(--a11y)",
  seo: "var(--seo)",
  links: "var(--links)",
  security: "var(--security)",
};

export function categoryColor(key: string): string {
  return CATEGORY_COLOR[key] ?? "var(--accent)";
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Horizontal comparison of all category scores. */
export function CategoryBars({ categories }: { categories: { key: string; label: string; score: number | null }[] }) {
  return (
    <div className="cat-bars">
      {categories.map((category) => (
        <div key={category.key} className="cat-bar-row">
          <span className="cat-bar-label">{category.label}</span>
          <div className="cat-bar-track">
            <div
              className="cat-bar-fill"
              style={{
                width: `${category.score ?? 0}%`,
                background: categoryColor(category.key),
                opacity: category.score === null ? 0 : 1,
              }}
            />
            {category.score === null && <span className="cat-bar-empty">not assessed</span>}
          </div>
          <span className="cat-bar-value mono">{category.score ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

/** A measured metric with its position between the good/poor thresholds. */
export function MetricTile({ metric }: { metric: Metric }) {
  const unavailable = metric.value === null;
  const good = metric.good ?? 0;
  const poor = metric.poor ?? 0;
  const ratio = unavailable || !poor ? 0 : Math.min(1, Math.max(0, (metric.value! - good) / Math.max(poor - good, 1)));
  const position = unavailable ? 0 : Math.min(100, Math.max(6, 18 + ratio * 64));
  const tone = metric.rating === "good" ? "var(--good)" : metric.rating === "needs-improvement" ? "var(--warn)" : metric.rating === "poor" ? "var(--bad)" : "var(--text-tertiary)";

  return (
    <div className="metric-tile" data-rating={metric.rating}>
      <div className="metric-head">
        <span className="metric-label mono">{metric.shortLabel}</span>
        <span className="metric-source mono">{metric.source}</span>
      </div>
      <div className="metric-value" style={{ color: unavailable ? "var(--text-tertiary)" : "var(--text)" }}>
        {unavailable ? "—" : metric.display.replace(/\s?(ms|s)$/, "")}
        {!unavailable && <span className="metric-unit">{metric.display.match(/(ms|s)$/)?.[0] ?? ""}</span>}
      </div>
      <div className="metric-caption">{unavailable ? "not measured" : metric.rating.replace("-", " ")}</div>
      {!unavailable && metric.poor !== null && (
        <div className="metric-track" aria-hidden="true">
          <span style={{ left: `${position}%`, background: tone }} className="metric-marker" />
        </div>
      )}
      <p className="metric-desc">{metric.description}</p>
    </div>
  );
}

/** Stacked bar for resource bytes by type. */
export function ResourceBar({ groups }: { groups: ResourceGroup[] }) {
  const total = groups.reduce((sum, group) => sum + group.bytes, 0);
  const palette = ["var(--accent)", "var(--perf)", "var(--seo)", "var(--a11y)", "var(--links)", "var(--security)", "var(--mobile)"];
  if (!total) return null;
  return (
    <div>
      <div className="stack-bar" role="img" aria-label="Transfer size by resource type">
        {groups.map((group, index) => (
          <span
            key={group.type}
            title={`${group.type}: ${formatBytes(group.bytes)}`}
            style={{ width: `${(group.bytes / total) * 100}%`, background: palette[index % palette.length] }}
          />
        ))}
      </div>
      <div className="stack-legend">
        {groups.map((group, index) => (
          <div key={group.type} className="stack-legend-row">
            <span className="stack-dot" style={{ background: palette[index % palette.length] }} />
            <span className="stack-name">{group.type}</span>
            <span className="mono dim">{group.requests}</span>
            <span className="mono">{formatBytes(group.bytes)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "var(--critical)",
  high: "var(--high)",
  medium: "var(--medium)",
  low: "var(--low)",
  info: "var(--info)",
};

export function SeverityBar({ counts }: { counts: Record<Severity, number> }) {
  const order: Severity[] = ["critical", "high", "medium", "low", "info"];
  const total = order.reduce((sum, key) => sum + counts[key], 0);
  if (!total) return <div className="empty-inline">No findings</div>;
  return (
    <div>
      <div className="stack-bar stack-bar-thin" role="img" aria-label="Findings by severity">
        {order.map((severity) =>
          counts[severity] ? (
            <span
              key={severity}
              title={`${severity}: ${counts[severity]}`}
              style={{ width: `${(counts[severity] / total) * 100}%`, background: SEVERITY_COLOR[severity] }}
            />
          ) : null,
        )}
      </div>
      <div className="severity-legend">
        {order.map((severity) => (
          <span key={severity} className="severity-legend-item">
            <span className="stack-dot" style={{ background: SEVERITY_COLOR[severity] }} />
            {severity} <span className="mono">{counts[severity]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function LinkStatusBar({ summary }: { summary: { ok: number; redirect: number; broken: number; blocked: number; timeout: number; unchecked: number } }) {
  const segments = [
    { key: "ok", value: summary.ok, color: "var(--good)" },
    { key: "redirect", value: summary.redirect, color: "var(--mobile)" },
    { key: "broken", value: summary.broken, color: "var(--bad)" },
    { key: "blocked", value: summary.blocked, color: "var(--medium)" },
    { key: "timeout", value: summary.timeout, color: "var(--high)" },
    { key: "unchecked", value: summary.unchecked, color: "var(--low)" },
  ].filter((segment) => segment.value > 0);

  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (!total) return <div className="empty-inline">No links were checked</div>;

  return (
    <div>
      <div className="stack-bar" role="img" aria-label="Link status distribution">
        {segments.map((segment) => (
          <span key={segment.key} title={`${segment.key}: ${segment.value}`} style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }} />
        ))}
      </div>
      <div className="severity-legend">
        {segments.map((segment) => (
          <span key={segment.key} className="severity-legend-item">
            <span className="stack-dot" style={{ background: segment.color }} />
            {segment.key} <span className="mono">{segment.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function LinkTable({ items }: { items: LinkItem[] }) {
  const tone = (state: LinkItem["state"]) =>
    state === "ok" ? "good" : state === "redirect" ? "neutral" : state === "broken" ? "bad" : "warn";

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>URL</th>
            <th>Type</th>
            <th>Status</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 60).map((item) => (
            <tr key={item.url}>
              <td style={{ maxWidth: 420 }}>
                <span className="mono truncate" title={item.url}>{item.displayUrl}</span>
                {item.anchor && <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>{item.anchor}</div>}
              </td>
              <td className="mono dim">{item.type}</td>
              <td className="mono">{item.status ?? "—"}</td>
              <td>
                <span className="pill" data-tone={tone(item.state)}>
                  <span className="pill-dot" />
                  {item.state}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Score history: small sparkline with dots for each analysis. */
export function ScoreHistory({ points }: { points: { at: string; score: number | null; id: string }[] }) {
  const valid = points.filter((point) => point.score !== null) as { at: string; score: number; id: string }[];
  if (valid.length < 2) return null;
  const width = 520;
  const height = 120;
  const pad = 12;
  const step = (width - pad * 2) / Math.max(1, valid.length - 1);
  const y = (score: number) => pad + (1 - score / 100) * (height - pad * 2);
  const path = valid.map((point, index) => `${index === 0 ? "M" : "L"} ${pad + index * step} ${y(point.score)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="history-chart" role="img" aria-label="Score history">
      {[25, 50, 75].map((guide) => (
        <line key={guide} x1={pad} x2={width - pad} y1={y(guide)} y2={y(guide)} stroke="var(--border)" strokeDasharray="3 4" />
      ))}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {valid.map((point, index) => (
        <circle key={point.id} cx={pad + index * step} cy={y(point.score)} r={3.2} fill="var(--accent)" />
      ))}
    </svg>
  );
}
