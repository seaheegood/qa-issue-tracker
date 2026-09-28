import Link from "next/link";
import { themedText } from "@/lib/color";

/**
 * 전체 대비 **미해결**을 겹쳐 보여주는 막대.
 *
 * 우선순위별·시스템별처럼 "어디에 몰려 있나"를 보는 자리에 쓴다.
 *
 * ★ 건수만 보여주면 "어디가 많나"밖에 안 읽힌다.
 *   우리가 궁금한 건 **어디에 아직 남아 있나**다. 그래서 옅은 막대(전체) 위에
 *   진한 막대(미해결)를 겹친다 — 진한 부분이 길수록 손댈 게 많다는 뜻이다.
 *
 * 요구사항서 02: "Critical이 몇 건 열려 있는지가 오픈 판단의 근거가 됩니다."
 */
export type SplitRow = {
  label: string;
  color: string;
  total: number;
  open: number;
  href: string;
  openHref: string;
};

export function SplitBars({ rows, showDot = true }: { rows: SplitRow[]; showDot?: boolean }) {
  const max = Math.max(...rows.map((r) => r.total), 1);

  return (
    <ul className="xbars">
      {rows.map((r) => (
        <li key={r.label}>
          <Link href={r.href} className="xb-label">
            {showDot && <span className="xb-dot" style={{ background: r.color }} />}
            {r.label}
          </Link>

          <span className="xb-track">
            <span className="xb-all" style={{ width: `${(r.total / max) * 100}%` }}>
              <span
                className="xb-open"
                style={{ width: `${r.total ? (r.open / r.total) * 100 : 0}%`, background: r.color }}
              />
            </span>
          </span>

          <span className="xb-tot">{r.total.toLocaleString()}</span>
          {r.open > 0 ? (
            <Link href={r.openHref} className="xb-open-n" style={themedText(r.color)}>
              {r.open.toLocaleString()}
            </Link>
          ) : (
            <span className="xb-open-n zero">—</span>
          )}
        </li>
      ))}
    </ul>
  );
}
