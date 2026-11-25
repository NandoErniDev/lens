"use client";

/**
 * Portable report links.
 *
 * When server-side report storage is not configured, a report can still be shared:
 * the report payload (without screenshots) is compressed with DEFLATE and encoded
 * into the URL fragment. The fragment is never sent to a server, and the payload is
 * exactly the report the recipient sees — no fabricated data, no shortened sample.
 */

import type { Report } from "@/lib/types";

const PREFIX = "lens1:";
const MAX_URL_LENGTH = 120_000;

export function stripScreenshots(report: Report): Report {
  const copy: Report = {
    ...report,
    mobile: {
      ...report.mobile,
      viewports: report.mobile.viewports.map((viewport) => ({
        ...viewport,
        screenshot: null,
        screenshotNote: viewport.screenshot
          ? "Screenshots are not included in portable links. Re-run the analysis to capture viewports."
          : viewport.screenshotNote,
      })),
    },
    coverage: { ...report.coverage, screenshots: false },
  };
  return copy;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deflate(input: Uint8Array): Promise<Uint8Array> {
  const blob = new Blob([input as unknown as BlobPart]);
  const stream = blob.stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(input: Uint8Array): Promise<Uint8Array> {
  const blob = new Blob([input as unknown as BlobPart]);
  const stream = blob.stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeReport(report: Report): Promise<string> {
  const payload = JSON.stringify(stripScreenshots(report));
  const bytes = new TextEncoder().encode(payload);
  const compressed = await deflate(bytes);
  return `${PREFIX}${toBase64Url(compressed)}`;
}

export async function buildPortableLink(report: Report): Promise<{ url: string; length: number; tooLong: boolean }> {
  const token = await encodeReport(report);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}/share#${token}`;
  return { url, length: url.length, tooLong: url.length > MAX_URL_LENGTH };
}

export async function decodeReport(token: string): Promise<Report | null> {
  const raw = token.startsWith(PREFIX) ? token.slice(PREFIX.length) : token;
  try {
    const bytes = fromBase64Url(raw);
    const inflated = await inflate(bytes);
    const parsed = JSON.parse(new TextDecoder().decode(inflated)) as Report;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.categories)) return null;
    return parsed;
  } catch {
    return null;
  }
}
