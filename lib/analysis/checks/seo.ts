/** SEO inspection based on the rendered document and a small number of HTTP fetches. */

import type { Check, Finding, SeoSection } from "@/lib/types";
import type { DomAudit } from "../audit-script";
import { fetchText } from "@/lib/http/safe-fetch";
import { finding, plural } from "../findings";

export interface SeoResult {
  section: SeoSection;
  findings: Finding[];
  score: number | null;
  coverage: number;
}

export async function buildSeo(options: {
  audit: DomAudit;
  finalUrl: string;
  origin: string;
  status: number;
  signal?: AbortSignal;
}): Promise<SeoResult> {
  const { audit, finalUrl, origin, status } = options;
  const findings: Finding[] = [];
  const checks: Check[] = [];

  const title = audit.title || null;
  const titleLength = title?.length ?? 0;
  if (!title) {
    findings.push(
      finding({
        category: "seo",
        severity: "critical",
        title: "Missing page title",
        detected: "The document has no <title> element.",
        impact: "Search results show a generated or empty title, and browser tabs are unidentifiable.",
        recommendation: "Add a unique, descriptive <title> of roughly 15–60 characters that states the page and brand.",
        target: finalUrl,
      }),
    );
    checks.push({ id: "title", label: "Title tag", status: "fail", detail: "No title element found." });
  } else if (titleLength > 65) {
    findings.push(
      finding({
        category: "seo",
        severity: "low",
        title: "Title tag is longer than 65 characters",
        detected: `The title is ${titleLength} characters long.`,
        impact: "Long titles are truncated in search results, hiding the end of the message.",
        recommendation: "Shorten the title so the primary keyword and brand fit within roughly 60 characters.",
        evidence: title,
        target: finalUrl,
      }),
    );
    checks.push({ id: "title", label: "Title tag", status: "warn", detail: `${titleLength} characters.` });
  } else {
    checks.push({ id: "title", label: "Title tag", status: "pass", detail: title });
  }

  const description = audit.meta.description;
  const descriptionLength = description?.length ?? 0;
  if (!description) {
    findings.push(
      finding({
        category: "seo",
        severity: "medium",
        title: "Missing meta description",
        detected: "No meta description was found.",
        impact: "Search engines generate their own snippet, which is usually less relevant and lowers click-through.",
        recommendation: "Add a 120–160 character meta description that describes this specific page.",
        target: finalUrl,
      }),
    );
    checks.push({ id: "description", label: "Meta description", status: "fail", detail: "Not present." });
  } else if (descriptionLength < 50) {
    checks.push({ id: "description", label: "Meta description", status: "warn", detail: `${descriptionLength} characters — quite short.` });
  } else if (descriptionLength > 170) {
    checks.push({ id: "description", label: "Meta description", status: "warn", detail: `${descriptionLength} characters — likely truncated.` });
  } else {
    checks.push({ id: "description", label: "Meta description", status: "pass", detail: `${descriptionLength} characters.` });
  }

  const robots = audit.meta.robots;
  const noindex = Boolean(robots && /noindex/i.test(robots));
  if (noindex) {
    findings.push(
      finding({
        category: "seo",
        severity: "critical",
        title: "Page is marked noindex",
        detected: `The meta robots directive is “${robots}”.`,
        impact: "Search engines are told not to index this page, so it cannot rank at all.",
        recommendation: "Remove noindex if the page should appear in search results.",
        evidence: robots ?? undefined,
        target: finalUrl,
      }),
    );
    checks.push({ id: "robots", label: "Indexability", status: "fail", detail: robots ?? "noindex" });
  } else {
    checks.push({
      id: "robots",
      label: "Indexability",
      status: "pass",
      detail: robots ? `robots: ${robots}` : "No restrictive robots directive.",
    });
  }

  if (status >= 400) {
    findings.push(
      finding({
        category: "seo",
        severity: "critical",
        title: `Main document returned HTTP ${status}`,
        detected: `The analysed page responded with status ${status}.`,
        impact: "Error pages are not indexed and cannot serve as a landing page.",
        recommendation: "Fix the server response for this URL, or link to a working page instead.",
        target: finalUrl,
      }),
    );
  }

  const canonical = audit.meta.canonical;
  if (!canonical) {
    findings.push(
      finding({
        category: "seo",
        severity: "low",
        title: "No canonical URL declared",
        detected: "The page does not declare rel=canonical.",
        impact: "When the same content is reachable under several URLs, search engines may split ranking signals.",
        recommendation: "Add <link rel=\"canonical\" href=\"…\"> with the preferred absolute URL.",
        target: finalUrl,
      }),
    );
    checks.push({ id: "canonical", label: "Canonical URL", status: "warn", detail: "Not declared." });
  } else {
    checks.push({ id: "canonical", label: "Canonical URL", status: "pass", detail: canonical });
  }

  const h1s = audit.headings.filter((heading) => heading.level === 1);
  if (h1s.length === 0) {
    findings.push(
      finding({
        category: "seo",
        severity: "medium",
        title: "No H1 heading",
        detected: "The page has no level-one heading.",
        impact: "Both search engines and assistive technology use the H1 to understand the page's main topic.",
        recommendation: "Add exactly one H1 that describes the page content.",
        target: finalUrl,
      }),
    );
    checks.push({ id: "h1", label: "Primary heading", status: "fail", detail: "No H1." });
  } else if (h1s.length > 1) {
    findings.push(
      finding({
        category: "seo",
        severity: "low",
        title: `Multiple H1 headings (${h1s.length})`,
        detected: `${h1s.length} level-one headings were found on the page.`,
        impact: "Multiple H1s dilute the topical signal and can confuse document outline navigation.",
        recommendation: "Keep a single H1 and use H2/H3 for section structure.",
        evidence: h1s.map((heading) => heading.text).join(" · "),
        target: finalUrl,
      }),
    );
    checks.push({ id: "h1", label: "Primary heading", status: "warn", detail: `${h1s.length} H1 elements.` });
  } else {
    checks.push({ id: "h1", label: "Primary heading", status: "pass", detail: h1s[0].text || "(empty heading)" });
  }

  const og = audit.meta.og;
  if (!og.title || !og.description) {
    findings.push(
      finding({
        category: "seo",
        severity: "medium",
        title: "Incomplete Open Graph metadata",
        detected: `Open Graph ${[!og.title && "title", !og.description && "description", !og.image && "image"].filter(Boolean).join(", ")} missing.`,
        impact: "Links shared on social platforms and chat apps render without a proper preview card.",
        recommendation: "Add og:title, og:description, og:image and og:url; add twitter:card for X/Twitter.",
        target: finalUrl,
      }),
    );
    checks.push({
      id: "open-graph",
      label: "Open Graph",
      status: "warn",
      detail: Object.keys(og).length ? `${Object.keys(og).length} tags, incomplete` : "Not present.",
    });
  } else {
    checks.push({ id: "open-graph", label: "Open Graph", status: "pass", detail: `${Object.keys(og).length} tags.` });
  }

  const jsonLdBlocks = audit.jsonLd.length;
  if (!jsonLdBlocks) {
    findings.push(
      finding({
        category: "seo",
        severity: "low",
        title: "No structured data",
        detected: "No JSON-LD structured data with a recognised @type was found.",
        impact: "Without structured data the page is ineligible for rich results such as breadcrumbs, articles or FAQ snippets.",
        recommendation: "Add schema.org JSON-LD for the page type (Organization, WebSite, Article, Product…).",
        target: finalUrl,
      }),
    );
    checks.push({ id: "structured-data", label: "Structured data", status: "warn", detail: "None found." });
  } else {
    checks.push({
      id: "structured-data",
      label: "Structured data",
      status: "pass",
      detail: Array.from(new Set(audit.jsonLd)).slice(0, 6).join(", "),
    });
  }

  const robotsUrl = `${origin}/robots.txt`;
  let sitemapGuess = `${origin}/sitemap.xml`;
  const [robotsTxt, initialSitemap] = await Promise.all([
    fetchText(robotsUrl, 6_000, 128_000),
    fetchText(sitemapGuess, 6_000, 512_000),
  ]);

  const robotsAvailable = Boolean(robotsTxt && robotsTxt.status === 200);
  const validSitemap = (response: typeof initialSitemap) =>
    Boolean(response && response.status === 200 && /<urlset|<sitemapindex/i.test(response.body));

  let sitemap = initialSitemap;
  if (!validSitemap(sitemap) && robotsAvailable) {
    // Robots.txt may point somewhere other than /sitemap.xml — that is the authoritative declaration.
    const declared = (robotsTxt?.body ?? "")
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*sitemap:\s*(\S+)/i)?.[1])
      .filter((value): value is string => Boolean(value))
      .filter((value) => {
        try {
          return new URL(value).hostname === new URL(origin).hostname;
        } catch {
          return false;
        }
      });
    for (const candidate of declared.slice(0, 3)) {
      const fetched = await fetchText(candidate, 6_000, 512_000);
      if (validSitemap(fetched)) {
        sitemap = fetched;
        sitemapGuess = candidate;
        break;
      }
    }
  }

  const sitemapAvailable = validSitemap(sitemap);

  if (!robotsAvailable) {
    findings.push(
      finding({
        category: "seo",
        severity: "low",
        title: "robots.txt is not available",
        detected: `No robots.txt was returned at ${robotsUrl}.`,
        impact: "Crawlers receive no explicit crawling rules or sitemap reference.",
        recommendation: "Publish a robots.txt that references the sitemap and states crawl rules.",
        target: robotsUrl,
      }),
    );
  }
  checks.push({
    id: "robots-txt",
    label: "robots.txt",
    status: robotsAvailable ? "pass" : "warn",
    detail: robotsAvailable ? `HTTP ${robotsTxt?.status}` : "Not available",
  });

  if (!sitemapAvailable) {
    findings.push(
      finding({
        category: "seo",
        severity: "medium",
        title: "No XML sitemap found at /sitemap.xml",
        detected: `No valid sitemap document was returned at ${sitemapGuess}.`,
        impact: "Without a sitemap, discovery of deeper pages depends entirely on internal links.",
        recommendation: "Publish an XML sitemap and reference it from robots.txt.",
        target: sitemapGuess,
      }),
    );
  }
  checks.push({
    id: "sitemap",
    label: "XML sitemap",
    status: sitemapAvailable ? "pass" : "warn",
    detail: sitemapAvailable ? `HTTP ${sitemap?.status}` : "Not found at /sitemap.xml",
  });

  const images = audit.images.filter((image) => image.role !== "presentation");
  const missingAlt = images.filter((image) => !image.hasAlt || (image.alt === "" && image.width > 60));
  if (images.length && missingAlt.length / images.length > 0.2) {
    findings.push(
      finding({
        category: "seo",
        severity: "low",
        title: "Image alternative text is often missing",
        detected: `${missingAlt.length} of ${images.length} images have no alt attribute.`,
        impact: "Search engines cannot interpret image content, and screen-reader users lose that context.",
        recommendation: "Add descriptive alt text to informative images and alt=\"\" to purely decorative ones.",
        target: finalUrl,
      }),
    );
  }
  checks.push({
    id: "image-alt",
    label: "Image alt coverage",
    status: images.length === 0 ? "info" : missingAlt.length / images.length > 0.2 ? "warn" : "pass",
    detail: images.length ? `${images.length - missingAlt.length}/${images.length} images have alt text` : "No images",
  });

  const internalLinks = audit.links.filter((link) => link.internal).length;
  const externalLinks = audit.links.length - internalLinks;
  checks.push({
    id: "internal-links",
    label: "Internal linking",
    status: internalLinks < 3 ? "warn" : "pass",
    detail: `${internalLinks} internal, ${externalLinks} external links`,
  });

  const lang = audit.lang;
  if (!lang) {
    findings.push(
      finding({
        category: "seo",
        severity: "low",
        title: "Document language is not declared",
        detected: "The <html> element has no lang attribute.",
        impact: "Assistive technology and translation engines cannot reliably determine the page language.",
        recommendation: "Add an ISO language code, for example <html lang=\"en\">.",
        target: finalUrl,
      }),
    );
  }

  if (audit.htmlSize > 400_000) {
    findings.push(
      finding({
        category: "seo",
        severity: "low",
        title: "Very large HTML document",
        detected: `The rendered document is ${Math.round(audit.htmlSize / 1024)} KB.`,
        impact: "Crawlers may truncate very large documents, and every request carries the full payload.",
        recommendation: "Reduce inline data, ship less markup per page and paginate long listings.",
        target: finalUrl,
      }),
    );
  }

  const weights: Record<string, number> = {
    title: 14,
    description: 10,
    robots: 14,
    h1: 10,
    canonical: 6,
    "open-graph": 6,
    "structured-data": 6,
    "robots-txt": 6,
    sitemap: 10,
    "image-alt": 6,
    "internal-links": 6,
  };
  const passing = checks.filter((check) => check.status === "pass").reduce((sum, check) => sum + (weights[check.id] ?? 4), 0);
  const warning = checks.filter((check) => check.status === "warn").reduce((sum, check) => sum + (weights[check.id] ?? 4) * 0.45, 0);
  const total = checks.reduce((sum, check) => sum + (weights[check.id] ?? 4), 0);
  const score = noindex || status >= 400 ? Math.min(35, Math.round(((passing + warning) / total) * 100)) : Math.round(((passing + warning) / total) * 100);

  return {
    score: Math.max(0, Math.min(100, score)),
    coverage: 1,
    findings,
    section: {
      available: true,
      title,
      titleLength,
      description: description ?? null,
      descriptionLength,
      canonical: canonical ?? null,
      robotsMeta: robots ?? null,
      h1: h1s.map((heading) => heading.text),
      headings: audit.headings.slice(0, 40),
      openGraph: og,
      twitter: audit.meta.twitter,
      structuredData: { types: Array.from(new Set(audit.jsonLd)), blocks: audit.jsonLd.length ? 1 : 0 },
      sitemap: {
        url: sitemapGuess,
        available: sitemapAvailable,
        status: sitemap?.status ?? null,
        urls: sitemapAvailable ? (sitemap?.body.match(/<loc>/g)?.length ?? null) : null,
      },
      robotsTxt: { url: robotsUrl, available: robotsAvailable, status: robotsTxt?.status ?? null },
      checks,
      internalLinks,
      externalLinks,
      indexable: !noindex && status < 400,
    },
  };
}

export function seoSummary(section: SeoSection, score: number): string {
  if (!section.indexable) return "This page tells search engines not to index it, so it cannot rank.";
  if (score >= 90) return "Metadata, structure and crawlability are in good shape.";
  if (score >= 75) return `Solid foundation with ${plural(section.checks.filter((c) => c.status !== "pass").length, "item")} to tighten.`;
  if (score >= 50) return "Core metadata is present but several signals are missing or inconsistent.";
  return "Several essential SEO signals are missing from this page.";
}
