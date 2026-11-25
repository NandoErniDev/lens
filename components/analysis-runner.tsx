"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import type { AnalysisStage, ProgressEvent, Report, StreamEvent } from "@/lib/types";
import { ReportView } from "./report-view";
import { saveLocalSummary } from "@/lib/local-history";
import { saveLocalReport } from "@/lib/local-reports";

const STAGES: { id: AnalysisStage; label: string }[] = [
  { id: "validating", label: "Validating address" },
  { id: "fetching", label: "Fetching the document" },
  { id: "launching", label: "Starting browser session" },
  { id: "performance", label: "Measuring performance" },
  { id: "mobile", label: "Rendering viewports" },
  { id: "accessibility", label: "Auditing accessibility" },
  { id: "seo", label: "Inspecting SEO signals" },
  { id: "links", label: "Checking links" },
  { id: "security", label: "Reviewing security configuration" },
  { id: "scoring", label: "Scoring and assembling" },
];

type Status = "running" | "done" | "error" | "cancelled";

export function AnalysisRunner({ initialUrl }: { initialUrl: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState<AnalysisStage>("validating");
  const [status, setStatus] = useState<Status>("running");
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const startedAt = useRef(Date.now());

  const start = useCallback(
    async (url: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      startedAt.current = Date.now();
      setStatus("running");
      setError(null);
      setReport(null);
      setProgress(0.02);
      setCurrentStage("validating");

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setStatus("error");
          setError({ message: payload.error ?? `The analysis could not start (HTTP ${response.status}).` });
          return;
        }

        if (!response.body) {
          setStatus("error");
          setError({ message: "The server returned an empty response." });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let event: StreamEvent;
            try {
              event = JSON.parse(trimmed) as StreamEvent;
            } catch {
              continue;
            }

            if (event.type === "progress") {
              setProgress((current) => Math.max(current, event.progress));
              setCurrentStage(event.stage);
            } else if (event.type === "done") {
              setProgress(1);
              setPersisted(event.persisted);
              saveLocalSummary(event.report);
              if (event.persisted) {
                void saveLocalReport(event.report);
                router.replace(`/report/${event.report.id}`);
              } else {
                setStatus("done");
                setReport(event.report);
                void saveLocalReport(event.report).then(() => router.replace(`/saved/${event.report.id}`));
              }
            } else if (event.type === "error") {
              setStatus("error");
              setError({ message: event.message, hint: event.hint });
            }
          }
        }

        setStatus((current) => (current === "running" ? "error" : current));
        setError((current) => current ?? (status === "running" ? { message: "The analysis ended without a result." } : null));
      } catch (caught) {
        if (controller.signal.aborted) {
          setStatus("cancelled");
          return;
        }
        setStatus("error");
        setError({
          message: caught instanceof Error ? caught.message : "The connection to the analysis service failed.",
          hint: "Check your connection and try again.",
        });
      }
    },
    [router],
  );

  useEffect(() => {
    if (initialUrl) void start(initialUrl);
    else {
      setStatus("error");
      setError({ message: "No website address was provided." });
    }
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "running") return;
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && status === "running") {
        abortRef.current?.abort();
        setStatus("cancelled");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status]);

  if (report) {
    return (
      <div className="container" style={{ paddingTop: 32 }}>
        <div className="note" style={{ marginBottom: 22 }}>
          <span>
            This report was generated but could not be stored on the server, so it cannot be shared by link.
            Set <span className="mono">LENS_KV_NAMESPACE_ID</span> to enable permanent reports.
          </span>
        </div>
        <ReportView report={report} />
      </div>
    );
  }

  const stageIndex = STAGES.findIndex((stage) => stage.id === currentStage);

  return (
    <div className="container" style={{ maxWidth: 720, paddingTop: 64, paddingBottom: 80 }}>
      <Link href="/" className="nav-link" style={{ padding: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <ArrowLeft size={14} />
        Back
      </Link>

      <div style={{ marginTop: 28 }}>
        <p className="eyebrow">{status === "running" ? "Analysis in progress" : status === "cancelled" ? "Analysis cancelled" : "Analysis failed"}</p>
        <h1 style={{ fontSize: "clamp(24px, 3.4vw, 32px)", marginTop: 10, wordBreak: "break-all" }}>
          {prettyUrl(initialUrl)}
        </h1>
        <p className="muted" style={{ marginTop: 8, fontSize: 13.5 }}>
          {status === "running"
            ? "LENS is rendering the page in Chromium and measuring what it finds. Progress below reflects real stages, not a timer."
            : status === "cancelled"
              ? "The run was stopped. No partial report is shown."
              : "The analysis did not complete. Details below."}
        </p>
      </div>

      <div className="progress-shell card" style={{ marginTop: 26 }}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <span className="mono dim">{status === "running" ? `${STAGES[Math.max(0, stageIndex)].label}…` : status === "done" ? "Complete" : "Stopped"}</span>
          <span className="mono dim">{Math.round(progress * 100)}% · {elapsed}s</span>
        </div>
        <div className="progress-track" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${Math.max(3, progress * 100)}%` }} />
        </div>

        <ul className="stage-list">
          {STAGES.map((stage, index) => {
            const state = status !== "running" && index > stageIndex ? "pending" : index < stageIndex ? "done" : index === stageIndex ? (status === "running" ? "active" : "pending") : "pending";
            return (
              <li key={stage.id} className={`stage ${state}`}>
                <span className="stage-mark">
                  {state === "done" ? <Check size={11} /> : state === "active" ? <Loader2 size={11} className="spin" /> : <span className="stage-dot" />}
                </span>
                {stage.label}
              </li>
            );
          })}
        </ul>

        {status === "running" && (
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 18 }}
            onClick={() => {
              abortRef.current?.abort();
              setStatus("cancelled");
            }}
          >
            <X size={13} />
            Cancel analysis
            <span className="kbd" style={{ marginLeft: 4 }}>Esc</span>
          </button>
        )}
      </div>

      {error && (
        <div className="card" style={{ marginTop: 20, borderColor: "color-mix(in srgb, var(--bad) 30%, var(--border))" }}>
          <h2 className="section-title" style={{ color: "var(--bad)" }}>Could not analyze this website</h2>
          <p className="muted" style={{ marginTop: 8 }}>{error.message}</p>
          {error.hint && <p className="dim" style={{ marginTop: 6, fontSize: 13 }}>{error.hint}</p>}
          <div className="row" style={{ gap: 10, marginTop: 16 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void start(initialUrl)}>
              Try again
            </button>
            <Link href="/" className="btn btn-sm">
              Analyze another site
            </Link>
          </div>
        </div>
      )}

      {persisted && status === "done" && (
        <p className="dim" style={{ marginTop: 16, fontSize: 13 }}>Finishing up…</p>
      )}
    </div>
  );
}

function prettyUrl(input: string): string {
  try {
    const url = new URL(input);
    return url.host + (url.pathname === "/" ? "" : url.pathname);
  } catch {
    return input;
  }
}
