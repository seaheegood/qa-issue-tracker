"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";

export type StatusItem = {
  code: string;
  name: string;
  color: string;
  category: string;
  count: number;
};

const CATEGORY_LABEL: Record<string, string> = {
  OPEN: "미해결",
  PENDING: "대기",
  RESOLVED: "처리됨",
  CLOSED: "종결",
};

/**
 * 사이드바의 '이슈' 항목과 그 아래 상태별 하위 목록.
 *
 * 상태는 프로젝트마다 다르므로(설정 데이터), 여기서 이름을 하드코딩하지 않는다.
 * 카테고리(미해결/대기/처리됨/종결)로 한 번 더 묶는다 — 상태가 10개면 그냥 나열했을 때
 * 무엇부터 봐야 할지 알 수 없기 때문이다.
 *
 * 펼침 상태는 localStorage 에 저장한다. 매번 다시 펼치게 하면 성가시다.
 */
export type RoundItem = { code: string; name: string; count: number };

import { useSidebarOpen } from "@/components/SidebarToggle";
import { useProjectKey } from "@/components/useProjectKey";

/**
 * 사이드바 '이슈' 묶음의 접힘 상태를 담는 **아주 작은 외부 저장소**.
 *
 * ★ 원본은 `localStorage` 다. React 상태로 복사하지 않고 여기서 직접 읽는다 —
 *   `ThemeToggle` 이 `data-theme` 을 직접 읽는 것과 같은 생각이다.
 *
 * ★ `subscribe` 가 필요한 이유: 토글을 누른 쪽과 그리는 쪽이 같은 컴포넌트라도,
 *   `useSyncExternalStore` 는 "값이 바뀌었다"는 신호를 받아야 다시 그린다.
 */
const navListeners = new Set<() => void>();

function subscribeNav(fn: () => void) {
  navListeners.add(fn);
  return () => {
    navListeners.delete(fn);
  };
}

function navOpenSnapshot() {
  try {
    return localStorage.getItem("pt-nav-issues") !== "0";
  } catch {
    return true;
  }
}

