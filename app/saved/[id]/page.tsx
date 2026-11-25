import type { Metadata } from "next";
import { LocalReportLoader } from "@/components/local-report-loader";

export const metadata: Metadata = {
  title: "Saved report",
  robots: { index: false, follow: false },
};

export default async function SavedReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LocalReportLoader id={id} />;
}
