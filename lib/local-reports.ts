"use client";

/** Local report archive (IndexedDB). Used when the instance has no server-side store. */

import type { Report, ReportSummary } from "@/lib/types";
import { reportSummary } from "@/lib/analysis/report";

const DB_NAME = "lens";
const STORE = "reports";
const VERSION = 1;

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function saveLocalReport(report: Report): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(report);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export async function getLocalReport(id: string): Promise<Report | null> {
  const db = await openDatabase();
  if (!db) return null;
  const report = await new Promise<Report | null>((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve((request.result as Report) ?? null);
    request.onerror = () => resolve(null);
  });
  db.close();
  return report;
}

export async function listLocalReports(): Promise<ReportSummary[]> {
  const db = await openDatabase();
  if (!db) return [];
  const reports = await new Promise<Report[]>((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as Report[]) ?? []);
    request.onerror = () => resolve([]);
  });
  db.close();
  return reports
    .map((report) => reportSummary(report))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteLocalReport(id: string): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}
