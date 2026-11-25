"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Download, Search } from "lucide-react";
import { CATEGORY_LABELS, SEVERITY_LABELS, SEVERITY_ORDER, type Finding, type Severity } from "@/lib/types";

const FILTERS: { key: "all" | Severity; label: string }[] = [
  { key: "all", label: "All" },
  ...SEVERITY_ORDER.map((severity) => ({ key: severity, label: SEVERITY_LABELS[severity] })),
];

export function FindingsList({ findings }: { findings: Finding[] }) {
  const [filter, setFilter] = useState<"all" | Severity>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(findings[0]?.id ?? null);

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: findings.length };
    for (const severity of SEVERITY_ORDER) base[severity] = findings.filter((item) => item.severity === severity).length;
    return base;
  }, [findings]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return findings.filter((item) => {
      if (filter !== "all" && item.severity !== filter) return false;
      if (!needle) return true;
      return `${item.title} ${item.detected} ${item.target ?? ""} ${CATEGORY_LABELS[item.category]}`.toLowerCase().includes(needle);
    });
  }, [findings, filter, query]);

  const exportFindings = () => {
    const rows = [
      ["title", "category", "severity", "detected", "impact", "recommendation", "target", "evidence"],
      ...visible.map((item) => [
        item.title,
        CATEGORY_LABELS[item.category],
        item.severity,
        item.detected,
        item.impact,
        item.recommendation,
        item.target ?? "",
        (item.evidence ?? "").replace(/\n/g, " | "),
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lens-findings-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="findings-toolbar">
        <div className="findings-filters" role="tablist" aria-label="Filter findings by severity">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={filter === item.key}
              className={`filter-btn${filter === item.key ? " active" : ""}`}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              <span className="filter-count">{counts[item.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="findings-actions">
          <label className="search-field">
            <Search size={14} aria-hidden="true" />
            <span className="sr-only">Search findings</span>
            <input
              type="search"
              value={query}
              placeholder="Search findings"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button type="button" className="btn btn-sm" onClick={exportFindings} disabled={!visible.length}>
            <Download size={13} />
            Export CSV
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty-inline" style={{ marginTop: 18 }}>No findings match this filter.</div>
      ) : (
        <ul className="finding-list">
          {visible.map((item) => {
            const isOpen = open === item.id;
            return (
              <li key={item.id} className={`finding${isOpen ? " open" : ""}`}>
                <button
                  type="button"
                  className="finding-head"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : item.id)}
                >
                  <span className="severity" data-severity={item.severity}>{SEVERITY_LABELS[item.severity]}</span>
                  <span className="finding-title">{item.title}</span>
                  <span className="finding-cat mono">{CATEGORY_LABELS[item.category]}</span>
                  <ChevronDown size={15} className="finding-chevron" aria-hidden="true" />
                </button>
                <div className="finding-body" hidden={!isOpen}>
                  <div className="finding-grid">
                    <div>
                      <p className="finding-label">Detected</p>
                      <p>{item.detected}</p>
                    </div>
                    <div>
                      <p className="finding-label">Why it matters</p>
                      <p>{item.impact}</p>
                    </div>
                  </div>
                  <div>
                    <p className="finding-label">Recommendation</p>
                    <p>{item.recommendation}</p>
                  </div>
                  {item.target && (
                    <div>
                      <p className="finding-label">Affected URL</p>
                      <p className="mono" style={{ wordBreak: "break-all" }}>{item.target}</p>
                    </div>
                  )}
                  {item.evidence && (
                    <div>
                      <p className="finding-label">Evidence</p>
                      <pre className="evidence">{item.evidence}</pre>
                    </div>
                  )}
                </div>
                {false && (
                  <div className="finding-body">
                    <div className="finding-grid">
                      <div>
                        <p className="finding-label">Detected</p>
                        <p>{item.detected}</p>
                      </div>
                      <div>
                        <p className="finding-label">Why it matters</p>
                        <p>{item.impact}</p>
                      </div>
                    </div>
                    <div>
                      <p className="finding-label">Recommendation</p>
                      <p>{item.recommendation}</p>
                    </div>
                    {item.target && (
                      <div>
                        <p className="finding-label">Affected URL</p>
                        <p className="mono" style={{ wordBreak: "break-all" }}>{item.target}</p>
                      </div>
                    )}
                    {item.evidence && (
                      <div>
                        <p className="finding-label">Evidence</p>
                        <pre className="evidence">{item.evidence}</pre>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
