/**
 * The in-page audit script.
 *
 * `auditPage` is serialised by Puppeteer and executed inside the rendered document,
 * so it must be fully self-contained: no imports and no references to outer scope.
 * It measures what only a real browser can measure (computed styles, layout boxes,
 * contrast, viewport overflow) and extracts the document metadata used by the SEO
 * and accessibility checks.
 */

export interface DomImage {
  src: string;
  alt: string | null;
  hasAlt: boolean;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  loading: string | null;
  hasDimensions: boolean;
  role: string | null;
}

export interface DomLink {
  href: string;
  text: string;
  rel: string | null;
  internal: boolean;
  target: string | null;
}

export interface DomField {
  tag: string;
  type: string;
  name: string | null;
  id: string | null;
  hasLabel: boolean;
  labelText: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  required: boolean;
}

export interface DomInteractive {
  tag: string;
  role: string | null;
  name: string;
  html: string;
  width: number;
  height: number;
  focusable: boolean;
  tabIndex: number;
}

export interface DomIssue {
  kind: string;
  detail: string;
}

export interface DomAudit {
  url: string;
  lang: string | null;
  title: string;
  meta: {
    description: string | null;
    canonical: string | null;
    robots: string | null;
    viewport: string | null;
    themeColor: string | null;
    generator: string | null;
    og: Record<string, string>;
    twitter: Record<string, string>;
    charset: string | null;
  };
  headings: { level: number; text: string }[];
  headingJumps: { from: number; to: number; text: string }[];
  images: DomImage[];
  links: DomLink[];
  fields: DomField[];
  interactive: DomInteractive[];
  landmarks: { nav: number; main: number; header: number; footer: number; aside: number; form: number };
  lists: number;
  tables: number;
  buttons: number;
  jsonLd: string[];
  mixedContent: string[];
  renderBlocking: { type: string; url: string; detail: string }[];
  ariaIssues: DomIssue[];
  smallText: { count: number; sample: string[] };
  contrast: { checked: number; failures: { text: string; ratio: number; color: string; background: string; size: number }[] };
  overflow: { scrollWidth: number; clientWidth: number; elements: { tag: string; width: number; text: string }[] };
  tapTargets: { checked: number; small: { tag: string; width: number; height: number; text: string }[] };
  focus: { positiveTabIndex: number; focusableCount: number };
  iframes: { withoutTitle: number; total: number };
  videos: { withoutCaptions: number; total: number };
  duplicates: { ids: string[] };
  inlineStyles: number;
  htmlSize: number;
  textRatio: number;
  doctype: string;
  hasSkipLink: boolean;
  viewportWidth: number;
  devicePixelRatio: number;
}

