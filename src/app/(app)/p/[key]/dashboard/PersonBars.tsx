import Link from "next/link";

import { Avatar } from "@/lib/ui";

/**
 * 사람별 진행도 — **상태 색으로 칠한 막대**.
 *
 * ★ 작성자축과 담당자축을 **따로** 그린다.
 *   지금 데이터에서 작성자==담당자인 이슈는 0건이다. QA는 올리기만 하고 개발은 받기만 한다.
 *   한 막대에 섞으면 거짓말이 된다 (docs/10 §3).
 *
 * ★ 순위표로 만들지 않는다.
 *   등수를 매기는 순간 성과 평가 도구로 오해되고, 그러면 사람들이 이슈를 안 올린다.
 *   정렬은 건수 내림차순으로 **고정**이고 바꿀 수 없다.
 *
 * ★ **조각마다 링크가 다르다.** 예전에는 막대가 통째로 하나의 링크였고,
 *   그나마 `?person=`(작성 또는 담당)으로 가서 **막대 길이와 결과 건수가 달랐다.**
 *   이제 조각을 누르면 `?reporter=X&status=Y` 로 가고 **숫자가 정확히 맞는다.**
 */
export type PersonRow = {
  loginId: string | null;
  name: string;
  teamColor: string | null;
  total: number;
  open: number;
  /** 이름을 눌렀을 때 — 그 사람의 그 축 전부 */
  href: string;
  /** 상태별 조각. 정렬은 상태 순서(sortOrder)를 따른다 */
  segments: { code: string; name: string; color: string; count: number; href: string }[];
};

export function PersonBars({
  rows, emptyText, showAvatar = true,
}: {
  rows: PersonRow[];
  emptyText: string;
  /** 내 이슈 패널처럼 사람이 하나뿐이면 얼굴을 반복해 봐야 읽을 게 없다 */
  showAvatar?: boolean;
}) {
  if (rows.length === 0) return <p className="dash-none">{emptyText}</p>;
  const max = Math.max(...rows.map((r) => r.total), 1);

  return (
    <ul className="bars">
      {rows.map((r) => (
        // ⚠️ 키는 사람이 아니라 **링크**다. `내 이슈 상태별` 은 한 사람이 두 줄(올린 것 · 맡은 것)이라
        //   `loginId` 로 두면 키가 겹친다 (2026-09-22). 링크는 줄마다 반드시 다르다
        <li key={r.href}>
          <Link href={r.href} className="bar-who">
            {showAvatar && <Avatar name={r.name} color={r.teamColor} size={19} />}
            <span className="bar-name">{r.name}</span>
          </Link>

          {/* 막대 전체 길이 = 건수. 그 안을 상태 색으로 나눠 칠한다 */}
          <span className="bar-track" style={{ width: `${(r.total / max) * 100}%` }}>
            {r.segments.map((sg) => (
              <Link
                key={sg.code}
                href={sg.href}
                className="bar-seg"
                style={{ width: `${(sg.count / r.total) * 100}%`, background: sg.color }}
                title={`${r.name} · ${sg.name} ${sg.count.toLocaleString()}건 — 눌러서 보기`}
              >
                <span className="sr">{sg.name} {sg.count}</span>
              </Link>
            ))}
          </span>

          <span className="bar-tot">{r.total.toLocaleString()}</span>
          <span className={`bar-open${r.open === 0 ? " zero" : ""}`}>
            {r.open === 0 ? "—" : `남은 것 ${r.open.toLocaleString()}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
