/**
 * Safe HTTP client for outbound analysis requests.
 *
 * Every request:
 *  - is restricted to http/https and public hosts,
 *  - revalidates each redirect destination (DNS included) before following it,
 *  - is capped in time and body size,
 *  - never forwards cookies or credentials.
 */

import { assertSafeUrl, isCheckableUrl, UnsafeUrlError } from "@/lib/url-safety";

export interface SafeResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  bytes: number;
  durationMs: number;
  redirects: { from: string; to: string; status: number }[];
  truncated: boolean;
  tls?: { validTo: string | null; issuer: string | null; subject: string | null };
}

export interface SafeRequestOptions {
  method?: "GET" | "HEAD";
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: string;
  signal?: AbortSignal;
}

const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 LENS-Audit/1.0 (+https://lens.naerdev.ch)",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
};

export async function safeFetch(target: string, options: SafeRequestOptions = {}): Promise<SafeResponse> {
  const { method = "GET", timeoutMs = 15_000, maxBytes = 3_000_000, maxRedirects = 6, accept, signal } = options;
  const started = Date.now();
  const redirects: { from: string; to: string; status: number }[] = [];

  let current: URL;
  try {
    current = new URL(target);
  } catch {
    throw new UnsafeUrlError("Invalid URL.", "Provide a full http(s) URL.");
  }

  let hops = 0;
  for (;;) {
    await assertSafeUrl(current);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
    const onAbort = () => controller.abort(new Error("cancelled"));
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const response = await fetch(current, {
        method,
        redirect: "manual",
        headers: { ...DEFAULT_HEADERS, ...(accept ? { accept } : {}) },
        signal: controller.signal,
        cache: "no-store",
      });

      const status = response.status;

      if (status >= 300 && status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) {
          return finalize(response, current, "", 0, redirects, false, started);
        }
        hops += 1;
        if (hops > maxRedirects) {
          throw new Error(`Too many redirects (>${maxRedirects}).`);
        }
        const next = new URL(location, current);
        redirects.push({ from: current.toString(), to: next.toString(), status });
        if (next.protocol !== "http:" && next.protocol !== "https:") {
          throw new UnsafeUrlError("Redirect to an unsupported protocol was blocked.", "The site redirects to a non-web URL.");
        }
        current = next;
        continue;
      }

      if (method === "HEAD") {
        await response.body?.cancel().catch(() => undefined);
        return finalize(response, current, "", 0, redirects, false, started);
      }

      const reader = response.body?.getReader();
      if (!reader) return finalize(response, current, "", 0, redirects, false, started);

      const chunks: Uint8Array[] = [];
      let received = 0;
      let truncated = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        received += value.byteLength;
        if (received > maxBytes) {
          chunks.push(value.subarray(0, Math.max(0, value.byteLength - (received - maxBytes))));
          truncated = true;
          await reader.cancel().catch(() => undefined);
          break;
        }
        chunks.push(value);
      }

      const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
      const contentType = response.headers.get("content-type") ?? "";
      let body = "";
      if (!/^(image|video|audio|font|application\/(zip|pdf|octet-stream))/i.test(contentType)) {
        body = decodeBody(buffer, contentType);
      }

      return finalize(response, current, body, buffer.byteLength, redirects, truncated, started);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

function decodeBody(buffer: Buffer, contentType: string): string {
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase();
  try {
    if (charset && charset !== "utf-8" && charset !== "utf8") {
      return new TextDecoder(charset as string, { fatal: false }).decode(buffer);
    }
  } catch {
    /* unknown charset: fall through */
  }
  return buffer.toString("utf8");
}

function finalize(
  response: Response,
  url: URL,
  body: string,
  bytes: number,
  redirects: { from: string; to: string; status: number }[],
  truncated: boolean,
  started: number,
): SafeResponse {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return {
    url: url.toString(),
    status: response.status,
    headers,
    body,
    bytes,
    durationMs: Date.now() - started,
    redirects,
    truncated,
  };
}

/** Check whether a link (discovered in the page) is safe and worth requesting. */
export function shouldCheckLink(url: string): boolean {
  return isCheckableUrl(url);
}

/** Fetch a small text asset (robots.txt, sitemap) with a short budget. */
export async function fetchText(url: string, timeoutMs = 8_000, maxBytes = 512_000): Promise<SafeResponse | null> {
  try {
    return await safeFetch(url, { timeoutMs, maxBytes, accept: "text/plain,application/xml,text/xml,*/*" });
  } catch {
    return null;
  }
}
