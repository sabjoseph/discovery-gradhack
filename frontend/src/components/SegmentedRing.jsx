import { useEffect, useMemo, useState } from "react";
import "./SegmentedRing.css";

/**
 * Single donut made of coloured arc segments that animate open on mount.
 * segments: [{ id, value, color, label }]
 * max: full-circle value (usually monthly budget)
 */
export default function SegmentedRing({
  segments = [],
  max = 100,
  size = 200,
  stroke = 16,
  durationMs = 1400,
  children,
  className = "",
}) {
  const [progress, setProgress] = useState(0);

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const prepared = useMemo(() => {
    const safeMax = max > 0 ? max : 1;
    const raw = segments
      .map((s) => ({
        ...s,
        value: Math.max(0, Number(s.value) || 0),
      }))
      .filter((s) => s.value > 0);

    const total = raw.reduce((sum, s) => sum + s.value, 0);
    // Keep visual within one full turn even if over budget
    const scale = total > safeMax ? safeMax / total : 1;

    let cursor = 0;
    return raw.map((s) => {
      const frac = (s.value * scale) / safeMax;
      const length = frac * c;
      const start = cursor;
      cursor += length;
      return { ...s, length, start };
    });
  }, [segments, max, c]);

  useEffect(() => {
    setProgress(0);
    let timer = 0;
    const raf = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setProgress(1), 40);
    });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [prepared, max]);

  return (
    <div
      className={`seg-ring ${className}`}
      style={{
        width: size,
        height: size,
        "--seg-duration": `${durationMs}ms`,
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(0, 27, 68, 0.1)"
          strokeWidth={stroke}
        />
        {prepared.map((seg) => {
          const shown = seg.length * progress;
          return (
            <circle
              key={seg.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={`${shown} ${Math.max(0, c - shown)}`}
              strokeDashoffset={-seg.start}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              className="seg-ring-arc"
            />
          );
        })}
      </svg>
      <div className="seg-ring-centre">{children}</div>
    </div>
  );
}
