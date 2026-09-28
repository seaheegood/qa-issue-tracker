import Link from "next/link";

/**
 * 도넛 차트 — 라이브러리 없이 SVG 하나로.
 *
 * 조각마다 `<circle>` 을 겹쳐 그리고 `stroke-dasharray` 로 길이를,
 * `stroke-dashoffset` 으로 시작점을 민다. 차트 라이브러리를 넣지 않은 이유는
 * 이 프로젝트의 의존성이 7개뿐이기 때문이다 — 도넛 하나 때문에 늘릴 값이 아니다.
 *
 * 서버 컴포넌트다. 집계는 이미 끝난 값을 받고, 클릭은 전부 `<Link>` 라 JS 가 필요 없다.
 */
export type Slice = {
  label: string;
  value: number;
  color: string;
  href: string;
};

const R = 52;              // 반지름
const C = 2 * Math.PI * R; // 둘레

export function Donut({
  slices,
  centerValue,
  centerLabel,
}: {
  slices: Slice[];
  centerValue: string;
  centerLabel: string;
}) {
  const total = slices.reduce((n, s) => n + s.value, 0) || 1;

  /**
   * 조각을 앞에서부터 이어 붙인다. offset 은 '앞까지의 누적'만큼 뒤로 민다.
   *
   * ★ 렌더 중에 바깥 변수(`let acc`)를 누산하지 않는다 (2026-09-04).
   *   React 는 렌더를 **여러 번 부를 수 있고**(StrictMode·중단된 렌더),
   *   그때 누적값이 이어져 조각이 어긋난다. `react-hooks/immutability` 가 잡아 준다.
   *   `reduce` 로 **새 배열을 만들면서** 누적을 함께 들고 간다 — 바깥에 남는 것이 없다.
   */
  const arcs = slices
    .filter((s) => s.value > 0)
    .reduce<{ acc: number; out: (Slice & { len: number; offset: number })[] }>(
      ({ acc, out }, s) => {
        const len = (s.value / total) * C;
        return { acc: acc + len, out: [...out, { ...s, len, offset: -acc }] };
      },
      { acc: 0, out: [] },
    ).out;

  return (
    <div className="donut">
      <svg viewBox="0 0 128 128" role="img" aria-label={`${centerLabel} ${centerValue}`}>
        {/* 바탕. 조각이 0건뿐일 때도 원이 보이게 한다 */}
        <circle cx="64" cy="64" r={R} className="donut-bg" />
        {arcs.map((a) => (
          <circle
            key={a.label}
            cx="64"
            cy="64"
            r={R}
            stroke={a.color}
            strokeDasharray={`${a.len} ${C - a.len}`}
            strokeDashoffset={a.offset}
            className="donut-arc"
          >
            <title>{`${a.label} ${a.value.toLocaleString()}건`}</title>
          </circle>
        ))}
      </svg>
      <div className="donut-center">
        <span className="dv">{centerValue}</span>
        <span className="dl">{centerLabel}</span>
      </div>
    </div>
  );
}

/**
 * 도넛 옆에 붙는 표.
 *
 * 조각이 8개면 작은 것은 그림에서 안 보인다. 그림은 비율을, 표는 정확한 숫자를 맡는다.
 * 0건인 것도 지운다. `In Progress 0건` 이 지금 가장 중요한 정보다 (docs/13 §7).
 */
export function DonutLegend({ slices, total }: { slices: Slice[]; total: number }) {
  return (
    <ul className="legend">
      {slices.map((s) => (
        <li key={s.label} className={s.value === 0 ? "zero" : undefined}>
          <Link href={s.href}>
            <span className="lg-dot" style={{ background: s.color }} />
            <span className="lg-n">{s.label}</span>
            <span className="lg-v">{s.value.toLocaleString()}</span>
            <span className="lg-p">
              {total ? ((s.value / total) * 100).toFixed(1) : "0.0"}%
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
