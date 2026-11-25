import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getReportStore } from "@/lib/store/reports";
import { ReportView } from "@/components/report-view";
import { LocalReportLoader } from "@/components/local-report-loader";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const store = getReportStore();
  const report = await store.get(id).catch(() => null);
  if (!report) return { title: "Report not found", robots: { index: false } };
  return {
    title: `${report.host} — LENS ${report.overall.score ?? "—"}/100`,
    description: `Technical audit of ${report.finalUrl}: ${report.categories
      .map((category) => `${category.label} ${category.score ?? "n/a"}`)
      .join(", ")}.`,
    robots: { index: false, follow: true },
    openGraph: {
      title: `${report.host} — LENS report`,
      description: `LENS score ${report.overall.score ?? "—"}/100 · ${report.findings.filter((item) => item.severity !== "info").length} findings · analysed ${new Date(report.createdAt).toUTCString()}`,
      type: "article",
    },
  };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{6,32}$/i.test(id)) notFound();

  const store = getReportStore();
  const report = await store.get(id).catch(() => null);
  if (!report) {
    // Nothing durable on this instance: the report may still exist in the
    // browser archive that ran the analysis.
    if (!store.durable) return <LocalReportLoader id={id} />;
    notFound();
  }

  const all = await store.list(40).catch(() => []);
  const history = all.filter((item) => item.id !== report.id && item.host === report.host).slice(0, 8);

  return (
    <div className="container">
      <ReportView report={report} history={history} shareable={store.durable} />
    </div>
  );
}