export function auditPage(): DomAudit {
  const MAX = 400;

  const visible = (el: Element): boolean => {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = (el as HTMLElement).getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const peek = (el: Element, n = 70): string => {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    return text.slice(0, n);
  };

  const describe = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const cls = el.classList.length ? `.${Array.from(el.classList).slice(0, 2).join(".")}` : "";
    return `${tag}${id}${cls}`;
  };

  const parseColor = (input: string): [number, number, number, number] | null => {
    const value = input.trim();
    if (!value || value === "transparent") return [0, 0, 0, 0];
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (match) {
      const parts = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      if (parts.length >= 3) {
        return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
      }
    }
    return null;
  };

  const luminance = (r: number, g: number, b: number): number => {
    const channel = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };

  const blend = (fg: [number, number, number, number], bg: [number, number, number, number]): [number, number, number, number] => {
    const a = fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
  };

  const backgroundOf = (el: Element): [number, number, number, number] => {
    let node: Element | null = el;
    let result: [number, number, number, number] = [255, 255, 255, 1];
    const stack: [number, number, number, number][] = [];
    while (node) {
      const style = window.getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== "none") break;
      const parsed = parseColor(style.backgroundColor);
      if (parsed && parsed[3] > 0) {
        stack.push(parsed);
        if (parsed[3] === 1) break;
      }
      node = node.parentElement;
    }
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      result = blend(stack[i], result);
    }
    return result;
  };

  const contrastRatio = (a: number[], b: number[]): number => {
    const l1 = luminance(a[0], a[1], a[2]);
    const l2 = luminance(b[0], b[1], b[2]);
    const light = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return (light + 0.05) / (dark + 0.05);
  };

  const accessibleName = (el: Element): string => {
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim();
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ")
        .trim();
      if (text) return text;
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      if (el.id) {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label?.textContent?.trim()) return label.textContent.trim();
      }
      const wrapping = el.closest("label");
      if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();
      if (el.getAttribute("title")?.trim()) return el.getAttribute("title")!.trim();
      if (el instanceof HTMLInputElement && ["submit", "button", "reset"].includes(el.type)) return el.value;
      if (el.getAttribute("placeholder")?.trim()) return el.getAttribute("placeholder")!.trim();
      return "";
    }
    if (el instanceof HTMLImageElement && el.alt) return el.alt;
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) return text.slice(0, 80);
    const title = el.getAttribute("title");
    if (title?.trim()) return title.trim();
    const img = el.querySelector("img[alt]");
    if (img?.getAttribute("alt")?.trim()) return img.getAttribute("alt")!.trim();
    const svgTitle = el.querySelector("svg title");
    if (svgTitle?.textContent?.trim()) return svgTitle.textContent.trim();
    const labelledChild = el.querySelector("[aria-label]");
    if (labelledChild?.getAttribute("aria-label")?.trim()) return labelledChild.getAttribute("aria-label")!.trim();
    return "";
  };

  const meta = (name: string): string | null => {
    const el =
      document.querySelector(`meta[name="${name}"]`) ?? document.querySelector(`meta[property="${name}"]`);
    const content = el?.getAttribute("content");
    return content && content.trim() ? content.trim() : null;
  };

  const og: Record<string, string> = {};
  document.querySelectorAll('meta[property^="og:"]').forEach((el) => {
    const key = el.getAttribute("property")!.replace("og:", "");
    const content = el.getAttribute("content");
    if (content) og[key] = content.trim();
  });

  const twitter: Record<string, string> = {};
  document.querySelectorAll('meta[name^="twitter:"]').forEach((el) => {
    const key = el.getAttribute("name")!.replace("twitter:", "");
    const content = el.getAttribute("content");
    if (content) twitter[key] = content.trim();
  });

  const headings: { level: number; text: string }[] = [];
  document.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((el) => {
    headings.push({ level: Number(el.tagName[1]), text: peek(el, 120) });
  });

  const headingJumps: { from: number; to: number; text: string }[] = [];
  for (let i = 1; i < headings.length; i += 1) {
    if (headings[i].level - headings[i - 1].level > 1) {
      headingJumps.push({ from: headings[i - 1].level, to: headings[i].level, text: headings[i].text });
    }
  }

  const images: DomImage[] = [];
  document.querySelectorAll("img").forEach((el) => {
    const img = el as HTMLImageElement;
    images.push({
      src: img.currentSrc || img.src || "",
      alt: img.getAttribute("alt"),
      hasAlt: img.hasAttribute("alt"),
      width: Math.round(img.getBoundingClientRect().width),
      height: Math.round(img.getBoundingClientRect().height),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      loading: img.getAttribute("loading"),
      hasDimensions: img.hasAttribute("width") && img.hasAttribute("height"),
      role: img.getAttribute("role"),
    });
  });

  const viewportWidth = window.innerWidth;
  const normalize = (href: string): string => {
    try {
      return new URL(href, document.baseURI).toString();
    } catch {
      return href;
    }
  };

  const links: DomLink[] = [];
  const seenLinks = new Set<string>();
  document.querySelectorAll("a[href]").forEach((el) => {
    if (links.length >= MAX) return;
    const raw = el.getAttribute("href") ?? "";
    if (!raw || raw.startsWith("#") || /^(mailto:|tel:|javascript:|sms:|data:)/i.test(raw)) return;
    const href = normalize(raw);
    if (seenLinks.has(href)) return;
    seenLinks.add(href);
    let internal = false;
    try {
      internal = new URL(href).hostname === location.hostname;
    } catch {
      internal = false;
    }
    links.push({
      href,
      text: peek(el, 80),
      rel: el.getAttribute("rel"),
      internal,
      target: el.getAttribute("target"),
    });
  });

  const fields: DomField[] = [];
  document.querySelectorAll("input, select, textarea").forEach((el) => {
    const input = el as HTMLInputElement;
    const type = (input.getAttribute("type") ?? (el.tagName === "INPUT" ? "text" : el.tagName.toLowerCase())).toLowerCase();
    if (["hidden", "submit", "reset", "button", "image"].includes(type)) return;
    let hasLabel = false;
    let labelText: string | null = null;
    if (input.id) {
      const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (label?.textContent?.trim()) {
        hasLabel = true;
        labelText = label.textContent.trim().slice(0, 80);
      }
    }
    if (!hasLabel) {
      const wrapping = el.closest("label");
      if (wrapping?.textContent?.trim()) {
        hasLabel = true;
        labelText = wrapping.textContent.trim().slice(0, 80);
      }
    }
    const ariaLabel = el.getAttribute("aria-label");
    const ariaLabelledBy = el.getAttribute("aria-labelledby");
    if (!hasLabel && (ariaLabel?.trim() || ariaLabelledBy)) hasLabel = true;
    fields.push({
      tag: el.tagName.toLowerCase(),
      type,
      name: el.getAttribute("name"),
      id: el.getAttribute("id"),
      hasLabel,
      labelText,
      placeholder: el.getAttribute("placeholder"),
      ariaLabel: ariaLabel ?? null,
      required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
    });
  });

  const interactive: DomInteractive[] = [];
  const interactiveSelector =
    'a[href], button, [role="button"], [role="link"], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  document.querySelectorAll(interactiveSelector).forEach((el) => {
    if (interactive.length >= 600) return;
    if (!visible(el)) return;
    const rect = (el as HTMLElement).getBoundingClientRect();
    const tabAttr = el.getAttribute("tabindex");
    const nativeFocusable =
      ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) ||
      el.getAttribute("role") === "button" ||
      el.getAttribute("role") === "link";
    interactive.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role"),
      name: accessibleName(el),
      html: el.outerHTML.slice(0, 160).replace(/\s+/g, " "),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      focusable: nativeFocusable || tabAttr !== null,
      tabIndex: tabAttr ? Number(tabAttr) : 0,
    });
  });

  const tapSmall: { tag: string; width: number; height: number; text: string }[] = [];
  let tapChecked = 0;
  document.querySelectorAll(interactiveSelector).forEach((el) => {
    if (!visible(el)) return;
    const rect = (el as HTMLElement).getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    if (rect.width > window.innerWidth * 0.98) return;
    tapChecked += 1;
    if (rect.width < 24 || rect.height < 24) {
      if (tapSmall.length < 12) {
        tapSmall.push({
          tag: describe(el),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          text: peek(el, 50),
        });
      }
    }
  });

  const smallTextSample: string[] = [];
  let smallTextCount = 0;
  const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT);
  const textParents = new Set<Element>();
  let node: Node | null = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && (node.textContent ?? "").trim().length > 3) textParents.add(parent);
    node = walker.nextNode();
  }

  let contrastChecked = 0;
  const contrastFailures: { text: string; ratio: number; color: string; background: string; size: number }[] = [];
  const parents = Array.from(textParents).slice(0, 500);
  for (const el of parents) {
    if (!visible(el)) continue;
    const style = window.getComputedStyle(el);
    const fontSize = Number.parseFloat(style.fontSize);
    if (style.visibility === "hidden") continue;
    if (fontSize && fontSize < 12 && smallTextCount < 500) {
      // Only count genuinely small body text, not icon fonts or zero-height nodes.
      smallTextCount += 1;
      if (smallTextSample.length < 6) smallTextSample.push(`${describe(el)} · ${fontSize}px`);
    }

    if (contrastChecked >= 260) continue;
    const fg = parseColor(style.color);
    if (!fg || fg[3] === 0) continue;
    const bg = backgroundOf(el);
    const composited = blend(fg, bg);
    const ratio = contrastRatio(composited, bg);
    contrastChecked += 1;
    const bold = (Number.parseInt(style.fontWeight, 10) || 400) >= 700;
    const isLarge = fontSize >= 24 || (bold && fontSize >= 18.66);
    const required = isLarge ? 3 : 4.5;
    if (ratio + 0.05 < required && (el.textContent ?? "").trim().length > 2) {
      if (contrastFailures.length < 10) {
        contrastFailures.push({
          text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
          ratio: Math.round(ratio * 100) / 100,
          color: style.color,
          background: `rgb(${Math.round(bg[0])}, ${Math.round(bg[1])}, ${Math.round(bg[2])})`,
          size: Math.round(fontSize * 10) / 10,
        });
      }
    }
  }

  const ariaIssues: DomIssue[] = [];
  document.querySelectorAll('[aria-hidden="true"]').forEach((el) => {
    if (el.querySelector('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')) {
      if (ariaIssues.length < 8) ariaIssues.push({ kind: "aria-hidden-focusable", detail: describe(el) });
    }
  });
  document.querySelectorAll("[role]").forEach((el) => {
    const role = el.getAttribute("role") ?? "";
    const known = [
      "alert", "alertdialog", "application", "article", "banner", "button", "cell", "checkbox", "columnheader",
      "combobox", "complementary", "contentinfo", "definition", "dialog", "directory", "document", "feed",
      "figure", "form", "grid", "gridcell", "group", "heading", "img", "link", "list", "listbox", "listitem",
      "log", "main", "marquee", "math", "menu", "menubar", "menuitem", "menuitemcheckbox", "menuitemradio",
      "navigation", "none", "note", "option", "presentation", "progressbar", "radio", "radiogroup", "region",
      "row", "rowgroup", "rowheader", "scrollbar", "search", "searchbox", "separator", "slider", "spinbutton",
      "status", "switch", "tab", "table", "tablist", "tabpanel", "term", "textbox", "timer", "toolbar",
      "tooltip", "tree", "treegrid", "treeitem",
    ];
    if (role && !known.includes(role) && ariaIssues.length < 12) {
      ariaIssues.push({ kind: "invalid-role", detail: `${describe(el)} role="${role}"` });
    }
  });
  document.querySelectorAll(interactiveSelector).forEach((el) => {
    if (ariaIssues.length >= 16) return;
    if (!visible(el)) return;
    const name = accessibleName(el);
    if (!name) {
      ariaIssues.push({ kind: "unnamed-interactive", detail: el.outerHTML.slice(0, 120).replace(/\s+/g, " ") });
    }
  });

  const idCounts = new Map<string, number>();
  document.querySelectorAll("[id]").forEach((el) => {
    const id = el.id;
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  });
  const duplicateIds: string[] = [];
  idCounts.forEach((count, id) => {
    if (count > 1 && duplicateIds.length < 6) duplicateIds.push(id);
  });

  const mixedContent: string[] = [];
  if (location.protocol === "https:") {
    document.querySelectorAll("[src], [href]").forEach((el) => {
      const value = el.getAttribute("src") ?? el.getAttribute("href") ?? "";
      if (/^http:\/\//i.test(value) && mixedContent.length < 10) mixedContent.push(value);
    });
  }

  const renderBlocking: { type: string; url: string; detail: string }[] = [];
  document.querySelectorAll("head script[src]").forEach((el) => {
    const async = el.hasAttribute("async");
    const defer = el.hasAttribute("defer");
    const type = (el.getAttribute("type") ?? "").toLowerCase();
    if (!async && !defer && type !== "module" && renderBlocking.length < 10) {
      renderBlocking.push({
        type: "script",
        url: (el as HTMLScriptElement).src,
        detail: "Synchronous script in <head> blocks first paint",
      });
    }
  });
  document.querySelectorAll('head link[rel="stylesheet"][href]').forEach((el) => {
    const media = el.getAttribute("media");
    if (media && media !== "all" && media !== "screen") return;
    if (renderBlocking.length < 14) {
      renderBlocking.push({
        type: "stylesheet",
        url: (el as HTMLLinkElement).href,
        detail: "Stylesheet in <head> blocks rendering",
      });
    }
  });

  const overflowElements: { tag: string; width: number; text: string }[] = [];
  const docWidth = document.documentElement.scrollWidth;
  document.querySelectorAll("body *").forEach((el) => {
    if (overflowElements.length >= 8) return;
    if (!visible(el)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > viewportWidth + 2 && rect.right > viewportWidth + 2) {
      const style = window.getComputedStyle(el);
      if (style.position === "fixed" || style.position === "absolute") return;
      if (el.closest("[aria-hidden='true']")) return;
      overflowElements.push({ tag: describe(el), width: Math.round(rect.width), text: peek(el, 50) });
    }
  });

  const jsonLd: string[] = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
    try {
      const parsed = JSON.parse(el.textContent ?? "{}");
      const collect = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {
          value.forEach(collect);
          return;
        }
        const obj = value as Record<string, unknown>;
        if (typeof obj["@type"] === "string") jsonLd.push(obj["@type"] as string);
        if (Array.isArray(obj["@type"])) obj["@type"].forEach((t) => typeof t === "string" && jsonLd.push(t));
        if (obj["@graph"]) collect(obj["@graph"]);
        if (obj.mainEntity) collect(obj.mainEntity);
      };
      collect(parsed);
    } catch {
      /* invalid JSON-LD is reported separately by the SEO checks via block count */
    }
  });

  const html = document.documentElement.outerHTML;
  const textContent = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
  const inlineStyles = document.querySelectorAll("[style]").length;
  const skipLink = Array.from(document.querySelectorAll("a[href]")).some((el) => {
    const target = el.getAttribute("href") ?? "";
    const text = (el.textContent ?? "").toLowerCase();
    return target.startsWith("#") && /skip|jump/.test(text);
  });

  return {
    url: location.href,
    lang: document.documentElement.getAttribute("lang"),
    title: (document.title ?? "").trim(),
    meta: {
      description: meta("description"),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
      robots: meta("robots"),
      viewport: meta("viewport"),
      themeColor: meta("theme-color"),
      generator: meta("generator"),
      og,
      twitter,
      charset: document.characterSet ?? null,
    },
    headings,
    headingJumps,
    images,
    links,
    fields,
    interactive,
    landmarks: {
      nav: document.querySelectorAll("nav, [role='navigation']").length,
      main: document.querySelectorAll("main, [role='main']").length,
      header: document.querySelectorAll("header, [role='banner']").length,
      footer: document.querySelectorAll("footer, [role='contentinfo']").length,
      aside: document.querySelectorAll("aside, [role='complementary']").length,
      form: document.querySelectorAll("form").length,
    },
    lists: document.querySelectorAll("ul, ol").length,
    tables: document.querySelectorAll("table").length,
    buttons: document.querySelectorAll("button, [role='button']").length,
    jsonLd,
    mixedContent,
    renderBlocking,
    ariaIssues,
    smallText: { count: smallTextCount, sample: smallTextSample },
    contrast: { checked: contrastChecked, failures: contrastFailures },
    overflow: { scrollWidth: docWidth, clientWidth: document.documentElement.clientWidth, elements: overflowElements },
    tapTargets: { checked: tapChecked, small: tapSmall },
    focus: {
      positiveTabIndex: document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').length,
      focusableCount: interactive.length,
    },
    iframes: {
      total: document.querySelectorAll("iframe").length,
      withoutTitle: Array.from(document.querySelectorAll("iframe")).filter((el) => !el.getAttribute("title")?.trim()).length,
    },
    videos: {
      total: document.querySelectorAll("video").length,
      withoutCaptions: Array.from(document.querySelectorAll("video")).filter(
        (el) => !el.querySelector("track[kind='captions'],track[kind='subtitles']"),
      ).length,
    },
    duplicates: { ids: duplicateIds },
    inlineStyles,
    htmlSize: html.length,
    textRatio: html.length ? Math.round((textContent.length / html.length) * 1000) / 1000 : 0,
    doctype: document.doctype ? `<!DOCTYPE ${document.doctype.name}>` : "",
    hasSkipLink: skipLink,
    viewportWidth,
    devicePixelRatio: window.devicePixelRatio,
  };
}
