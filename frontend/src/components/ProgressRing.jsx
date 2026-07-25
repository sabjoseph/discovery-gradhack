export default function ProgressRing({
  value = 0,
  max = 100,
  size = 160,
  stroke = 12,
  color = "#7bbc43",
  trackColor = "rgba(0, 27, 68, 0.12)",
  goal = null,
  children,
  className = "",
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const offset = c * (1 - pct);
  const closed = pct >= 1;

  let goalAngle = null;
  if (goal != null && max > 0) {
    goalAngle = Math.min(1, Math.max(0, goal / max)) * 360 - 90;
  }

  return (
    <div
      className={`progress-ring ${closed ? "is-closed" : ""} ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="progress-ring-arc"
        />
        {goalAngle != null && (
          <line
            x1={size / 2}
            y1={stroke / 2}
            x2={size / 2}
            y2={stroke + 4}
            stroke="#001b44"
            strokeWidth={2}
            strokeLinecap="round"
            transform={`rotate(${goalAngle + 90} ${size / 2} ${size / 2})`}
            opacity={0.45}
          />
        )}
      </svg>
      <div className="progress-ring-centre">{children}</div>
    </div>
  );
}
