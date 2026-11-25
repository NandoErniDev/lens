/** Non-invasive security configuration overview. */

import tls from "node:tls";
import type { Check, Finding, SecurityHeader, SecuritySection } from "@/lib/types";
import { safeFetch } from "@/lib/http/safe-fetch";
import { assertSafeUrl } from "@/lib/url-safety";
import { finding, plural } from "../findings";

export interface SecurityResult {
  section: SecuritySection;
  findings: Finding[];
  score: number | null;
  coverage: number;
}

interface HeaderSpec {
  name: string;
  weight: number;
  severity: "high" | "medium" | "low" | null;
  describe: (value: string | null) => string;
}

const HEADERS: HeaderSpec[] = [
  {
    name: "strict-transport-security",
    weight: 15,
    severity: "high",
    describe: (value) =>
      value
        ? `HSTS active — ${value}`
        : "Missing: the browser is not told to always use HTTPS for this host.",
  },
  {
    name: "content-security-policy",
    weight: 20,
    severity: "high",
    describe: (value) =>
      value
        ? "Content Security Policy present — restricts which scripts and resources may load."
        : "Missing: any injected or third-party script runs with full privileges.",
  },
  {
    name: "x-content-type-options",
    weight: 10,
    severity: "medium",
    describe: (value) =>
      value?.toLowerCase().includes("nosniff")
        ? "nosniff enabled — MIME sniffing is prevented."
        : "Missing or not set to nosniff: browsers may interpret uploaded content as executable.",
  },
  {
    name: "referrer-policy",
    weight: 10,
    severity: "low",
    describe: (value) =>
      value ? `Referrer policy: ${value}` : "Missing: full URLs may leak to third parties through the Referer header.",
  },
  {
    name: "permissions-policy",
    weight: 8,
    severity: "low",
    describe: (value) =>
      value ? "Permissions Policy present — powerful browser features are scoped." : "Missing: camera, microphone and geolocation are available to any embedded frame.",
  },
  {
    name: "x-frame-options",
    weight: 7,
    severity: "low",
    describe: (value) =>
      value ? `Clickjacking protection: ${value}` : "Missing: the page can be framed by other sites (clickjacking risk).",
  },
];

