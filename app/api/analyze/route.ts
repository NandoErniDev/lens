import { NextResponse } from "next/server";
import { runAnalysis } from "@/lib/analysis/orchestrator";
import { getReportStore } from "@/lib/store/reports";
import { UnsafeUrlError } from "@/lib/url-safety";
import type { StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Very small in-process limiter: protects against trivial abuse per instance. */
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 12;
const buckets = new Map<string, number[]>();

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "anonymous").trim();
}

function takeToken(key: string): boolean {
  const now = Date.now();
  const entries = (buckets.get(key) ?? []).filter((time) => now - time < RATE_WINDOW_MS);
  if (entries.length >= RATE_LIMIT) {
    buckets.set(key, entries);
    return false;
  }
  entries.push(now);
  buckets.set(key, entries);
  if (buckets.size > 5000) buckets.clear();
  return true;
}

export async function POST(request: Request) {
  let payload: { url?: unknown };
  try {
    payload = (await request.json()) as { url?: unknown };
  } catch {
    return NextResponse.json({ error: "Expected a JSON body with a url field." }, { status: 400 });
  }

  if (typeof payload.url !== "string" || !payload.url.trim()) {
    return NextResponse.json({ error: "A url field is required." }, { status: 400 });
  }

  const key = clientKey(request);
  if (!takeToken(key)) {
    return NextResponse.json(
      { error: "Too many analyses from this client. Try again in a little while." },
      { status: 429, headers: { "retry-after": "900" } },
    );
  }

  const encoder = new TextEncoder();
  const store = getReportStore();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };

      const heartbeat = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode("\n"));
          } catch {
            closed = true;
          }
        }
      }, 15_000);

      try {
        const report = await runAnalysis({
          input: payload.url as string,
          onProgress: (event) => send(event),
          signal: request.signal,
          budgetMs: 46_000,
        });

        // A non-durable store keeps the report only inside this server instance,
        // so the client must not treat the report as linkable.
        const saved = await store.save(report).catch(() => false);
        const persisted = saved && store.durable;

        send({
          type: "done",
          report,
          persisted,
          shareable: persisted && store.durable,
        });
      } catch (error) {
        if (request.signal.aborted) {
          closed = true;
          return;
        }

        let code = "analysis_failed";
        let message = "The analysis could not be completed.";
        let hint: string | undefined;

        if (error instanceof UnsafeUrlError) {
          code = error.code;
          message = error.message;
          hint = error.hint;
        } else if (error instanceof Error) {
          if (/cancelled/i.test(error.message)) {
            code = "cancelled";
            message = "Analysis cancelled.";
          } else if (/timeout|timed out/i.test(error.message)) {
            code = "timeout";
            message = "The website did not respond in time.";
            hint = "The page may be slow, unreachable, or blocking automated requests.";
          } else if (/net::ERR_|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(error.message)) {
            code = "unreachable";
            message = "The website could not be reached.";
            hint = "Check that the address is correct and publicly accessible.";
          } else {
            message = error.message.slice(0, 200);
          }
        }

        send({ type: "error", code, message, hint });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
