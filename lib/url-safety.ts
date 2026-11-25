/**
 * URL normalisation, validation and SSRF protection.
 *
 * LENS is a public-website auditing tool. Every outbound request — the initial page,
 * redirect destinations, subresources and link checks — passes through these guards.
 */

import dns from "node:dns/promises";
import net from "node:net";

export class UnsafeUrlError extends Error {
  constructor(
    message: string,
    public hint: string,
    public code = "unsafe_url",
  ) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".home.arpa", ".lan", ".corp", ".test"];

/** Hosts that resolve to private address space but are legitimate public DNS names. */
const ALLOWED_HOSTS = new Set<string>();

export interface ParsedTarget {
  input: string;
  url: URL;
  hostname: string;
  normalized: string;
}

/**
 * Normalise user input: trim, accept bare hostnames, add https:// by default.
 */
export function normalizeInputUrl(raw: string): ParsedTarget {
  let value = (raw ?? "").trim();
  if (!value) {
    throw new UnsafeUrlError("Enter a website address to analyse.", "For example: https://example.com");
  }
  // Strip surrounding quotes and common paste artifacts.
  value = value.replace(/^[<"'\s]+|[>"'\s]+$/g, "");
  // Handle protocol-relative input.
  if (value.startsWith("//")) value = `https:${value}`;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnsafeUrlError(
      "That address could not be parsed as a URL.",
      "Check the spelling. Example: https://example.com/pricing",
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError(
      `Only http:// and https:// addresses can be analysed (received ${url.protocol.replace(":", "")}).`,
      "LENS audits websites, not other URL schemes.",
    );
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError(
      "Addresses containing credentials are not supported.",
      "Remove the user:password@ part and try again.",
    );
  }
  if (!url.hostname || !url.hostname.includes(".") && url.hostname !== "localhost") {
    if (!net.isIP(url.hostname)) {
      throw new UnsafeUrlError(
        `“${url.hostname}” is not a complete domain name.`,
        "Use a full hostname such as example.com.",
      );
    }
  }
  if (url.hostname.length > 253) {
    throw new UnsafeUrlError("That hostname is too long.", "Check the address and try again.");
  }

  // Keep the origin clean, drop hash fragments (they never change the response).
  url.hash = "";

  return {
    input: raw,
    url,
    hostname: url.hostname.toLowerCase(),
    normalized: url.toString(),
  };
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
    if (a === 0) return true; // "this network"
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local, cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    // Only the IETF protocol assignment and TEST-NET-1 blocks are non-routable;
    // 192.0.43.0/24 (for example iana.org) is public.
    if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return true;
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && b === 51 && parts[2] === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
    if (a >= 224) return true; // multicast + reserved + broadcast
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("ff")) return true; // multicast
    if (lower.startsWith("::ffff:")) {
      const mapped = lower.replace("::ffff:", "");
      if (net.isIPv4(mapped)) return isPrivateIp(mapped);
    }
    if (lower.startsWith("64:ff9b:")) return true; // NAT64
    if (lower.startsWith("2001:db8")) return true; // documentation
    return false;
  }
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (ALLOWED_HOSTS.has(host)) return false;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  // Single-label hosts (e.g. "intranet") are never public websites.
  if (!host.includes(".") && !net.isIP(host)) return true;
  // Decimal/octal/hex IPv4 obfuscation, e.g. 2130706433 or 0x7f.1
  if (/^\d+$/.test(host)) return true;
  return false;
}

/**
 * Resolve the hostname and reject anything that points at private or internal address space.
 * Returns the resolved addresses so callers can pin requests to a vetted destination.
 */
export async function assertPublicHost(hostname: string): Promise<{ addresses: string[] }> {
  if (isBlockedHostname(hostname)) {
    throw new UnsafeUrlError(
      "That address points to a local or internal host, which LENS does not analyse.",
      "Use a publicly reachable website.",
    );
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new UnsafeUrlError(
        "That IP address is in a private, loopback or link-local range.",
        "LENS only analyses public websites.",
      );
    }
    return { addresses: [hostname] };
  }

  let records: { address: string }[];
  try {
    records = await Promise.race([
      dns.lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("dns_timeout")), 5000)),
    ]);
  } catch {
    throw new UnsafeUrlError(
      `The domain “${hostname}” could not be resolved.`,
      "Check that the domain exists and is spelled correctly.",
      "dns_error",
    );
  }
  if (!records.length) {
    throw new UnsafeUrlError(
      `The domain “${hostname}” did not resolve to any address.`,
      "Check the domain name and try again.",
      "dns_error",
    );
  }
  const addresses = records.map((r) => r.address);
  if (addresses.some((address) => isPrivateIp(address))) {
    throw new UnsafeUrlError(
      "That domain resolves to a private or internal address, so LENS will not connect to it.",
      "Only publicly hosted websites can be analysed.",
    );
  }
  return { addresses };
}

/** Full pre-flight check for a URL: scheme, hostname policy and DNS resolution. */
export async function assertSafeUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http:// and https:// URLs are supported.", "Use a public website address.");
  }
  await assertPublicHost(url.hostname);
}

/** Human-readable hostname, without the www prefix, used for report titles. */
export function displayHost(host: string): string {
  return host.replace(/^www\./, "");
}

/** Validate a URL string that came from a page (link check, subresource). */
export function isCheckableUrl(raw: string | undefined | null): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.hostname === "localhost") return false;
    return !isBlockedHostname(u.hostname);
  } catch {
    return false;
  }
}