export async function buildSecurity(options: {
  finalUrl: string;
  headers: Record<string, string>;
  mixedContent: string[];
}): Promise<SecurityResult> {
  const { finalUrl, headers, mixedContent } = options;
  const url = new URL(finalUrl);
  const findings: Finding[] = [];
  const checks: Check[] = [];

  const isHttps = url.protocol === "https:";

  // HTTP → HTTPS behaviour (only meaningful for the same host).
  let redirectedFromHttp = false;
  let redirectTarget: string | null = null;
  let httpSupported = false;

  if (isHttps) {
    try {
      const httpUrl = new URL(finalUrl);
      httpUrl.protocol = "http:";
      const response = await safeFetch(httpUrl.toString(), { method: "GET", timeoutMs: 8_000, maxBytes: 64_000, maxRedirects: 4 });
      httpSupported = response.status > 0 && response.status < 400;
      redirectedFromHttp = response.url.startsWith("https://");
      redirectTarget = response.url;
    } catch {
      httpSupported = false;
    }
  }

  const tlsInfo = isHttps ? await inspectCertificate(url.hostname) : null;

  if (!isHttps) {
    findings.push(
      finding({
        category: "security",
        severity: "critical",
        title: "Site is served without HTTPS",
        detected: `The analysed URL uses ${url.protocol}`,
        impact: "Traffic can be read and modified in transit, and browsers mark the site as not secure.",
        recommendation: "Serve the site over HTTPS and redirect all HTTP traffic to it.",
        target: finalUrl,
      }),
    );
    checks.push({ id: "https", label: "HTTPS", status: "fail", detail: "Not served over HTTPS" });
  } else {
    checks.push({ id: "https", label: "HTTPS", status: "pass", detail: "Served over HTTPS" });
  }

  if (isHttps && !redirectedFromHttp) {
    findings.push(
      finding({
        category: "security",
        severity: "medium",
        title: "HTTP version does not redirect to HTTPS",
        detected: httpSupported
          ? "The http:// version of this page responds without redirecting to HTTPS."
          : "The http:// version of this page did not answer, or answered with an error, instead of redirecting to HTTPS.",
        impact: "Visitors typing the bare domain may stay on an unencrypted connection.",
        recommendation: "Return a 301 redirect from http:// to the equivalent https:// URL.",
        target: url.origin.replace("https://", "http://"),
      }),
    );
    checks.push({ id: "http-redirect", label: "HTTP → HTTPS redirect", status: "warn", detail: "Not redirected" });
  } else if (isHttps) {
    checks.push({ id: "http-redirect", label: "HTTP → HTTPS redirect", status: "pass", detail: `301 → ${redirectTarget}` });
  }

  if (tlsInfo) {
    if (tlsInfo.error) {
      findings.push(
        finding({
          category: "security",
          severity: "critical",
          title: "TLS certificate could not be validated",
          detected: tlsInfo.error,
          impact: "Browsers show a warning interstitial and users cannot trust the connection.",
          recommendation: "Install a valid certificate that matches the hostname and is trusted by public clients.",
          target: url.hostname,
        }),
      );
      checks.push({ id: "tls", label: "Certificate", status: "fail", detail: tlsInfo.error });
    } else {
      const days = tlsInfo.daysRemaining;
      if (days !== null && days < 14) {
        findings.push(
          finding({
            category: "security",
            severity: days < 0 ? "critical" : "high",
            title: days < 0 ? "TLS certificate has expired" : "TLS certificate expires soon",
            detected: days < 0 ? `The certificate expired ${Math.abs(days)} days ago.` : `The certificate expires in ${days} days.`,
            impact: "Once expired, browsers block the site with a full-page security warning.",
            recommendation: "Renew the certificate and automate renewal (for example with ACME).",
            evidence: `Valid until ${tlsInfo.validTo}`,
            target: url.hostname,
          }),
        );
      }
      checks.push({
        id: "tls",
        label: "Certificate",
        status: days !== null && days < 14 ? "warn" : "pass",
        detail: `${tlsInfo.issuer ?? "Unknown issuer"} · expires ${tlsInfo.validTo?.slice(0, 10) ?? "unknown"}`,
      });
    }
  } else if (isHttps) {
    checks.push({ id: "tls", label: "Certificate", status: "unavailable", detail: "Certificate could not be inspected" });
  }

  const securityHeaders: SecurityHeader[] = HEADERS.map((spec) => {
    const value = headers[spec.name] ?? null;
    return {
      name: spec.name,
      value,
      present: Boolean(value),
      assessment: spec.describe(value),
      severity: value ? null : spec.severity,
    };
  });

  const missing = securityHeaders.filter((header) => !header.present);
  for (const header of missing) {
    if (!header.severity) continue;
    const label = header.name
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("-");
    findings.push(
      finding({
        category: "security",
        severity: header.severity,
        title: `${label} header is missing`,
        detected: header.assessment,
        impact:
          header.name === "content-security-policy"
            ? "Without CSP, a single injected script can read cookies and exfiltrate data."
            : header.name === "strict-transport-security"
              ? "Without HSTS, the first request can be downgraded to plain HTTP."
              : "This header closes a well-known class of browser-side attacks.",
        recommendation: `Add the ${label} response header. Start in report-only mode for CSP if you need to measure impact first.`,
        target: finalUrl,
      }),
    );
    checks.push({ id: header.name, label, status: "warn", detail: "Missing" });
  }

  for (const header of securityHeaders.filter((item) => item.present)) {
    const label = header.name
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("-");
    checks.push({ id: header.name, label, status: "pass", detail: header.value?.slice(0, 70) ?? "present" });
  }

  if (mixedContent.length) {
    findings.push(
      finding({
        category: "security",
        severity: "high",
        title: `${plural(mixedContent.length, "mixed-content resource")}`,
        detected: "The HTTPS page loads resources over plain HTTP.",
        impact: "Mixed content is blocked by modern browsers or silently downgrades the page's security guarantee.",
        recommendation: "Load every subresource over HTTPS, and add upgrade-insecure-requests to the CSP once verified.",
        evidence: mixedContent.slice(0, 6).join("\n"),
        samples: mixedContent.slice(0, 6),
        target: finalUrl,
        measured: true,
      }),
    );
    checks.push({ id: "mixed-content", label: "Mixed content", status: "fail", detail: `${mixedContent.length} insecure resources` });
  } else {
    checks.push({ id: "mixed-content", label: "Mixed content", status: isHttps ? "pass" : "unavailable", detail: isHttps ? "No plain-HTTP subresources" : "Page is not HTTPS" });
  }

  const server = headers.server ?? null;
  const poweredBy = headers["x-powered-by"] ?? null;
  const exposed = Boolean(poweredBy) || Boolean(server && /\d/.test(server));
  if (poweredBy) {
    findings.push(
      finding({
        category: "security",
        severity: "low",
        title: "Framework version disclosed via X-Powered-By",
        detected: `The server advertises “${poweredBy}”.`,
        impact: "Version disclosure helps attackers target known vulnerabilities in a specific release.",
        recommendation: "Remove the X-Powered-By header (for example app.disable('x-powered-by') in Express).",
        evidence: poweredBy,
        target: finalUrl,
      }),
    );
  }
  if (server) {
    findings.push(
      finding({
        category: "security",
        severity: "info",
        title: "Server software is identifiable",
        detected: `The Server header reports “${server}”.`,
        impact: "Disclosing server software narrows the attacker's search for known issues. This is informational, not a vulnerability.",
        recommendation: "Strip or generalise the Server header if your infrastructure allows it.",
        evidence: server,
        target: finalUrl,
      }),
    );
  }

  const base = 100;
  const penalty = missing.reduce((sum, header) => {
    const spec = HEADERS.find((item) => item.name === header.name);
    return sum + (spec?.weight ?? 0);
  }, 0);
  let score = base - penalty;
  if (!isHttps) score -= 30;
  if (isHttps && !redirectedFromHttp) score -= 8;
  if (mixedContent.length) score -= 15;
  if (tlsInfo?.error) score -= 20;

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    coverage: 1,
    findings,
    section: {
      available: true,
      https: {
        supported: isHttps,
        redirectedFromHttp,
        redirectTarget,
        certificate: tlsInfo
          ? {
              subject: tlsInfo.subject,
              issuer: tlsInfo.issuer,
              validFrom: tlsInfo.validFrom,
              validTo: tlsInfo.validTo,
              daysRemaining: tlsInfo.daysRemaining,
              error: tlsInfo.error,
            }
          : null,
      },
      headers: securityHeaders,
      mixedContent: { count: mixedContent.length, samples: mixedContent.slice(0, 8) },
      serverInfo: { server, poweredBy, exposed },
      checks,
    },
  };
}

