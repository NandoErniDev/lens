/**
 * Chromium resolution and launch.
 *
 * Locally LENS uses the Chromium downloaded by Puppeteer (or a system Chrome).
 * On Vercel/serverless it uses @sparticuz/chromium, which ships a headless Chromium
 * built for the serverless runtime. `CHROME_PATH` always wins when set.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Browser } from "puppeteer-core";

export const CHROMIUM_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--no-zygote",
  "--hide-scrollbars",
  "--mute-audio",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--font-render-hinting=none",
  "--disable-features=IsolateOrigins,site-per-process",
];

async function exists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function findLocalChrome(): Promise<string | null> {
  if (process.env.CHROME_PATH && (await exists(process.env.CHROME_PATH))) {
    return process.env.CHROME_PATH;
  }

  const home = process.env.HOME ?? "";
  const candidates: string[] = [];

  // Puppeteer cache: ~/.cache/puppeteer/chrome/<version>/chrome-linux64/chrome
  for (const root of [path.join(home, ".cache/puppeteer/chrome"), "/root/.cache/puppeteer/chrome"]) {
    try {
      const versions = await fs.readdir(root);
      for (const version of versions) {
        candidates.push(path.join(root, version, "chrome-linux64", "chrome"));
        candidates.push(path.join(root, version, "chrome-linux", "chrome"));
      }
    } catch {
      /* not installed */
    }
  }

  // Playwright cache.
  for (const root of [path.join(home, ".cache/ms-playwright")]) {
    try {
      const versions = await fs.readdir(root);
      for (const version of versions.filter((v) => v.startsWith("chromium"))) {
        candidates.push(path.join(root, version, "chrome-linux", "chrome"));
      }
    } catch {
      /* not installed */
    }
  }

  candidates.push(
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  );

  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }

  // Last resort: ask the full puppeteer package where its browser lives (dev installs).
  try {
    const puppeteer = (await import(/* webpackIgnore: true */ "puppeteer")) as unknown as {
      executablePath: () => string;
    };
    const resolved = puppeteer.executablePath();
    if (resolved && (await exists(resolved))) return resolved;
  } catch {
    /* puppeteer is a dev dependency; not present in production */
  }

  return null;
}

export interface LaunchResult {
  browser: Browser;
  executable: string;
  browserVersion: string;
}

export async function launchChromium(): Promise<LaunchResult> {
  const { default: puppeteer } = await import("puppeteer-core");
  const serverless = Boolean(process.env.VERCEL) || process.env.LENS_SERVERLESS === "1";

  let executable: string | null = null;
  let args = CHROMIUM_ARGS;

  if (serverless) {
    const { default: chromium } = await import("@sparticuz/chromium");
    executable = await chromium.executablePath();
    args = [...CHROMIUM_ARGS, ...chromium.args];
  } else {
    executable = await findLocalChrome();
  }

  if (!executable) {
    throw new Error(
      "No Chromium binary is available. Set CHROME_PATH, or run `npx puppeteer browsers install chrome`.",
    );
  }

  const browser = await puppeteer.launch({
    args,
    executablePath: executable,
    headless: true,
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 1 },
    protocolTimeout: 60_000,
  });

  return {
    browser,
    executable,
    browserVersion: await browser.version().catch(() => "unknown"),
  };
}
