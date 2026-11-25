/**
 * Shared report model for LENS.
 *
 * A report is produced by the analysis pipeline, scored by the scoring engine and
 * rendered by the UI. Every measured value carries its provenance so the interface
 * can be explicit about what was measured, what was inferred and what could not
 * be determined.
 */

export type CategoryKey =
  | "performance"
  | "mobile"
  | "accessibility"
  | "seo"
  | "links"
  | "security";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type StatusLabel = "excellent" | "good" | "needs-improvement" | "poor" | "unavailable";

export type CheckStatus = "pass" | "warn" | "fail" | "info" | "unavailable";

export interface Finding {
  id: string;
  category: CategoryKey;
  severity: Severity;
  title: string;
  /** What was detected, in plain language. */
  detected: string;
  /** Why it matters. */
  impact: string;
  /** Practical, specific recommendation. */
  recommendation: string;
  /** The URL or resource the finding refers to. */
  target?: string;
  /** Raw evidence collected during analysis. */
  evidence?: string;
  /** Optional sample of affected elements/values. */
  samples?: string[];
  /** True when the finding was produced from a measurement rather than an inspection. */
  measured?: boolean;
}

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  value?: string;
}

export interface CategoryScore {
  key: CategoryKey;
  label: string;
  /** null when no assessment could be made at all. */
  score: number | null;
  status: StatusLabel;
  summary: string;
  /** Share of the category's checks that could actually be performed (0–1). */
  coverage: number;
  /** Number of findings that reduced the score. */
  findings: number;
  counts: Record<Severity, number>;
  weight: number;
}

export interface Metric {
  id: string;
  label: string;
  shortLabel: string;
  /** null means "not available", never zero-filled. */
  value: number | null;
  unit: string;
  display: string;
  rating: Rating;
  source: "lab" | "field";
  good: number | null;
  poor: number | null;
  lowerIsBetter: boolean;
  description: string;
  note?: string;
}

export type Rating = "good" | "needs-improvement" | "poor" | "unavailable";

export interface ResourceGroup {
  type: string;
  requests: number;
  bytes: number;
}

export interface PerformanceSection {
  lab: {
    device: "mobile" | "desktop";
    viewport: { width: number; height: number };
    throttling: string;
    browser: string;
    available: boolean;
    note?: string;
  };
  field: {
    available: boolean;
    source?: string;
    note?: string;
    metrics?: Metric[];
  };
  metrics: Metric[];
  resources: ResourceGroup[];
  totals: {
    requests: number | null;
    bytes: number | null;
    jsBytes: number | null;
    cssBytes: number | null;
    imageBytes: number | null;
    fontBytes: number | null;
  };
  opportunities: Finding[];
  diagnostics: {
    renderBlocking: string[];
    oversizedImages: { url: string; bytes: number; displayed: string }[];
    thirdParty: { origin: string; requests: number; bytes: number }[];
    lcpElement?: string;
  };
}

export interface ViewportResult {
  id: "mobile" | "tablet" | "desktop";
  label: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  screenshot: string | null;
  screenshotNote?: string;
  checks: Check[];
  overflow: { scrollWidth: number; clientWidth: number; overflowing: number } | null;
  smallText: number | null;
  smallTargets: number | null;
  rendered: boolean;
}

export interface MobileSection {
  available: boolean;
  note?: string;
  viewportMeta: string | null;
  checks: Check[];
  viewports: ViewportResult[];
  findings: Finding[];
}

export interface AccessibilitySection {
  available: boolean;
  checks: Check[];
  counts: {
    images: number;
    imagesMissingAlt: number;
    formFields: number;
    unlabeledFields: number;
    headings: number;
    headingJumps: number;
    contrastSamples: number;
    contrastFailures: number;
    unnamedInteractive: number;
    landmarks: number;
  };
}

export interface SeoSection {
  available: boolean;
  title: string | null;
  titleLength: number;
  description: string | null;
  descriptionLength: number;
  canonical: string | null;
  robotsMeta: string | null;
  h1: string[];
  headings: { level: number; text: string }[];
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
  structuredData: { types: string[]; blocks: number };
  sitemap: { url: string; available: boolean; status: number | null; urls: number | null };
  robotsTxt: { url: string; available: boolean; status: number | null };
  checks: Check[];
  internalLinks: number;
  externalLinks: number;
  indexable: boolean;
}

