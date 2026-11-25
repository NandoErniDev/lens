"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, GitCompare, RefreshCw, Trash2 } from "lucide-react";
import type { ReportSummary } from "@/lib/types";
import { removeLocalSummary } from "@/lib/local-history";
import { listLocalReports, deleteLocalReport } from "@/lib/local-reports";
import { toneForScore } from "./score-ring";

export function ReportsBrowser() {
  const [remote, setRemote] = useState<ReportSummary[]>([]);
  const [local, setLocal] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [durable, setDurable] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    setLocal(await listLocalReports());
    try {
      const response = await fetch("/api/reports?limit=50", { cache: "no-store" });
      const payload = (await response.json()) as { reports?: ReportSummary[]; durable?: boolean };
      setRemote(payload.reports ?? []);
      setDurable(Boolean(payload.durable));
    } catch {
      setRemote([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const merged = useMemo(() => {
    const map = new Map<string, ReportSummary>();
    for (const item of [...remote, ...local]) {
      if (!map.has(item.id)) map.set(item.id, item);
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [remote, local]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return merged;
    return merged.filter((item) => `${item.host} ${item.title} ${item.url}`.toLowerCase().includes(needle));
  }, [merged, query]);

  const toggle = (summary: ReportSummary) => {
    setSelected((current) => {
      if (current.includes(summary.id)) return current.filter((id) => id !== summary.id);
      const other = merged.find((item) => item.id === current[0]);
      if (current.length === 1 && other && other.host !== summary.host) {
        return [summary.id];
      }
      return [...current, summary.id].slice(-2);
    });
  };

  const canCompare = selected.length === 2;
  const compareHref = canCompare ? `/compare?a=${selected[0]}&b=${selected[1]}` : "#";

  return (
    <div>
      <div className="spread" style={{ gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div className="row" style={{ gap: 10 }}>
          <label className="search-field">
            <span className="sr-only">Search saved reports</span>
            <input placeholder="Filter by host" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <span className="dim mono" style={{ fontSize: 11.5 }}>
            {merged.length} report{merged.length === 1 ? "" : "s"} · {durable ? "server storage active" : "browser-only history"}
          </span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={13} className={loading ? "spin" : undefined} />
            Refresh
          </button>
          <Link href={compareHref} className={`btn btn-sm${canCompare && selected.every((id) => remote.some((item) => item.id === id)) ? " btn-primary" : ""}`} aria-disabled={!canCompare} style={!canCompare ? { pointerEvents: "none", opacity: 0.45 } : undefined}>
            <GitCompare size={13} />
            Compare{selected.length ? ` (${selected.length}/2)` : ""}
          </Link>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p className="section-title">No reports yet</p>
          <p className="muted" style={{ marginTop: 8, fontSize: 13.5 }}>
            Run an analysis and it will appear here — with its scores, findings and comparison history.
          </p>
          <Link href="/#analyze" className="btn btn-primary" style={{ marginTop: 18 }}>
            Analyze a website
            <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 18, width: 34 }} />
                  <th>Site</th>
                  <th>Analyzed</th>
                  <th>Score</th>
                  <th>Findings</th>
                  <th>Coverage</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isSelected = selected.includes(item.id);
                  const isLocalOnly = !remote.some((entry) => entry.id === item.id);
                  return (
                    <tr key={item.id}>
                      <td style={{ paddingLeft: 18 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(item)}
                          aria-label={`Select ${item.host} analysis for comparison`}
                        />
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ color: "var(--text)" }}>{item.host}</span>
                          <span className="dim truncate" style={{ fontSize: 11.5, maxWidth: 320 }}>{item.title || item.url}</span>
                        </div>
                      </td>
                      <td className="mono">
                        {new Date(item.createdAt).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td>
                        <span className={`mono ${toneForScore(item.overallScore)}`} style={{ fontWeight: 600 }}>
                          {item.overallScore ?? "—"}
                        </span>
                      </td>
                      <td className="mono">{item.findingCount}</td>
                      <td>
                        <span className="pill" data-tone={item.coverage.browser ? "good" : "warn"}>
                          {item.coverage.browser ? "Full" : "Partial"}
                        </span>
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6, justifyContent: "flex-end", paddingRight: 18 }}>
                          <Link href={isLocalOnly ? `/saved/${item.id}` : `/report/${item.id}`} className="nav-link" style={{ padding: 0 }}>
                            Open
                          </Link>
                          {isLocalOnly && (
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label="Remove from browser history"
                              onClick={() => {
                                removeLocalSummary(item.id);
                                void deleteLocalReport(item.id).then(load);
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!durable && (
        <p className="dim" style={{ fontSize: 12, marginTop: 14 }}>
          Server storage is not configured on this instance, so reports are listed from this browser only and cannot be
          shared by link.
        </p>
      )}
    </div>
  );
}
