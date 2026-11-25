/**
 * Smoke test for the browser measurement path.
 * Usage: npx tsx scripts/smoke-browser.ts https://example.com
 */

import { launchChromium } from "../lib/analysis/chromium";
import { collectPage } from "../lib/analysis/collect";

async function main() {
  const url = process.argv[2] ?? "https://example.com";
  const started = Date.now();
  const { browser, browserVersion, executable } = await launchChromium();
  console.log("executable:", executable);
  console.log("version:", browserVersion);
  try {
    const snapshot = await collectPage({ url, browser, browserVersion, withScreenshots: true });
    console.log(
      JSON.stringify(
        {
          finalUrl: snapshot.finalUrl,
          status: snapshot.status,
          lab: snapshot.lab,
          requests: snapshot.network.length,
          bytes: snapshot.network.reduce((sum, entry) => sum + entry.bytes, 0),
          consoleErrors: snapshot.consoleErrors.length,
          captures: snapshot.captures.map((capture) => ({
            id: capture.id,
            screenshot: capture.screenshot ? `${Math.round(capture.screenshot.length / 1024)} KB` : null,
            overflow: capture.audit?.overflow,
            headings: capture.audit?.headings.length,
            contrastChecked: capture.audit?.contrast.checked,
            contrastFailures: capture.audit?.contrast.failures.length,
            smallTargets: capture.audit?.tapTargets.small.length,
            images: capture.audit?.images.length,
            links: capture.audit?.links.length,
          })),
          durationMs: Date.now() - started,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("smoke test failed:", error);
  process.exit(1);
});