export function IssueNav({ statuses, rounds, unrounded, total, fallbackKey }: {
  /** 프로젝트 밖 화면에서 쓸 기본 프로젝트 */
  fallbackKey?: string | null;
  statuses: StatusItem[]; rounds: RoundItem[]; unrounded: number; total: number;
}) {
  const path = usePathname();
  const params = useSearchParams();
  /**
   * 지금 걸린 값들. ★ 2026-09-16 부터 **CSV 다중 선택**이라 `includes` 로 본다
   *   (`?status=OPEN,IN_PROGRESS`).
   */
  const csv = (k: string) => (params.get(k) ?? "").split(",").filter(Boolean);
  const current = csv("status");
  const currentRound = csv("round");

  /**
   * 지금 조건에서 키 하나만 바꾼 주소.
   *
   * ★ 예전에는 `/issues?status=CODE` 로 통째로 갈아치웠다.
   *   축이 하나일 때는 안 보였지만, 차수가 붙는 순간 **상태를 고르면 차수가 날아가는**
   *   버그로 보인다. 목록 툴바의 url() 과 같은 규칙으로 맞춘다.
   */
  const pk = useProjectKey(fallbackKey ?? null);
  const base = pk ? `/p/${pk}` : "";

  /**
   * ★★ **상태는 다중 on/off 다** (2026-09-16 사용자 지시 —
   *   *"각 상태 선택이 on off 식으로"* · *"Closed 외에 모든 상태가 적용된 상태로 보여지는거야"*).
   *
   *   ── 기본 상태를 어떻게 보나 ────────────────────────────
   *   주소에 `status` 가 없으면 **"Closed 빼고 전부 켜진 것"** 이다.
   *   목록도 그렇게 조회하므로(`buildWhere` 의 '종결 제외' 기본값) 화면과 뜻이 같다.
   *   `?closed=1` 이면 **전부** 켜진 것으로 본다.
   *
   *   ── 누르면 ────────────────────────────────────────────
   *   기본은 **주소에 안 적혀 있을 뿐** 켜져 있는 것이라, 누르는 순간 그 집합을
   *   주소에 펼쳐 적고 그 값을 끈다. 다시 전부 켜지면 `status` 를 지워
   *   **주소를 짧게 되돌린다** — 안 그러면 주소가 계속 길어진다.
   *
   * ⚠️ **옆의 숫자는 '결과 건수' 가 아니라 '그 상태의 건수' 다.** 여럿 켜면
   *   결과는 그 합이라 `Open 473` 을 눌러도 473건이 아니다.
   *   결과 건수는 **상단바(`104건 / 2,328`)** 가 말한다 — 자리를 갈라 뒀다.
   */
  const allCodes = statuses.map((s) => s.code);
  const openCodes = statuses.filter((s) => s.category !== "CLOSED").map((s) => s.code);
  /** 지금 켜진 것으로 **보이는** 상태들 */
  const onStatuses = current.length
    ? current
    : params.get("closed") === "1" ? allCodes : openCodes;

  /** 상태 하나를 켜고 끈 주소 */
  const statusUrl = (code: string) => {
    const next = onStatuses.includes(code)
      ? onStatuses.filter((c) => c !== code)
      : [...onStatuses, code];
    const p = new URLSearchParams(params.toString());
    p.delete("page");
    p.delete("closed");
    // 다시 '기본 집합' 과 똑같아지면 주소에서 지운다 — 짧게 유지한다
    const same = (a: string[], b: string[]) =>
      a.length === b.length && a.every((x) => b.includes(x));
    if (same(next, openCodes)) p.delete("status");
    else if (same(next, allCodes)) { p.delete("status"); p.set("closed", "1"); }
    else if (next.length === 0) p.set("status", "__none__");   // 하나도 안 보겠다는 뜻
    else p.set("status", next.join(","));
    const q = p.toString();
    return q ? `${base}/issues?${q}` : `${base}/issues`;
  };

  const navUrl = (key: string, value: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (value === null) p.delete(key);
    else p.set(key, value);
    p.delete("page");                 // 필터가 바뀌면 1페이지로
    // 상태를 콕 집어 고르면 '종결 제외' 기본값은 의미가 없다 — 고른 것이 이긴다
    if (key === "status" && value !== null) p.delete("closed");
    const q = p.toString();
    // ★ 프로젝트가 주소에 들어간다. 여기 한 곳만 고치면 사이드바의 모든 링크가 따라온다.
    return q ? `${base}/issues?${q}` : `${base}/issues`;
  };
  const onIssues = path === `${base}/issues`;

  /**
   * 이슈 묶음을 접었나. 브라우저에 저장한다.
   *
   * ★ `useEffect` 로 `localStorage` 를 읽어 상태에 **복사하지 않는다** (2026-09-04).
   *   그러면 옛 값으로 한 번 그린 뒤 바뀌어 깜빡이고,
   *   `react-hooks/set-state-in-effect` 에도 걸린다.
   *
   *   `useSyncExternalStore` 는 정확히 이걸 위한 훅이다 —
   *   **서버가 보는 값**(`() => true`, 펼친 상태)과 **브라우저가 보는 값**을 따로 주면
   *   React 가 하이드레이션 뒤에 알아서 맞춘다. effect 가 필요 없다.
   */
  const open = useSyncExternalStore(subscribeNav, navOpenSnapshot, () => true);
  // 사이드바가 접히면 하위 목록은 CSS 가 숨긴다. 여기서는 툴팁만 챙긴다.
  const collapsed = !useSidebarOpen();
  const toggle = () => {
    /**
     * ★★ **React 상태(`open`)를 보고 뒤집지 않는다. 클릭 시점에 원본을 읽는다.**
     *
     * 원본은 `localStorage` 이고 서버 렌더는 늘 **펼침**(`() => true`)이다.
     * React 가 하이드레이션 뒤에 맞춰 주는데, **그 보정이 오기 전에 누르면**
     * `open` 이 아직 `true` 라 같은 값을 다시 써서 **아무 일도 안 일어난다.**
     * 두 번째 클릭은 되므로 *"한 번 눌러서는 안 접힌다"* 로 보인다.
     *
     * ⚠️ `SidebarToggle` 에서 **실제로 터진 버그**다 (2026-09-16 제보).
     *   여기는 제보가 없었지만 **원인이 같아서** 같이 고쳤다 —
     *   같은 구조를 남겨 두면 언젠가 똑같이 터진다.
     */
    const next = navOpenSnapshot() === false;
    try {
      localStorage.setItem("pt-nav-issues", next ? "1" : "0");
    } catch {
      // 저장이 막혀도 접고 펴는 것 자체는 되게 둔다
    }
    navListeners.forEach((fn) => fn());
  };

  // 카테고리 순서를 고정한다. 급한 것부터 위로.
  const order = ["OPEN", "PENDING", "RESOLVED", "CLOSED"];
  const groups = order
    .map((cat) => ({ cat, items: statuses.filter((s) => s.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="navgroup">
      <div className={`nav navrow${onIssues ? " on" : ""}`}>
        <button
          type="button"
          className={`twisty${open ? " open" : ""}`}
          onClick={toggle}
          aria-label={open ? "접기" : "펼치기"}
          aria-expanded={open}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>

        <Link href={`${base}/issues`} className="navmain"
          title={collapsed ? `이슈 ${total.toLocaleString()}건` : undefined}>
          <span className="ico">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16.5h.01" />
            </svg>
          </span>
          <span className="n">이슈</span>
          <span className="cnt">{total.toLocaleString()}</span>
        </Link>
      </div>

      {open && (
        <div className="subnav">
          {/* ★★ **`?closed=1` 로 간다** (2026-09-16).
              2026-09-16 부터 목록의 기본이 **종결 제외**로 바뀌었다. 그런데 여기 붙은
              숫자(`total`)는 **종결까지 센 전건**이라, 그냥 `/issues` 로 보내면
              *"전체 15건을 눌렀는데 13건"* 이 된다 —
              대시보드가 못박은 계약(**화면의 숫자 = 링크 결과 건수**)이 깨진다. */}
          <Link href={`${base}/issues?closed=1`}
            className={`subitem${onIssues && !current.length && params.get("closed") === "1" ? " on" : ""}`}>
            <span className="sdot all" />
            <span className="sn">전체</span>
            <span className="sc">{total.toLocaleString()}</span>
          </Link>

          {groups.map(({ cat, items }) => (
            <div className="subgroup" key={cat}>
              <div className="subcat">{CATEGORY_LABEL[cat] ?? cat}</div>
              {items.map((s) => (
                <Link
                  key={s.code}
                  href={statusUrl(s.code)}
                  className={`subitem${onStatuses.includes(s.code) ? " on" : ""}${s.count === 0 ? " zero" : ""}`}
                  title={s.count === 0 ? `${s.name} — 실사용 0건` : s.name}
                >
                  <span className="sdot" style={{ background: s.color }} />
                  <span className="sn">{s.name}</span>
                  <span className="sc">{s.count.toLocaleString()}</span>
                </Link>
              ))}
            </div>
          ))}

          {rounds.length > 0 && (
            <div className="subgroup">
              <div className="subcat">차수</div>
              {rounds.map((r) => (
                <Link
                  key={r.code}
                  href={navUrl("round", currentRound.length === 1 && currentRound[0] === r.code ? null : r.code)}
                  className={`subitem${currentRound.includes(r.code) ? " on" : ""}${r.count === 0 ? " zero" : ""}`}
                  title={r.count === 0 ? `${r.name} — 아직 0건` : r.name}
                >
                  <span className="sdot all" />
                  <span className="sn">{r.name}</span>
                  <span className="sc">{r.count.toLocaleString()}</span>
                </Link>
              ))}
              {/* 엑셀에서 이관한 것들. 차수 칼럼이 없었으니 모르는 게 정상이다. */}
              {unrounded > 0 && (
                <Link
                  href={navUrl("round", currentRound.length === 1 && currentRound[0] === "none" ? null : "none")}
                  className={`subitem${currentRound.includes("none") ? " on" : ""}`}
                  title="엑셀에서 이관해 차수를 알 수 없는 이슈"
                >
                  <span className="sdot all" />
                  <span className="sn">미분류</span>
                  <span className="sc">{unrounded.toLocaleString()}</span>
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
