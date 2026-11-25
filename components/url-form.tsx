"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Globe, AlertCircle } from "lucide-react";

export interface RecentReport {
  id: string;
  host: string;
  overallScore: number | null;
}

export function normalizeUrlInput(raw: string): { ok: true; url: string } | { ok: false; message: string } {
  let value = (raw ?? "").trim().replace(/^[<"'\s]+|[>"'\s]+$/g, "");
  if (!value) return { ok: false, message: "Enter a website address to analyse." };
  if (value.startsWith("//")) value = `https:${value}`;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, message: "That does not look like a URL. Try example.com or https://example.com/page" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "Only http:// and https:// addresses can be analysed." };
  }
  if (!url.hostname.includes(".") || url.hostname.startsWith(".") || url.hostname.endsWith(".")) {
    return { ok: false, message: "That domain is incomplete. Use a full hostname such as example.com." };
  }
  if (/(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) {
    return { ok: false, message: "LENS only analyses publicly reachable websites." };
  }
  url.hash = "";
  return { ok: true, url: url.toString() };
}

export function UrlForm({ compact = false, autoFocus = false }: { compact?: boolean; autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = normalizeUrlInput(value);
    if (!result.ok) {
      setError(result.message);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    router.push(`/analyze?url=${encodeURIComponent(result.url)}`);
  };

  return (
    <form className="url-form" onSubmit={submit} noValidate>
      <div className={`url-field${compact ? " url-field-compact" : ""}`} data-invalid={error ? "true" : "false"}>
        <span className="url-field-icon" aria-hidden="true">
          <Globe size={17} />
        </span>
        <label htmlFor="lens-url" className="sr-only">
          Website address
        </label>
        <input
          ref={inputRef}
          id="lens-url"
          name="url"
          className="url-input"
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="example.com"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "lens-url-error" : undefined}
          disabled={busy}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Starting…" : "Analyze website"}
          <ArrowRight size={15} />
        </button>
      </div>
      {error ? (
        <p className="form-error" id="lens-url-error" role="alert">
          <AlertCircle size={13} />
          {error}
        </p>
      ) : (
        !compact && (
          <p className="url-hint">
            <span>Public pages only</span>
            <span aria-hidden="true">·</span>
            <span>No account needed</span>
            <span aria-hidden="true">·</span>
            <span>Typical run: 30–60 seconds</span>
          </p>
        )
      )}
    </form>
  );
}
