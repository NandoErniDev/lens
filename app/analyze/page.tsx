import type { Metadata } from "next";
import { AnalysisRunner } from "@/components/analysis-runner";

export const metadata: Metadata = {
  title: "Analyzing",
  robots: { index: false, follow: false },
};

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const params = await searchParams;
  return <AnalysisRunner initialUrl={params.url ?? ""} />;
}
