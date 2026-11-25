/**
 * Static audit fallback.
 *
 * When no browser session is available (for example a blocked bot or a runtime without
 * Chromium), LENS still inspects the delivered HTML for metadata, markup accessibility
 * and link structure. Everything that requires layout or computed styles stays
 * explicitly unavailable — the report never claims otherwise.
 */

import * as cheerio from "cheerio";
import type { DomAudit, DomField, DomImage, DomInteractive, DomLink } from "./audit-script";

export function auditHtml(html: string, finalUrl: string): DomAudit {
  const $ = cheerio.load(html);
  const base = (() => {
    try {
      return new URL(finalUrl);
    } catch {
      return null;
    }
  })();

  const resolve = (href: string): string => {
    try {
      return new URL(href, finalUrl).toString();
    } catch {
      return href;
    }
  };

  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, element) => {
    const key = ($(element).attr("property") ?? "").replace("og:", "");
    const content = $(element).attr("content");
    if (key && content) og[key] = content.trim();
  });

  const twitter: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, element) => {
    const key = ($(element).attr("name") ?? "").replace("twitter:", "");
    const content = $(element).attr("content");
    if (key && content) twitter[key] = content.trim();
  });

  const tagOf = (element: unknown): string => ($(element as Parameters<typeof $>[0]).prop("tagName") ?? "element").toLowerCase();

  const headings: { level: number; text: string }[] = [];
  $("h1,h2,h3,h4,h5,h6").each((_, element) => {
    headings.push({
      level: Number(tagOf(element)[1] ?? 1),
      text: $(element).text().replace(/\s+/g, " ").trim().slice(0, 120),
    });
  });

  const headingJumps: { from: number; to: number; text: string }[] = [];
  for (let i = 1; i < headings.length; i += 1) {
    if (headings[i].level - headings[i - 1].level > 1) {
      headingJumps.push({ from: headings[i - 1].level, to: headings[i].level, text: headings[i].text });
    }
  }

  const images: DomImage[] = [];
  $("img").each((_, element) => {
    const src = $(element).attr("src") ?? "";
    images.push({
      src: src ? resolve(src) : "",
      alt: $(element).attr("alt") ?? null,
      hasAlt: $(element).attr("alt") !== undefined,
      width: 0,
      height: 0,
      naturalWidth: 0,
      naturalHeight: 0,
      loading: $(element).attr("loading") ?? null,
      hasDimensions: $(element).attr("width") !== undefined && $(element).attr("height") !== undefined,
      role: $(element).attr("role") ?? null,
    });
  });

  const links: DomLink[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, element) => {
    const raw = $(element).attr("href") ?? "";
    if (!raw || raw.startsWith("#") || /^(mailto:|tel:|javascript:|sms:|data:)/i.test(raw)) return;
    const href = resolve(raw);
    if (seen.has(href)) return;
    seen.add(href);
    let internal = false;
    try {
      internal = new URL(href).hostname === base?.hostname;
    } catch {
      internal = false;
    }
    links.push({
      href,
      text: $(element).text().replace(/\s+/g, " ").trim().slice(0, 80),
      rel: $(element).attr("rel") ?? null,
      internal,
      target: $(element).attr("target") ?? null,
    });
  });

  const fields: DomField[] = [];
  $("input, select, textarea").each((_, element) => {
    const type = ($(element).attr("type") ?? tagOf(element)).toLowerCase();
    if (["hidden", "submit", "reset", "button", "image"].includes(type)) return;
    const id = $(element).attr("id") ?? null;
    const ariaLabel = $(element).attr("aria-label") ?? null;
    const ariaLabelledBy = $(element).attr("aria-labelledby") ?? null;
    let labelText: string | null = null;
    if (id) {
      const label = $(`label[for="${id.replace(/"/g, '\\"')}"]`).first();
      if (label.length) labelText = label.text().trim().slice(0, 80);
    }
    if (!labelText) {
      const wrapping = $(element).closest("label");
      if (wrapping.length) labelText = wrapping.text().trim().slice(0, 80);
    }
    fields.push({
      tag: tagOf(element),
      type,
      name: $(element).attr("name") ?? null,
      id,
      hasLabel: Boolean(labelText || ariaLabel || ariaLabelledBy),
      labelText,
      placeholder: $(element).attr("placeholder") ?? null,
      ariaLabel,
      required: $(element).attr("required") !== undefined || $(element).attr("aria-required") === "true",
    });
  });

  const interactive: DomInteractive[] = [];
  const nameOf = (el: ReturnType<typeof $>): string => {
    const labelledBy = (el.attr("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
    const labelledText = labelledBy.map((id) => $(`#${id}`).text().trim()).join(" ").trim();
    return (
      (el.attr("aria-label") ?? "").trim() ||
      labelledText ||
      el.find("svg title").first().text().trim() ||
      el.find("img[alt]").first().attr("alt")?.trim() ||
      el.find("[aria-label]").first().attr("aria-label")?.trim() ||
      el.text().replace(/\s+/g, " ").trim().slice(0, 80) ||
      (el.attr("title") ?? "").trim() ||
      (el.attr("alt") ?? "").trim() ||
      (el.is("input") ? (el.attr("value") ?? "") : "") ||
      (el.attr("placeholder") ?? "").trim()
    );
  };

  $('a[href], button, [role="button"], [role="link"], input:not([type="hidden"]), select, textarea').each((_, element) => {
    const el = $(element);
    const name = nameOf(el);
    interactive.push({
      tag: tagOf(element),
      role: el.attr("role") ?? null,
      name,
      html: $.html(element).slice(0, 160).replace(/\s+/g, " "),
      width: 0,
      height: 0,
      focusable: true,
      tabIndex: Number(el.attr("tabindex") ?? 0),
    });
  });

  const mixedContent: string[] = [];
  const isHttps = finalUrl.startsWith("https://");
  if (isHttps) {
    $("[src], [href]").each((_, element) => {
      const value = $(element).attr("src") ?? $(element).attr("href") ?? "";
      if (/^http:\/\//i.test(value) && mixedContent.length < 10) mixedContent.push(value);
    });
  }

  const renderBlocking: { type: string; url: string; detail: string }[] = [];
  $("head script[src]").each((_, element) => {
    const el = $(element);
    const type = (el.attr("type") ?? "").toLowerCase();
    if (!el.attr("async") && !el.attr("defer") && type !== "module" && renderBlocking.length < 10) {
      renderBlocking.push({ type: "script", url: resolve(el.attr("src") ?? ""), detail: "Synchronous script in <head>" });
    }
  });
  $('head link[rel="stylesheet"][href]').each((_, element) => {
    if (renderBlocking.length < 14) {
      renderBlocking.push({ type: "stylesheet", url: resolve($(element).attr("href") ?? ""), detail: "Stylesheet in <head>" });
    }
  });

  const jsonLd: string[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const parsed = JSON.parse($(element).text() || "{}");
      const collect = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) return value.forEach(collect);
        const obj = value as Record<string, unknown>;
        if (typeof obj["@type"] === "string") jsonLd.push(obj["@type"] as string);
        if (Array.isArray(obj["@type"])) obj["@type"].forEach((t) => typeof t === "string" && jsonLd.push(t));
        if (obj["@graph"]) collect(obj["@graph"]);
      };
      collect(parsed);
    } catch {
      /* ignore malformed JSON-LD */
    }
  });

  const ariaIssues: { kind: string; detail: string }[] = [];
  $('[aria-hidden="true"]').each((_, element) => {
    if ($(element).find('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])').length && ariaIssues.length < 8) {
      ariaIssues.push({ kind: "aria-hidden-focusable", detail: tagOf(element) });
    }
  });

  const idCounts = new Map<string, number>();
  $("[id]").each((_, element) => {
    const id = $(element).attr("id") ?? "";
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  });
  const duplicateIds: string[] = [];
  idCounts.forEach((count, id) => {
    if (count > 1 && duplicateIds.length < 6) duplicateIds.push(id);
  });

  const text = $("body").text().replace(/\s+/g, " ").trim();

  return {
    url: finalUrl,
    lang: $("html").attr("lang") ?? null,
    title: ($("title").first().text() ?? "").trim(),
    meta: {
      description: $('meta[name="description"]').attr("content")?.trim() ?? null,
      canonical: $('link[rel="canonical"]').attr("href") ? resolve($('link[rel="canonical"]').attr("href")!) : null,
      robots: $('meta[name="robots"]').attr("content")?.trim() ?? null,
      viewport: $('meta[name="viewport"]').attr("content")?.trim() ?? null,
      themeColor: $('meta[name="theme-color"]').attr("content")?.trim() ?? null,
      generator: $('meta[name="generator"]').attr("content")?.trim() ?? null,
      og,
      twitter,
      charset: $("meta[charset]").attr("charset") ?? null,
    },
    headings,
    headingJumps,
    images,
    links,
    fields,
    interactive,
    landmarks: {
      nav: $("nav, [role='navigation']").length,
      main: $("main, [role='main']").length,
      header: $("header, [role='banner']").length,
      footer: $("footer, [role='contentinfo']").length,
      aside: $("aside, [role='complementary']").length,
      form: $("form").length,
    },
    lists: $("ul, ol").length,
    tables: $("table").length,
    buttons: $("button, [role='button']").length,
    jsonLd,
    mixedContent,
    renderBlocking,
    ariaIssues,
    smallText: { count: 0, sample: [] },
    contrast: { checked: 0, failures: [] },
    overflow: { scrollWidth: 0, clientWidth: 0, elements: [] },
    tapTargets: { checked: 0, small: [] },
    focus: {
      positiveTabIndex: $('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').length,
      focusableCount: interactive.length,
    },
    iframes: {
      total: $("iframe").length,
      withoutTitle: $("iframe").filter((_, element) => !$(element).attr("title")).length,
    },
    videos: {
      total: $("video").length,
      withoutCaptions: $("video").filter((_, element) => $(element).find("track[kind='captions'],track[kind='subtitles']").length === 0).length,
    },
    duplicates: { ids: duplicateIds },
    inlineStyles: $("[style]").length,
    htmlSize: html.length,
    textRatio: html.length ? Math.round((text.length / html.length) * 1000) / 1000 : 0,
    doctype: /<!doctype html/i.test(html) ? "<!DOCTYPE html>" : "",
    hasSkipLink: $("a[href^='#']").filter((_, element) => /skip|jump/i.test($(element).text())).length > 0,
    viewportWidth: 390,
    devicePixelRatio: 1,
  };
}
