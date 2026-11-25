const METRICS = [
  { id: "lcp", label: "LCP", description: "Largest Contentful Paint", good: "≤ 2.5 s", poor: "> 4.0 s", position: 32 },
  { id: "cls", label: "CLS", description: "Cumulative Layout Shift", good: "≤ 0.1", poor: "> 0.25", position: 26 },
  { id: "tbt", label: "TBT", description: "Total Blocking Time", good: "≤ 200 ms", poor: "> 600 ms", position: 38 },
  { id: "fcp", label: "FCP", description: "First Contentful Paint", good: "≤ 1.8 s", poor: "> 3.0 s", position: 30 },
];

export function MetricScale() {
  return (
    <div className="scale-list">
      {METRICS.map((metric) => (
        <div key={metric.id} className="scale-row">
          <div className="scale-meta">
            <span className="mono" style={{ color: "var(--text)", fontWeight: 600 }}>{metric.label}</span>
            <span className="dim" style={{ fontSize: 12 }}>{metric.description}</span>
          </div>
          <div className="scale-track" role="img" aria-label={`${metric.label}: good ${metric.good}, poor ${metric.poor}`}>
            <span className="scale-seg scale-good" />
            <span className="scale-seg scale-mid" />
            <span className="scale-seg scale-poor" />
            <span className="scale-marker" style={{ left: `${metric.position}%` }} />
          </div>
          <div className="scale-legend mono">
            <span style={{ color: "var(--good)" }}>{metric.good}</span>
            <span style={{ color: "var(--bad)" }}>{metric.poor}</span>
          </div>
        </div>
      ))}
      <div className="scale-key mono dim">
        <span><i className="key-dot" style={{ background: "var(--good)" }} /> good</span>
        <span><i className="key-dot" style={{ background: "var(--warn)" }} /> needs work</span>
        <span><i className="key-dot" style={{ background: "var(--bad)" }} /> poor</span>
      </div>
    </div>
  );
}
