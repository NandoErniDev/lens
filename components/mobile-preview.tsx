"use client";

import { useState } from "react";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import type { ViewportResult } from "@/lib/types";

const ICONS = {
  mobile: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
};

export function MobilePreview({ viewports }: { viewports: ViewportResult[] }) {
  const [active, setActive] = useState<ViewportResult["id"]>(
    viewports.find((viewport) => viewport.screenshot)?.id ?? "mobile",
  );
  const current = viewports.find((viewport) => viewport.id === active) ?? viewports[0];

  if (!viewports.length) {
    return (
      <div className="empty-inline">
        No rendering was possible for this URL, so no viewport preview is shown.
      </div>
    );
  }

  return (
    <div>
      <div className="viewport-tabs" role="tablist" aria-label="Preview viewport">
        {viewports.map((viewport) => {
          const Icon = ICONS[viewport.id];
          return (
            <button
              key={viewport.id}
              type="button"
              role="tab"
              aria-selected={active === viewport.id}
              className={`viewport-tab${active === viewport.id ? " active" : ""}`}
              onClick={() => setActive(viewport.id)}
            >
              <Icon size={14} />
              <span>{viewport.width} × {viewport.height}</span>
            </button>
          );
        })}
        <span className="dim mono viewport-note">
          {current.width} px viewport · {current.deviceScaleFactor}× DPR
        </span>
      </div>

      <div className="preview-stage" data-viewport={current.id}>
        {current.screenshot ? (
          <figure className="preview-frame" data-viewport={current.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/jpeg;base64,${current.screenshot}`}
              alt={`Rendered preview of the analysed page at ${current.label}`}
              loading="lazy"
            />
            <figcaption className="mono">{current.label}</figcaption>
          </figure>
        ) : (
          <div className="preview-placeholder">
            <p className="section-title">Preview unavailable</p>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              {current.screenshotNote ?? "This site did not allow a screenshot at this viewport."}
            </p>
          </div>
        )}

        <div className="preview-checks">
          {current.checks.map((check) => (
            <div key={check.id} className="preview-check">
              <span className="preview-check-label">{check.label}</span>
              <span className={`preview-check-status ${check.status}`}>{check.status === "pass" ? "Pass" : check.status === "fail" ? "Fail" : "Attention"}</span>
              <span className="dim" style={{ fontSize: 12 }}>{check.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
