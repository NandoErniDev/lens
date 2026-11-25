/**
 * Guard tests for URL normalisation and SSRF protection.
 * Run with: npx tsx scripts/test-guards.ts
 */

import { normalizeInputUrl, assertSafeUrl, isPrivateIp } from "../lib/url-safety";

let failures = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`pass  ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name}`);
  }
}

async function rejects(name: string, input: string) {
  try {
    const parsed = normalizeInputUrl(input);
    await assertSafeUrl(parsed.url);
    check(name, false);
    console.log(`      unexpected accept: ${parsed.normalized}`);
  } catch {
    check(name, true);
  }
}

async function accepts(name: string, input: string, expectedHost: string) {
  try {
    const parsed = normalizeInputUrl(input);
    await assertSafeUrl(parsed.url);
    check(name, parsed.url.hostname === expectedHost);
  } catch (error) {
    check(name, false);
    console.log(`      rejected: ${(error as Error).message}`);
  }
}

async function main() {
  await accepts("normalises bare hostname", "example.com", "example.com");
  await accepts("keeps explicit https", "https://example.com/path?x=1", "example.com");
  await accepts("accepts www", "www.wikipedia.org", "www.wikipedia.org");
  await accepts("strips surrounding whitespace", "  https://example.com  ", "example.com");

  await rejects("rejects file://", "file:///etc/passwd");
  await rejects("rejects javascript:", "javascript:alert(1)");
  await rejects("rejects localhost", "localhost:3000");
  await rejects("rejects 127.0.0.1", "http://127.0.0.1/");
  await rejects("rejects decimal IP encoding", "http://2130706433/");
  await rejects("rejects private 10.x", "http://10.0.0.5/");
  await rejects("rejects link-local metadata", "http://169.254.169.254/latest/meta-data");
  await rejects("rejects IPv6 loopback", "http://[::1]/");
  await rejects("rejects internal suffix", "http://printer.local/");
  await rejects("rejects credentials in URL", "https://user:pass@example.com/");
  await rejects("rejects empty input", "   ");
  await rejects("rejects unfetchable TLD", "https://this-domain-should-not-exist-lens.invalid");

  check("classifies 192.168.1.1 as private", isPrivateIp("192.168.1.1"));
  check("classifies 8.8.8.8 as public", !isPrivateIp("8.8.8.8"));
  check("classifies ::ffff:10.0.0.1 as private", isPrivateIp("::ffff:10.0.0.1"));
  check("classifies 172.20.0.1 as private", isPrivateIp("172.20.0.1"));
  check("classifies 172.32.0.1 as public", !isPrivateIp("172.32.0.1"));

  console.log(failures ? `\n${failures} failure(s)` : "\nall guard tests passed");
  process.exit(failures ? 1 : 0);
}

void main();
