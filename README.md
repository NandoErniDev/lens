# LENS

**Website Intelligence & Audit Platform — see what your website is made of.**

LENS analyses any public website and turns its technical condition into one clear, evidence-backed report:
performance, mobile rendering, accessibility, technical SEO, link health and security configuration.

It is deliberately not a generic SEO tool. Every number in a report comes from a measurement that actually ran —
a real headless browser session, the delivered HTML, or the HTTP responses. Anything that could not be measured is
labelled **not assessed**, never filled in with an estimate.

- **Production:** https://lens.naerdev.ch
- **Methodology:** https://lens.naerdev.ch/methodology

---

## What LENS does

Enter a URL. LENS:

1. **Validates and normalises** the address, resolves DNS and refuses loopback, private, link-local and
   internal targets (including every redirect destination).
2. **Renders the page in Chromium** at a 390 × 844 mobile viewport with simulated Slow 4G and 4× CPU throttling,
   recording real Web Vitals (LCP, CLS, TBT, FCP, TTFB), main-thread long tasks and byte-accurate network activity.
3. **Renders three viewports** (mobile, tablet, desktop) with screenshots, and measures horizontal overflow,
   touch-target size and text size in each.
4. **Inspects the markup** for accessibility and SEO signals: alt text, form labels, heading order, landmarks,
   ARIA misuse, titles, descriptions, canonicals, robots directives, Open Graph, JSON-LD.
5. **Measures contrast** from computed styles against the nearest opaque background.
6. **Checks a prioritised sample of links and resources** for status codes, redirect chains and loops.
7. **Reviews HTTP configuration** read-only: HTTPS, HTTP→HTTPS redirect, certificate validity, HSTS, CSP,
   X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-Frame-Options, mixed content, version disclosure.
8. **Scores and explains** each category, ranks the findings that matter most, and produces a report you can
   share, print to PDF or export as CSV.

## Interface

The live interface is the reference: [lens.naerdev.ch](https://lens.naerdev.ch). A report shows the overall LENS score,
six category scores with coverage, priority fixes, filterable findings with evidence, measured performance, three
rendered viewports, accessibility and SEO check tables, a link-health table and the security configuration overview.

## Architecture

```
Browser ──► Next.js App Router (Vercel, Node runtime)
              ├── POST /api/analyze   streaming NDJSON progress + final report
              ├── GET  /api/reports   report index
              ├── /analyze            live progress UI (real stage events)
              ├── /report/[id]        report dashboard
              ├── /reports            archive + comparison picker
              ├── /compare            two-report diff
              └── /methodology        scoring model and limits
                         │
                         ▼
              lib/analysis (analysis engine)
                ├── url-safety      normalisation, DNS, SSRF guards
                ├── http/safe-fetch size/time-limited, redirect re-validation
                ├── chromium        Chromium resolution (local, serverless)
                ├── collect         render, Web Vitals, network, screenshots
                ├── audit-script    in-page measurement (styles, contrast, layout)
                ├── static-audit    HTML-only fallback (cheerio)
                ├── checks/*        performance, mobile, accessibility, seo, links, security
                ├── scoring         category + overall scoring
                └── report          assembly, priority fixes, notes
                         │
                         ▼
              lib/store/reports   Cloudflare KV (production) · filesystem (local) · memory
```

### Separation of concerns

- **Collection** produces raw evidence (`PageSnapshot`, `DomAudit`, HTTP responses) and never scores.
- **Checks** convert evidence into findings and category scores, independently per category.
- **Presentation** renders the report; it never computes a score.

Each category module can be improved without touching the others.

### Execution environment

A Lighthouse-class measurement needs a real browser. Vercel's Node runtime can run Chromium
(`@sparticuz/chromium` plus `puppeteer-core`), and each analysis is a single streamed request with a 60 s function
budget. The orchestrator enforces its own deadline and degrades honestly: if the browser cannot start or the page
blocks rendering, LENS falls back to static HTML inspection and marks performance, mobile rendering and contrast as
not assessed.

## Local development

Requirements: Node.js 20+ and a Chromium/Chrome binary.

```bash
npm install
npx puppeteer browsers install chrome   # local Chromium for measurements
cp .env.example .env.local              # optional configuration
npm run dev                             # http://localhost:3000
```

Useful commands:

```bash
npm run build        # production build
npm run typecheck    # strict TypeScript check
npx tsx scripts/test-guards.ts              # URL / SSRF guard tests
npx tsx scripts/analyze.ts https://example.com --checks   # run the engine in the terminal
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | recommended | Canonical origin used for metadata and share links |
| `CLOUDFLARE_ACCOUNT_ID` | for persistence | Cloudflare account for the KV report store |
| `CLOUDFLARE_API_TOKEN` | for persistence | Token with **Workers KV Storage: Edit** |
| `LENS_KV_NAMESPACE_ID` | for persistence | KV namespace that stores reports |
| `CHROME_PATH` | optional | Explicit Chromium executable |
| `PAGESPEED_API_KEY` | optional | Reserved for PageSpeed/CrUX enrichment |
| `LENS_DEV_ORIGIN` | optional | Extra allowed dev origin when previewing behind a proxy |

Without the three Cloudflare values the app runs with a filesystem store locally and an in-memory store on
serverless: analyses still work, but reports are not shareable by link and `/reports` only shows the browser's local
history. Secrets belong in the platform's environment settings, never in the repository.

## Analysis methodology (summary)

| Category | Weight | Basis |
| --- | --- | --- |
| Performance | 26% | Lab metric curves: LCP 26, CLS 25, TBT 21, FCP 14, transfer 9, requests 5 |
| Accessibility | 20% | Severity-weighted findings: critical −25, high −12, medium −5, low −2 |
| SEO | 19% | Weighted pass/partial/fail over eleven technical signals |
| Mobile | 16% | Viewport meta, measured overflow, touch targets, text size at three widths |
| Links | 10% | Weighted share of resolved destinations (internal ×3, external ×1) |
| Security | 9% | Transport checks plus six response headers |

The overall LENS score is the weighted mean over **assessed** categories only, so an unmeasurable check never counts
as a failure. Status bands: 90–100 Excellent, 75–89 Good, 50–74 Needs improvement, 0–49 Poor.
The full model is documented at `/methodology`.

## Limits

- One page per analysis. Link checking samples that page; it never crawls the whole site.
- Lab metrics are synthetic (throttled mobile) and vary a few percent between runs.
- Field data (Chrome UX Report) is shown only when a dataset exists for the origin.
- Rendering at viewports is not the same as testing on physical devices.
- The security overview is configuration-only: no exploitation, credential testing or vulnerability scanning.
- Indexation state in a search engine is not queried; only the page's own directives are read.

## Safety

- http/https only, public hosts only; private, loopback, link-local, CGNAT, multicast and metadata addresses are
  rejected after DNS resolution, and every redirect is re-validated before it is followed.
- Request duration, size and redirect depth are bounded; link checks are concurrency-limited.
- No credentials, cookies or personal data from analysed pages are stored.
- LENS does not bypass authentication, CAPTCHAs, paywalls, firewalls or rate limits, and it respects robots.txt for
  optional crawl-style fetches.

## License

MIT
