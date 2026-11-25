/** Report persistence: Cloudflare KV in production, filesystem locally, memory otherwise. */

import fs from "node:fs/promises";
import path from "node:path";
import type { Report, ReportSummary } from "@/lib/types";
import { reportSummary } from "@/lib/analysis/report";

export interface ReportStore {
  kind: "cloudflare-kv" | "filesystem" | "memory";
  durable: boolean;
  save(report: Report): Promise<boolean>;
  get(id: string): Promise<Report | null>;
  list(limit?: number): Promise<ReportSummary[]>;
}

const INDEX_LIMIT = 60;

class MemoryStore implements ReportStore {
  kind = "memory" as const;
  durable = false;
  private reports = new Map<string, { report: Report; savedAt: number }>();

  async save(report: Report): Promise<boolean> {
    this.reports.set(report.id, { report, savedAt: Date.now() });
    return true;
  }

  async get(id: string): Promise<Report | null> {
    return this.reports.get(id)?.report ?? null;
  }

  async list(limit = 20): Promise<ReportSummary[]> {
    return Array.from(this.reports.values())
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, limit)
      .map((entry) => reportSummary(entry.report));
  }
}

class FileStore implements ReportStore {
  kind = "filesystem" as const;
  durable = true;
  private root = path.join(process.cwd(), ".lens-data", "reports");

  private file(id: string): string {
    return path.join(this.root, `${id.replace(/[^a-z0-9]/gi, "")}.json`);
  }

  async save(report: Report): Promise<boolean> {
    try {
      await fs.mkdir(this.root, { recursive: true });
      await fs.writeFile(this.file(report.id), JSON.stringify(report), "utf8");
      return true;
    } catch {
      return false;
    }
  }

  async get(id: string): Promise<Report | null> {
    try {
      const raw = await fs.readFile(this.file(id), "utf8");
      return JSON.parse(raw) as Report;
    } catch {
      return null;
    }
  }

  async list(limit = 20): Promise<ReportSummary[]> {
    try {
      const entries = await fs.readdir(this.root);
      const reports: ReportSummary[] = [];
      for (const entry of entries.filter((name) => name.endsWith(".json")).slice(0, 200)) {
        try {
          const raw = await fs.readFile(path.join(this.root, entry), "utf8");
          reports.push(reportSummary(JSON.parse(raw) as Report));
        } catch {
          /* skip corrupt file */
        }
      }
      return reports
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    } catch {
      return [];
    }
  }
}

class CloudflareKvStore implements ReportStore {
  kind = "cloudflare-kv" as const;
  durable = true;

  constructor(
    private accountId: string,
    private namespaceId: string,
    private token: string,
  ) {}

  private base(): string {
    return `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/storage/kv/namespaces/${this.namespaceId}/values`;
  }

  private async put(key: string, value: string): Promise<boolean> {
    const response = await fetch(`${this.base()}/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "text/plain",
      },
      body: value,
    });
    return response.ok;
  }

  private async read(key: string): Promise<string | null> {
    const response = await fetch(`${this.base()}/${encodeURIComponent(key)}`, {
      headers: { authorization: `Bearer ${this.token}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return response.text();
  }

  async save(report: Report): Promise<boolean> {
    try {
      const saved = await this.put(`report:${report.id}`, JSON.stringify(report));
      if (!saved) return false;
      const index = await this.list(INDEX_LIMIT);
      const summary = reportSummary(report);
      const next = [summary, ...index.filter((item) => item.id !== report.id)].slice(0, INDEX_LIMIT);
      await this.put("index", JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }

  async get(id: string): Promise<Report | null> {
    try {
      const raw = await this.read(`report:${id}`);
      return raw ? (JSON.parse(raw) as Report) : null;
    } catch {
      return null;
    }
  }

  async list(limit = 20): Promise<ReportSummary[]> {
    try {
      const raw = await this.read("index");
      if (!raw) return [];
      const parsed = JSON.parse(raw) as ReportSummary[];
      return parsed.slice(0, limit);
    } catch {
      return [];
    }
  }
}

let store: ReportStore | null = null;

export function getReportStore(): ReportStore {
  if (store) return store;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const namespaceId = process.env.LENS_KV_NAMESPACE_ID;

  if (accountId && token && namespaceId) {
    store = new CloudflareKvStore(accountId, namespaceId, token);
    return store;
  }

  const serverless = Boolean(process.env.VERCEL) || Boolean(process.env.LENS_SERVERLESS);
  store = serverless ? new MemoryStore() : new FileStore();
  return store;
}

export function isPersistenceConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN && process.env.LENS_KV_NAMESPACE_ID);
}