export interface LinkItem {
  url: string;
  displayUrl: string;
  type: "internal" | "external";
  status: number | null;
  state: "ok" | "redirect" | "broken" | "blocked" | "timeout" | "unchecked";
  redirectTo?: string;
  hops?: number;
  error?: string;
  foundOn: string;
  anchor?: string;
}

export interface LinksSection {
  available: boolean;
  discovered: number;
  checked: number;
  truncated: boolean;
  summary: {
    ok: number;
    redirect: number;
    broken: number;
    blocked: number;
    timeout: number;
    unchecked: number;
  };
  items: LinkItem[];
  redirectChains: { from: string; to: string; hops: number }[];
  loops: { url: string }[];
}

export interface SecurityHeader {
  name: string;
  value: string | null;
  present: boolean;
  assessment: string;
  severity: Severity | null;
}

export interface SecuritySection {
  available: boolean;
  https: {
    supported: boolean;
    redirectedFromHttp: boolean;
    redirectTarget: string | null;
    certificate: {
      subject: string | null;
      issuer: string | null;
      validFrom: string | null;
      validTo: string | null;
      daysRemaining: number | null;
      error: string | null;
    } | null;
  };
  headers: SecurityHeader[];
  mixedContent: { count: number; samples: string[] };
  serverInfo: { server: string | null; poweredBy: string | null; exposed: boolean };
  checks: Check[];
}

export interface PriorityFix {
  rank: number;
  findingId: string;
  title: string;
  category: CategoryKey;
  severity: Severity;
  /** Why LENS ranks it here. */
  rationale: string;
  estimatedImpact: string;
}

export interface Coverage {
  browser: boolean;
  fieldData: boolean;
  links: boolean;
  screenshots: boolean;
  sitemap: boolean;
}

export interface Report {
  id: string;
  version: 1;
  url: string;
  finalUrl: string;
  origin: string;
  host: string;
  title: string;
  description: string | null;
  favicon: string | null;
  themeColor: string | null;
  createdAt: string;
  durationMs: number;
  status: "complete" | "partial";
  coverage: Coverage;
  overall: {
    score: number | null;
    status: StatusLabel;
    summary: string;
    assessedCategories: number;
  };
  categories: CategoryScore[];
  performance: PerformanceSection;
  mobile: MobileSection;
  accessibility: AccessibilitySection;
  seo: SeoSection;
  links: LinksSection;
  security: SecuritySection;
  findings: Finding[];
  priorityFixes: PriorityFix[];
  notes: string[];
  engine: {
    name: string;
    version: string;
    method: string;
  };
}

export interface ReportSummary {
  id: string;
  url: string;
  finalUrl: string;
  host: string;
  title: string;
  favicon: string | null;
  createdAt: string;
  status: Report["status"];
  overallScore: number | null;
  scores: Partial<Record<CategoryKey, number | null>>;
  findingCount: number;
  criticalCount: number;
  coverage: Coverage;
}

export type AnalysisStage =
  | "queued"
  | "validating"
  | "fetching"
  | "launching"
  | "performance"
  | "mobile"
  | "accessibility"
  | "seo"
  | "links"
  | "security"
  | "scoring"
  | "done"
  | "error";

export interface ProgressEvent {
  type: "progress";
  stage: AnalysisStage;
  label: string;
  detail?: string;
  /** 0–1 */
  progress: number;
  at: number;
}

export interface DoneEvent {
  type: "done";
  report: Report;
  persisted: boolean;
  shareable: boolean;
}

export interface ErrorEvent {
  type: "error";
  code: string;
  message: string;
  hint?: string;
}

export type StreamEvent = ProgressEvent | DoneEvent | ErrorEvent;

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  performance: "Performance",
  mobile: "Mobile",
  accessibility: "Accessibility",
  seo: "SEO",
  links: "Links",
  security: "Security",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Informational",
};

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];
