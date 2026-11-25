import type { StatusLabel } from "@/lib/types";

const TONE: Record<StatusLabel, string> = {
  excellent: "var(--good)",
  good: "var(--good)",
  "needs-improvement": "var(--warn)",
  poor: "var(--bad)",
  unavailable: "var(--text-tertiary)",
};

export function toneForScore(score: number | null): string {
  if (score === null) return "tone-none";
  if (score >= 75) return "tone-good";
  if (score >= 50) return "tone-warn";
  return "tone-bad";
}

export function ScoreRing({
  score,
  size = 132,
  stroke = 7,
  label,
  status,
  animate = true,
}: {
  score: number | null;
  size?: number;
  stroke?: number;
  label?: string;
  status?: StatusLabel;
  animate?: boolean;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = score === null ? 0 : Math.max(0, Math.min(100, score));
  const dash = (value / 100) * circumference;
  const color = status ? TONE[status] : score === null ? "var(--text-tertiary)" : score >= 75 ? "var(--good)" : score >= 50 ? "var(--warn)" : "var(--bad)";

  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        {score !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            style={{
              transition: animate ? "stroke-dasharray 900ms cubic-bezier(0.22, 1, 0.36, 1)" : undefined,
            }}
          />
        )}
      </svg>
      <div className="score-ring-value">
        <div>
          <div className="score-ring-number" style={{ color: score === null ? "var(--text-tertiary)" : "var(--text)" }}>
            {score === null ? "—" : score}
          </div>
          <div className="score-ring-label">{label ?? (score === null ? "n/a" : "/ 100")}</div>
        </div>
      </div>
    </div>
  );
}
