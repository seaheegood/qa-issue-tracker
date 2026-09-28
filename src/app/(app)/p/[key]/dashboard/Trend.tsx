/**
 * 신규 vs 종결 추이 — SVG 꺾은선 둘.
 *
 * 요구사항서 08: *"신규 vs 종결 — 교차점이 안정화 시점"*.
 * 등록선이 종결선 위에 있으면 쌓이는 중이고, 아래로 내려오면 줄어드는 중이다.
 *
 * 차트 라이브러리를 쓰지 않는다 — polyline 하나면 되는 그림에 의존성을 늘릴 값이 아니다.
 * 서버 컴포넌트라 클라이언트 JS 가 0이다.
 */
export type TrendPoint = { date: string; created: number; closed: number };

const W = 720;
const H = 150;
const PAD_L = 30;
const PAD_B = 20;
const PAD_T = 10;

export function Trend({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) {
    return <p className="dash-none">추이를 그리려면 이틀 이상의 기록이 필요합니다.</p>;
  }

  const max = Math.max(...points.flatMap((p) => [p.created, p.closed]), 1);
  const stepX = (W - PAD_L - 10) / (points.length - 1);
  const x = (i: number) => PAD_L + i * stepX;
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / max);

  const line = (key: "created" | "closed") =>
    points.map((p, i) => `${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");

  // 등록선 아래를 옅게 채운다. 선 두 개만 있으면 어느 쪽이 위인지 훑기 어렵다.
  const area = `${PAD_L},${y(0)} ${line("created")} ${x(points.length - 1)},${y(0)}`;

  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1];

  return (
    <div className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="일자별 등록·종결 추이">
        {/* 가로 눈금. 값을 읽는 게 아니라 기울기를 보는 그림이라 두 줄이면 충분하다 */}
        {[0, max].map((v) => (
          <g key={v}>
            <line x1={PAD_L} x2={W - 10} y1={y(v)} y2={y(v)} className="tr-grid" />
            <text x={PAD_L - 6} y={y(v) + 3.5} className="tr-ytick">{v}</text>
          </g>
        ))}

        <polygon points={area} className="tr-area" />
        <polyline points={line("created")} className="tr-created" />
        <polyline points={line("closed")} className="tr-closed" />

        {points.map((p, i) => (
          <g key={p.date}>
            <circle cx={x(i)} cy={y(p.created)} r="2.5" className="tr-dot created" />
            <circle cx={x(i)} cy={y(p.closed)} r="2.5" className="tr-dot closed" />
            <title>{`${md(p.date)} — 등록 ${p.created} · 종결 ${p.closed}`}</title>
          </g>
        ))}

        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 5} className="tr-xtick">{md(points[i].date)}</text>
        ))}
      </svg>

      <div className="tr-legend">
        <span><i className="tr-k created" />등록</span>
        <span><i className="tr-k closed" />종결</span>
      </div>
    </div>
  );
}
