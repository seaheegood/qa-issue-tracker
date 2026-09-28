"use client";

import { useSyncExternalStore } from "react";

/**
 * 사이드바 접기/펼치기.
 *
 * ══ 브라우저에 저장하는 토글의 규칙 ═══════════════════════
 * **켜고 끄는 동작은 클릭 시점에 원본을 읽는다. React 상태로 뒤집지 않는다.**
 *
 * 이 앱에 그런 토글이 넷이다 — 테마(`ThemeToggle`) · 사이드바(여기) ·
 * 이슈 여는 방식(`ViewModeToggle`) · 이슈 묶음(`IssueNav`).
 * 전부 **서버가 모르는 값**이라 서버 렌더와 어긋나는 순간이 반드시 생기고,
 * 그 순간에 누르면 **첫 클릭이 먹지 않는다.**
 * 실제로 이 파일이 그 규칙을 어겨서 버그가 났다 (2026-09-16 · 아래 `toggle` 주석).
 *
 * ── 원본은 어디에 있나 ─────────────────────────────────────
 * `<html data-sidebar="0|1">` 다. `ThemeToggle` 이 `data-theme` 을 쓰는 것과 같다.
 * **폭을 CSS 가 정하게** 하려는 것이다 — `:root[data-sidebar="0"]` 이 `--w-sidebar` 를
 * 56px 로 바꾸면 `.app` 그리드가 따라 줄어든다. 자바스크립트가 폭을 계산하지 않는다.
 *
 * ★ `useEffect` 로 `localStorage` 를 읽어 state 에 **복사하지 않는다** (2026-09-04).
 *   그러면 펼친 채로 한 번 그린 뒤 접혀서 깜빡이고,
 *   `react-hooks/set-state-in-effect` 에도 걸린다.
 *   `useSyncExternalStore` 는 정확히 이걸 위한 훅이다 — **서버가 보는 값**(펼침)과
 *   **브라우저가 보는 값**을 따로 주면 React 가 하이드레이션 뒤에 맞춘다.
 *   (`IssueNav` 의 이슈 묶음 접기와 같은 구조다)
 *
 * ★ 그래도 첫 페인트가 깜빡이지 않는 이유는 `sidebarInitScript` 다 —
 *   화면이 그려지기 **전에** `<html>` 에 접힘 상태를 찍어 두므로,
 *   React 가 뒤늦게 맞추는 건 **버튼의 아이콘과 라벨뿐**이고 폭은 처음부터 맞다.
 */
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 브라우저가 보는 값. 원본(`<html>` 속성)을 그대로 읽는다 — 복사본을 두지 않는다. */
function snapshot() {
  return document.documentElement.dataset.sidebar !== "0";
}

/** 서버가 보는 값. 서버는 브라우저 저장소를 모르니 **펼친 상태**로 그린다. */
function serverSnapshot() {
  return true;
}

/** 사이드바가 펼쳐져 있나. 접혔을 때만 `title` 을 다는 곳들이 쓴다. */
export function useSidebarOpen() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function SidebarToggle() {
  // 아이콘·라벨에만 쓴다. **동작에는 쓰지 않는다** — 아래 `toggle` 참고.
  const open = useSidebarOpen();
  const label = open ? "사이드바 접기" : "사이드바 펼치기";

  const toggle = () => {
    /**
     * ★★ **React 상태(`open`)를 보고 뒤집지 않는다. 클릭 시점에 원본을 읽는다.**
     *
     * 2026-09-16 에 실제로 터진 버그다 —
     * *"접힌 채로 사이트에 새로 들어가니까 사이드바가 안 펴진다."*
     *
     *   원본은 `<html data-sidebar>` 이고 `sidebarInitScript` 가 **첫 페인트 전에** 찍는다.
     *   그런데 서버 렌더는 늘 **펼침**이고(`serverSnapshot()` → true), React 는
     *   하이드레이션 **뒤에야** 진짜 값으로 맞춘다.
     *   그 보정이 커밋되기 전에 누르면 `open` 이 아직 `true` 라
     *   `next = !true = false` → **`"0"` 을 다시 써서 아무 일도 안 일어난다.**
     *   그 클릭이 리스너를 깨워 값이 맞춰지므로 **두 번째 클릭은 된다** —
     *   그래서 증상이 *"안 펴진다"* 가 아니라 *"한 번 눌러서는 안 펴진다"* 였다.
     *
     * ⚠️ 개발 모드에서는 하이드레이션이 빨라 잘 안 드러난다.
     *   제보는 `npm run serve`(프로덕션 빌드)에서 나왔다.
     */
    const next = document.documentElement.dataset.sidebar === "0";
    document.documentElement.dataset.sidebar = next ? "1" : "0";
    try {
      localStorage.setItem("pt-sidebar", next ? "1" : "0");
    } catch {
      // 사파리 시크릿 모드 등에서 막힌다. 접고 펴는 것 자체는 되게 둔다.
    }
    listeners.forEach((fn) => fn());
  };

  return (
    <button
      type="button"
      className="sb-toggle iconbtn"
      onClick={toggle}
      aria-label={label}
      aria-expanded={open}
      title={label}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {/* 사이드바 모양 — 어느 쪽이 접히는지 그림으로 말한다 */}
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9.5 4v16" />
        {/* 접으면 왼쪽으로 민다는 뜻의 화살표. 접힌 상태에서는 반대로 */}
        <path d={open ? "M16 9.5l-2.5 2.5 2.5 2.5" : "M13.5 9.5l2.5 2.5-2.5 2.5"} />
      </svg>
    </button>
  );
}

/**
 * 화면이 그려지기 **전에** 접힘 상태를 정한다 (테마와 같은 이유).
 * 이게 없으면 펼친 채로 한 번 그려졌다가 접히는 게 보인다.
 *
 * ⚠️ 기본값은 **펼침**이다. 저장된 적이 없는 사람에게 접힌 사이드바를 주면
 *    "메뉴가 사라졌다" 로 읽힌다.
 */
export const sidebarInitScript = `
(function(){
  try {
    document.documentElement.dataset.sidebar =
      localStorage.getItem('pt-sidebar') === '0' ? '0' : '1';
  } catch (e) { document.documentElement.dataset.sidebar = '1'; }
})();
`;
