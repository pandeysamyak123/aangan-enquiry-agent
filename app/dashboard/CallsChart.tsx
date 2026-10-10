'use client';
// Calls per day, stacked by route. Hover → per-day tooltip; legend always shown; table view toggle.
import { useState } from 'react';

type Day = { day: string; qualified: number; nurture: number; declined: number; other: number; total: number };
type G = { key: 'qualified' | 'nurture' | 'declined' | 'other'; label: string; color: string };

const W = 720, H = 220, PAD_L = 28, PAD_B = 22, PAD_T = 8, GAP = 2;

const fmtDay = (d: string, short = false) =>
  new Date(d + 'T00:00:00+05:30').toLocaleDateString('en-IN', short ? { day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric', month: 'short' });

// Rounded top corners only (data-end), square at the baseline side.
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export default function CallsChart({ data, groups }: { data: Day[]; groups: G[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(4, ...data.map((d) => d.total));
  const step = Math.ceil(max / 4);
  const yMax = step * 4;
  const plotW = W - PAD_L, plotH = H - PAD_B - PAD_T;
  const slot = plotW / data.length;
  const barW = Math.max(3, Math.min(22, slot * 0.62));
  const y = (v: number) => PAD_T + plotH - (v / yMax) * plotH;
  const labelEvery = Math.ceil(data.length / 8);
  const h = hover !== null ? data[hover] : null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }} aria-label="Legend">
          {groups.map((g) => (
            <span key={g.key} className="status" style={{ fontWeight: 500, color: 'var(--ink-2)' }}>
              <span className="dot" style={{ background: g.color }} />
              {g.label}
            </span>
          ))}
        </div>
        <button className="btn" style={{ padding: '5px 10px', fontSize: 13 }} onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {table ? (
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Day</th>{groups.map((g) => <th key={g.key} className="num">{g.label}</th>)}<th className="num">Total</th></tr></thead>
            <tbody>
              {[...data].reverse().filter((d) => d.total > 0).map((d) => (
                <tr key={d.day}><td>{fmtDay(d.day)}</td>{groups.map((g) => <td key={g.key} className="num">{d[g.key]}</td>)}<td className="num"><b>{d.total}</b></td></tr>
              ))}
              {data.every((d) => d.total === 0) && <tr><td colSpan={6} className="muted">No calls in this range yet.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Calls per day by route" style={{ display: 'block', overflow: 'visible' }} onMouseLeave={() => setHover(null)}>
            {[0, 1, 2, 3, 4].map((i) => (
              <g key={i}>
                <line x1={PAD_L} x2={W} y1={y(i * step)} y2={y(i * step)} stroke={i === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
                <text x={PAD_L - 6} y={y(i * step) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="num">{i * step}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = PAD_L + slot * i + slot / 2;
              let acc = 0;
              const present = groups.filter((g) => d[g.key] > 0);
              return (
                <g key={d.day} opacity={hover === null || hover === i ? 1 : 0.45}>
                  {present.map((g, j) => {
                    const v = d[g.key];
                    const y0 = y(acc), y1 = y(acc + v);
                    acc += v;
                    const top = j === present.length - 1;
                    const hgt = Math.max(1, y0 - y1 - (top ? 0 : GAP));
                    const yy = y1 + (top ? 0 : GAP);
                    return top
                      ? <path key={g.key} d={topRounded(cx - barW / 2, y1, barW, Math.max(1, y0 - y1), 4)} fill={g.color} />
                      : <rect key={g.key} x={cx - barW / 2} y={yy} width={barW} height={hgt} fill={g.color} />;
                  })}
                  {i % labelEvery === 0 && <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">{fmtDay(d.day, true)}</text>}
                  <rect x={PAD_L + slot * i} y={PAD_T} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${fmtDay(d.day)}: ${d.total} calls`} />
                </g>
              );
            })}
          </svg>
          {h && (
            <div role="tooltip" style={{
              position: 'absolute', top: 0, left: `min(calc(${((PAD_L + slot * (hover! + 0.5)) / W) * 100}% + 12px), calc(100% - 190px))`,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, pointerEvents: 'none',
              boxShadow: '0 4px 16px rgba(0,0,0,.12)', minWidth: 170,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{fmtDay(h.day)} · {h.total} call{h.total === 1 ? '' : 's'}</div>
              {groups.map((g) => (
                <div key={g.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: 'var(--ink-2)' }}>
                  <span className="status" style={{ fontWeight: 500 }}><span className="dot" style={{ background: g.color }} />{g.label}</span>
                  <span className="num" style={{ color: 'var(--ink)' }}>{h[g.key]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
