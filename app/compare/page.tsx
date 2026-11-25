import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import { getReportStore } from "@/lib/store/reports";
import type { CategoryKey, Report } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { ScoreRing, toneForScore } from "@/components/score-ring";

export const metadata: Metadata = {
  title: "Compare reports",
  robots: { index: false, follow: false },
};

const CATEGORY_ORDER: CategoryKey[] = ["performance", "mobile", "accessibility", "seo", "links", "security"];

function scoreOf(report: Report, key: CategoryKey): number | null {
  return report.categories.find((category) => category.key === key)?.score ?? null;
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="dim mono">—</span>;
  if (value === 0) {
    return (
      <span className="mono dim" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        <Minus size={12} /> 0
      </span>
    );
  }
  const positive = value > 0;
  return (
    <span className={`mono ${positive ? "tone-good" : "tone-bad"}`} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
      {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {positive ? "+" : ""}
      {value}
    </span>
  );
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const params = await searchParams;
  const store = getReportStore();
  const [first, second] = await Promise.all([
    params.a ? store.get(params.a).catch(() => null) : Promise.resolve(null),
    params.b ? store.get(params.b).catch(() => null) : Promise.resolve(null),
  ]);

  if (!first || !second) {
    return (
      <div className="container" style={{ paddingTop: 80, maxWidth: 620 }}>
        <h1 style={{ fontSize: 26 }}>Comparison unavailable</h1>
        <p className="muted" style={{ marginTop: 10 }}>
          Both reports need to exist on this instance. Choose two analyses of the same site from the archive.
        </p>
        <Link href="/reports" className="btn btn-primary" style={{ marginTop: 20 }}>
          Open saved reports
        </Link>
      </div>
    );
  }

  const older = new Date(first.createdAt) <= new Date(second.createdAt) ? first : second;
  const newer = older === first ? second : first;

  const overallDelta =
    older.overall.score !== null && newer.overall.score !== null ? newer.overall.score - older.overall.score : null;

  const olderTitles = new Set(older.findings.map((finding) => finding.title));
  const newerTitles = new Set(newer.findings.map((finding) => finding.title));
  const resolved = older.findings.filter((finding) => !newerTitles.has(finding.title) && finding.severity !== "info");
  const introduced = newer.findings.filter((finding) => !olderTitles.has(finding.title) && finding.severity !== "info");
  const persisting = newer.findings.filter((finding) => olderTitles.has(finding.title) && finding.severity !== "info");

  return (
    <div className="container" style={{ paddingTop: 44, paddingBottom: 40 }}>
      <nav className="row" style={{ gap: 8, fontSize: 12.5 }}>
        <Link href="/reports" className="nav-link" style={{ padding: 0 }}>Saved reports</Link>
        <span className="dim">/</span>
        <span className="dim">Compare</span>
      </nav>

      <header className="section-head" style={{ marginTop: 18 }}>
        <div>
          <p className="eyebrow">Comparison</p>
          <h1 className="landing-title">{newer.host}</h1>
          <p className="muted" style={{ marginTop: 8, fontSize: 13.5 }}>
            {new Date(older.createdAt).toLocaleString()} → {new Date(newer.createdAt).toLocaleString()}
            {older.host !== newer.host && " · different hosts: treat this comparison with caution"}
          </p>
        </div>
        <div className="row" style={{ gap: 16 }}>
          <Link href={`/report/${older.id}`} className="btn btn-sm">Older report</Link>
          <Link href={`/report/${newer.id}`} className="btn btn-sm">Newer report</Link>
        </div>
      </header>

      <div className="grid grid-2" style={{ marginTop: 12 }}>
        <div className="card" style={{ display: "flex", gap: 22, alignItems: "center" }}>
          <ScoreRing score={older.overall.score} size={96} stroke={6} />
          <div>
            <p className="eyebrow">Earlier</p>
            <p style={{ fontSize: 15, marginTop: 4 }}>{new Date(older.createdAt).toLocaleString()}</p>
            <p className="dim mono" style={{ fontSize: 11.5, marginTop: 4 }}>{older.findings.length} findings</p>
          </div>
        </div>
        <div className="card" style={{ display: "flex", gap: 22, alignItems: "center" }}>
          <ScoreRing score={newer.overall.score} size={96} stroke={6} />
          <div style={{ flex: 1 }}>
            <p className="eyebrow">Later</p>
            <p style={{ fontSize: 15, marginTop: 4 }}>{new Date(newer.createdAt).toLocaleString()}</p>
            <div className="row" style={{ gap: 8, marginTop: 4, alignItems: "center" }}>
              <span className="dim mono" style={{ fontSize: 11.5 }}>overall change</span>
              <Delta value={overallDelta} />
            </div>
          </div>
        </div>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title" style={{ marginBottom: 14 }}>Category scores</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Earlier</th>
                <th>Later</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORY_ORDER.map((key) => {
                const before = scoreOf(older, key);
                const after = scoreOf(newer, key);
                const delta = before !== null && after !== null ? after - before : null;
                return (
                  <tr key={key}>
                    <td>{CATEGORY_LABELS[key]}</td>
                    <td className="mono">{before ?? "—"}</td>
                    <td className={`mono ${toneForScore(after)}`} style={{ fontWeight: 600 }}>{after ?? "—"}</td>
                    <td>
                      <Delta value={delta} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <section className="card">
          <h2 className="section-title" style={{ color: "var(--good)", marginBottom: 12 }}>
            Resolved ({resolved.length})
          </h2>
          {resolved.length === 0 ? (
            <p className="dim" style={{ fontSize: 13 }}>No earlier finding disappeared in the newer report.</p>
          ) : (
            <ul className="diff-list">
              {resolved.map((finding) => (
                <li key={finding.id}>
                  <span className="severity" data-severity={finding.severity}>{finding.severity}</span>
                  <span>{finding.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 className="section-title" style={{ color: "var(--bad)", marginBottom: 12 }}>
            New ({introduced.length})
          </h2>
          {introduced.length === 0 ? (
            <p className="dim" style={{ fontSize: 13 }}>No new findings appeared in the newer report.</p>
          ) : (
            <ul className="diff-list">
              {introduced.map((finding) => (
                <li key={finding.id}>
                  <span className="severity" data-severity={finding.severity}>{finding.severity}</span>
                  <span>{finding.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>Still present ({persisting.length})</h2>
        {persisting.length === 0 ? (
          <p className="dim" style={{ fontSize: 13 }}>Nothing carried over between these two runs.</p>
        ) : (
          <ul className="diff-list">
            {persisting.map((finding) => (
              <li key={finding.id}>
                <span className="severity" data-severity={finding.severity}>{finding.severity}</span>
                <span>{finding.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="dim" style={{ marginTop: 20, fontSize: 12 }}>
        Findings are matched by title. Lab measurements vary slightly between runs, so small score differences are not
        necessarily real changes.
      </p>

      <div className="row" style={{ gap: 10, marginTop: 24 }}>
        <Link href={`/report/${newer.id}`} className="btn btn-primary">
          Open the latest report
          <ArrowRight size={14} />
        </Link>
        <Link href="/reports" className="btn">All reports</Link>
      </div>
    </div>
  );
}
