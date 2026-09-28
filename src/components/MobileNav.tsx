"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * 좁은 화면(≤760px)에서 사이드바를 대신하는 **서랍**.
 *
 * ── 왜 사이드바를 새로 만들지 않고 감싸는가 ─────────────────────
 * 좁은 화면에서는 `.sidebar` 를 `display:none` 으로 숨기고 있었다. 그래서 폰으로
 * 들어오면 **대시보드로 갈 방법이 아예 없었다** (보이는 링크 123개 중 대시보드 0개).
 *
 * 여기서 모바일용 메뉴를 따로 만들면 메뉴가 **둘**이 된다. 상태 8종의 건수,
 * 프로젝트 전환, 설정, 로그아웃이 사이드바에 계속 붙는데 그때마다 두 곳을 고쳐야 하고,
 * 한쪽을 빠뜨리는 순간 **폰에서만 없는 메뉴**가 생긴다.
 *
 * 그래서 이 컴포넌트는 **진짜 `<Sidebar>` 를 children 으로 받아** 서랍에 담기만 한다.
 * 사이드바에 무엇을 더하든 폰에서도 자동으로 따라온다. 메뉴의 정의는 한 곳뿐이다.
 *
 * ── 데스크톱에서는 아무 일도 하지 않는다 ────────────────────────
 * `.mnav-drawer` 는 넓은 화면에서 `display: contents` 다. 즉 이 껍데기가 사라지고
 * 안의 `<Sidebar>` 가 `.app` 그리드의 첫 칸에 그대로 놓인다 — **예전과 똑같다.**
 * 사이드바를 두 번 그리지 않으므로 DB 조회도 그대로 한 번이다.
 */
export function MobileNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  /**
   * ★ "열렸다/닫혔다" 를 boolean 으로 두지 않고 **열었던 주소**를 기억한다.
   *
   *   주소가 바뀌면 `openedAt !== pathname` 이 되어 서랍이 **저절로** 닫힌다.
   *   effect 로 닫으면 화면을 한 번 그린 **뒤에** 닫혀서 서랍이 깜빡이고,
   *   `react-hooks/set-state-in-effect` 규칙에도 걸린다.
   *   상태를 주소에서 **파생**시키면 그릴 때 이미 닫혀 있다.
   *
   *   안 닫으면 메뉴를 눌러 이동해도 서랍이 화면을 덮은 채 남아서
   *   "눌렀는데 아무 일도 안 일어난 것"처럼 보인다.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt !== null && openedAt === pathname;
  const setOpen = (v: boolean) => setOpenedAt(v ? pathname : null);

  useEffect(() => {
    if (!open) return;

    // 서랍이 열린 동안 뒤 화면이 같이 스크롤되면 안 된다(스크롤 체이닝).
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // setOpen 이 아니라 setOpenedAt 을 직접 쓴다 — setOpen 은 매번 새로 만들어지는
    // 함수라 의존성 배열에 들어가야 하지만, setOpenedAt 은 리액트가 고정을 보장한다.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenedAt(null);
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="mnav-btn"
        aria-label="메뉴 열기"
        aria-expanded={open}
        aria-controls="mnav-drawer"
        onClick={() => setOpen(true)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <div
        className={`mnav-scrim${open ? " on" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div
        id="mnav-drawer"
        className={`mnav-drawer${open ? " on" : ""}`}
        // 같은 주소로 가는 링크(이미 이슈 목록인데 '이슈' 를 누름)나 상태 필터
        // (`?status=OPEN`)는 pathname 이 안 바뀌어서 위 effect 가 안 돈다. 여기서 닫는다.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a, button[type='submit']")) setOpen(false);
        }}
      >
        {children}
      </div>
    </>
  );
}