interface TlsInfo {
  subject: string | null;
  issuer: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysRemaining: number | null;
  error: string | null;
}

export async function inspectCertificate(hostname: string): Promise<TlsInfo> {
  await assertSafeUrl(new URL(`https://${hostname}`)).catch(() => undefined);
  return new Promise<TlsInfo>((resolve) => {
    let settled = false;
    const finish = (info: TlsInfo) => {
      if (settled) return;
      settled = true;
      resolve(info);
    };

    const socket = tls.connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        rejectUnauthorized: false,
        timeout: 8_000,
      },
      () => {
        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;
        const authorizationError = socket.authorizationError;
        if (!cert || !cert.valid_to) {
          finish({ subject: null, issuer: null, validFrom: null, validTo: null, daysRemaining: null, error: "No certificate was presented." });
          socket.end();
          return;
        }
        const validTo = new Date(cert.valid_to);
        const daysRemaining = Math.round((validTo.getTime() - Date.now()) / 86_400_000);
        const single = (value: string | string[] | undefined | null): string | null =>
          Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
        finish({
          subject: single(cert.subject?.CN),
          issuer: single(cert.issuer?.O) ?? single(cert.issuer?.CN),
          validFrom: cert.valid_from ? new Date(cert.valid_from).toISOString() : null,
          validTo: validTo.toISOString(),
          daysRemaining,
          error: authorized ? null : String(authorizationError ?? "Certificate chain is not trusted."),
        });
        socket.end();
      },
    );

    socket.on("error", (error) => {
      finish({ subject: null, issuer: null, validFrom: null, validTo: null, daysRemaining: null, error: error.message });
    });
    socket.setTimeout(8_000, () => {
      finish({ subject: null, issuer: null, validFrom: null, validTo: null, daysRemaining: null, error: "TLS handshake timed out." });
      socket.destroy();
    });
  });
}
