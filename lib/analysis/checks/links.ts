/** Broken-link and resource checking with concurrency and a hard time budget. */

import type { Finding, LinkItem, LinksSection } from "@/lib/types";
import { safeFetch } from "@/lib/http/safe-fetch";
import { isCheckableUrl } from "@/lib/url-safety";
import { finding, plural } from "../findings";

export interface LinkCandidate {
  url: string;
  type: "internal" | "external";
  kind: "link" | "image";
  anchor?: string;
  foundOn: string;
}

export interface LinksResult {
  section: LinksSection;
  findings: Finding[];
  score: number | null;
  coverage: number;
}

const MAX_CHECKS = 60;
const CONCURRENCY = 6;

function displayUrl(url: string, origin: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.origin === origin) {
      const path = `${parsed.pathname}${parsed.search}`;
      return path.length > 1 ? path : "/";
    }
    return parsed.host + (parsed.pathname === "/" ? "" : parsed.pathname);
  } catch {
    return url.slice(0, 80);
  }
}

async function checkOne(candidate: LinkCandidate, timeoutMs: number, signal?: AbortSignal): Promise<LinkItem> {
  const base: LinkItem = {
    url: candidate.url,
    displayUrl: candidate.url,
    type: candidate.type,
    status: null,
    state: "ok",
    foundOn: candidate.foundOn,
    anchor: candidate.anchor,
  };

  const run = async (method: "HEAD" | "GET") =>
    safeFetch(candidate.url, {
      method,
      timeoutMs,
      maxBytes: 200_000,
      maxRedirects: 5,
      signal,
      accept: candidate.kind === "image" ? "image/*,*/*" : "text/html,application/xhtml+xml,*/*;q=0.8",
    });

  try {
    let response;
    try {
      response = await run("HEAD");
      if (response.status === 405 || response.status === 403 || response.status === 501) {
        response = await run("GET");
      }
    } catch {
      response = await run("GET");
    }

    const hops = response.redirects.length;
    const status = response.status;
    const finalUrl = response.url;

    let state: LinkItem["state"] = "ok";
    if (status === 0) state = "timeout";
    else if (status >= 400) {
      if (status === 403 || status === 401 || status === 429) state = "blocked";
      else state = "broken";
    } else if (hops > 0) state = "redirect";

    const looped = response.redirects.length >= 2 && response.redirects.slice(0, -1).some((hop) => hop.to === finalUrl && hop.from !== finalUrl);

    return {
      ...base,
      status,
      state: looped ? "broken" : state,
      redirectTo: hops > 0 ? finalUrl : undefined,
      hops,
      error: looped ? "Redirect loop detected" : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return {
      ...base,
      state: /abort|timeout/i.test(message) ? "timeout" : "blocked",
      error: message.slice(0, 160),
    };
  }
}

export async function buildLinks(options: {
  candidates: LinkCandidate[];
  origin: string;
  finalUrl: string;
  budgetMs: number;
  signal?: AbortSignal;
}): Promise<LinksResult> {
  const { candidates, origin, finalUrl, budgetMs, signal } = options;

  const unique = new Map<string, LinkCandidate>();
  for (const candidate of candidates) {
    if (!isCheckableUrl(candidate.url)) continue;
    if (!unique.has(candidate.url)) unique.set(candidate.url, candidate);
  }

  const list = Array.from(unique.values());
  const selected = list
    .sort((a, b) => {
      const score = (item: LinkCandidate) => (item.type === "internal" ? 2 : 0) + (item.kind === "image" ? 1 : 0);
      return score(b) - score(a);
    })
    .slice(0, MAX_CHECKS);

  const truncated = list.length > selected.length;
  const deadline = Date.now() + budgetMs;
  const results: LinkItem[] = [];

  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, selected.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= selected.length) return;
      if (Date.now() > deadline || signal?.aborted) {
        const pending = selected.slice(index);
        for (const candidate of pending) {
          results.push({
            url: candidate.url,
            displayUrl: displayUrl(candidate.url, origin),
            type: candidate.type,
            status: null,
            state: "unchecked",
            foundOn: candidate.foundOn,
            anchor: candidate.anchor,
          });
        }
        cursor = selected.length;
        return;
      }
      const remaining = Math.max(2_000, Math.min(8_000, deadline - Date.now()));
      const item = await checkOne(selected[index], remaining, signal);
      results.push({ ...item, displayUrl: displayUrl(item.url, origin) });
    }
  });

  await Promise.all(workers);

  results.sort((a, b) => {
    const rank: Record<LinkItem["state"], number> = { broken: 0, redirect: 1, timeout: 2, blocked: 3, unchecked: 4, ok: 5 };
    return rank[a.state] - rank[b.state] || a.displayUrl.localeCompare(b.displayUrl);
  });

  const summary = {
    ok: results.filter((item) => item.state === "ok").length,
    redirect: results.filter((item) => item.state === "redirect").length,
    broken: results.filter((item) => item.state === "broken").length,
    blocked: results.filter((item) => item.state === "blocked").length,
    timeout: results.filter((item) => item.state === "timeout").length,
    unchecked: results.filter((item) => item.state === "unchecked").length,
  };

  const findings: Finding[] = [];
  const brokenItems = results.filter((item) => item.state === "broken");
  const brokenInternal = brokenItems.filter((item) => item.type === "internal");
  const brokenExternal = brokenItems.filter((item) => item.type === "external");

  if (brokenInternal.length) {
    findings.push(
      finding({
        category: "links",
        severity: "critical",
        title: `${plural(brokenInternal.length, "broken internal link")}`,
        detected: "Links that point inside the site returned HTTP errors or failed to resolve.",
        impact: "Visitors hit dead ends, and crawlers waste budget on URLs that no longer exist.",
        recommendation: "Fix or remove these URLs, and add a 301 redirect when the destination has moved.",
        evidence: brokenInternal
          .slice(0, 10)
          .map((item) => `${item.displayUrl} → HTTP ${item.status ?? "error"} (${item.error ?? "not found"})`)
          .join("\n"),
        samples: brokenInternal.slice(0, 8).map((item) => item.url),
        target: finalUrl,
        measured: true,
      }),
    );
  }

  if (brokenExternal.length) {
    findings.push(
      finding({
        category: "links",
        severity: "medium",
        title: `${plural(brokenExternal.length, "broken external link")}`,
        detected: "Outbound links returned error responses.",
        impact: "Broken outbound links reduce credibility and can indicate abandoned references.",
        recommendation: "Update the outbound URLs or remove the links that no longer resolve.",
        evidence: brokenExternal
          .slice(0, 10)
          .map((item) => `${item.displayUrl} → HTTP ${item.status ?? "error"}`)
          .join("\n"),
        samples: brokenExternal.slice(0, 8).map((item) => item.url),
        target: finalUrl,
        measured: true,
      }),
    );
  }

  const chains = results.filter((item) => (item.hops ?? 0) >= 2);
  if (chains.length) {
    findings.push(
      finding({
        category: "links",
        severity: "low",
        title: `${plural(chains.length, "redirect chain")}`,
        detected: "Some links pass through two or more redirects before reaching the final URL.",
        impact: "Each hop adds latency and can dilute link equity.",
        recommendation: "Link directly to the final destination and replace internal redirects with direct URLs.",
        evidence: chains.slice(0, 6).map((item) => `${item.displayUrl} (${item.hops} hops) → ${item.redirectTo}`).join("\n"),
        samples: chains.slice(0, 6).map((item) => item.url),
        target: finalUrl,
        measured: true,
      }),
    );
  }

  const loops = results.filter((item) => item.error?.includes("loop"));
  if (loops.length) {
    findings.push(
      finding({
        category: "links",
        severity: "medium",
        title: `${plural(loops.length, "redirect loop")}`,
        detected: "A redirect loop prevented these URLs from resolving.",
        impact: "Affected links never reach content, and browsers abort with an error.",
        recommendation: "Fix the redirect rules so the loop terminates in a real destination.",
        evidence: loops.slice(0, 5).map((item) => item.displayUrl).join("\n"),
        target: finalUrl,
        measured: true,
      }),
    );
  }

  const brokenImages = results.filter((item) => item.state === "broken" && item.url.match(/\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i));
  if (brokenImages.length) {
    findings.push(
      finding({
        category: "links",
        severity: "high",
        title: `${plural(brokenImages.length, "broken image")}`,
        detected: "Image resources referenced by the page did not load.",
        impact: "Missing images leave empty placeholders and broken visual content.",
        recommendation: "Restore or re-link the image files, and add width/height so the layout stays stable.",
        evidence: brokenImages.slice(0, 6).map((item) => `${item.displayUrl} → HTTP ${item.status ?? "error"}`).join("\n"),
        target: finalUrl,
        measured: true,
      }),
    );
  }

  const checkedWeight = results
    .filter((item) => item.state !== "blocked" && item.state !== "unchecked")
    .reduce((sum, item) => sum + (item.type === "internal" ? 3 : 1), 0);
  const brokenWeight = brokenItems.reduce((sum, item) => sum + (item.type === "internal" ? 3 : 1), 0);
  const score = checkedWeight ? Math.round(100 - (brokenWeight / checkedWeight) * 100) : null;

  return {
    score,
    coverage: results.length ? (results.length - summary.unchecked) / results.length : 0,
    findings,
    section: {
      available: results.length > 0,
      discovered: list.length,
      checked: results.filter((item) => item.state !== "unchecked").length,
      truncated,
      summary,
      items: results,
      redirectChains: results
        .filter((item) => (item.hops ?? 0) >= 2 && item.redirectTo)
        .map((item) => ({ from: item.url, to: item.redirectTo as string, hops: item.hops ?? 0 })),
      loops: loops.map((item) => ({ url: item.url })),
    },
  };
}
