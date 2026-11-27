import { useEffect, useState } from "react";
import CountUp from "./CountUp";
import { LITE } from "../lib/lite";
const COLORS = ["var(--blue)", "var(--head)", "var(--line)"];
// 0 -> 1 progress, restarts whenever key changes (new data = animate again from zero).
function useGrow(key, ms = 1000) {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (LITE) {
      setP(1);
      return;
    }
    setP(0);
    const t0 = performance.now();
    let raf = 0;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      setP(1 - Math.pow(1 - k, 3));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key, ms]);
  return p;
}
// Smooth area chart (use for dates, in order).
export function AreaChart({ data }) {
  const p = useGrow(JSON.stringify(data));
  if (!data.length) return <p className="muted">No data</p>;
  const w = 600,
    h = 230,
    pad = 30;
  const max = Math.max(1, ...data.map((d) => d[1]));
  const x = (i) =>
    data.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (data.length - 1);
  const y = (v) => h - pad - p * (v / max) * (h - 2 * pad - 14);
  const pts = data.map((d, i) => [x(i), y(d[1])]);
  let line = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1],
      [x1, y1] = pts[i],
      cx = (x0 + x1) / 2;
    line += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  const area = `${line} L${pts[pts.length - 1][0]},${h - pad} L${pts[0][0]},${h - pad} Z`;
  const step = Math.ceil(data.length / 8);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="area"
      role="img"
      aria-label="Chart"
    >
      <defs>
        <linearGradient id="area-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--blue)" stopOpacity=".5" />
          <stop offset="1" stopColor="var(--blue)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((t) => (
        <line
          key={t}
          x1={pad}
          x2={w - pad}
          y1={h - pad - t * (h - 2 * pad - 14)}
          y2={h - pad - t * (h - 2 * pad - 14)}
          stroke="var(--line)"
          strokeDasharray="4 4"
        />
      ))}
      <path d={area} fill="url(#area-g)" />
      <path
        d={line}
        fill="none"
        stroke="var(--blue)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {pts.map(([cx, cy], i) => (
        <g key={i}>
          <circle
            cx={cx}
            cy={cy}
            r="4"
            fill="var(--white)"
            stroke="var(--blue)"
            strokeWidth="2.2"
          />
          {data.length <= 10 && (
            <text
              x={cx}
              y={cy - 10}
              textAnchor="middle"
              fontSize="12"
              fontWeight="600"
              fill="var(--head)"
            >
              {Math.round(data[i][1] * p)}
            </text>
          )}
          {i % step === 0 && (
            <text
              x={cx}
              y={h - 8}
              textAnchor="middle"
              fontSize="11.5"
              fill="var(--muted)"
            >
              {data[i][0].slice(5)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
// Horizontal bars, biggest first.
export function BarChart({ data, limit = 12 }) {
  const rows = [...data].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const p = useGrow(JSON.stringify(rows));
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return <p className="muted">No data</p>;
  return (
    <div className="hbars">
      {rows.map(([k, v]) => (
        <div className="hbar" key={k}>
          <span className="hl" title={k}>
            {k}
          </span>
          <div className="ht">
            <i style={{ width: `${(v / max) * 100 * p}%` }} />
          </div>
          <b>{Math.round(v * p)}</b>
        </div>
      ))}
    </div>
  );
}
// Vertical columns in the given order (use for dates).
export function ColumnChart({ data }) {
  const p = useGrow(JSON.stringify(data));
  const max = Math.max(1, ...data.map((r) => r[1]));
  if (!data.length) return <p className="muted">No data</p>;
  return (
    <div className="cols">
      {data.map(([k, v]) => (
        <div className="col" key={k}>
          <b>{Math.round(v * p)}</b>
          <i style={{ height: `${Math.round((v / max) * 130 * p)}px` }} />
          <span>{k.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}
export function Donut({ parts, center }) {
  const p = useGrow(JSON.stringify(parts));
  const total = parts.reduce((s, x) => s + x[1], 0);
  let acc = 0;
  const stops = total
    ? [
        ...parts.map(([, v], i) => {
          const s = (acc / total) * 100 * p;
          acc += v;
          return `${COLORS[i % COLORS.length]} ${s}% ${(acc / total) * 100 * p}%`;
        }),
        `var(--line) ${p * 100}% 100%`,
      ].join(",")
    : "var(--line) 0 100%";
  const m = /^(\d+)(.*)$/.exec(center);
  return (
    <div className="donutwrap">
      <div className="donut" style={{ background: `conic-gradient(${stops})` }}>
        <span>
          {m ? (
            <>
              <CountUp value={Number(m[1])} />
              {m[2]}
            </>
          ) : (
            center
          )}
        </span>
      </div>
      <ul className="legend">
        {parts.map(([k, v], i) => (
          <li key={k}>
            <i style={{ background: COLORS[i % COLORS.length] }} />
            {k}:{" "}
            <b>
              <CountUp value={v} />
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
}
