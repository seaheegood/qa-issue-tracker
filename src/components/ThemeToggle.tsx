"use client";

type Theme = "light" | "dark";

/**
 * 다크/라이트 토글.
 *
 * 실제 적용은 `<html data-theme="…">` 속성으로 하고, CSS 변수가 그걸 보고 바뀐다.
 * 선택은 `localStorage` 에 저장한다 (C-12).
 *
 * ★ **React state 를 쓰지 않는다** (2026-09-04).
 *   예전엔 `useState` + `useEffect` 로 `data-theme` 을 읽어와 상태에 **복사**했다.
 *   그런데 테마의 원본은 `<html>` 속성이다 — 복사본을 두면 두 곳이 갈라질 수 있고,
 *   서버는 그 값을 모르니 첫 렌더가 반드시 어긋난다(그래서 effect 로 메우고 있었다).
 *
 *   **원본을 그대로 읽게 두면 그 문제가 통째로 사라진다.** 아이콘 둘을 다 그려 놓고
 *   `:root[data-theme]` 이 CSS 로 하나만 보이게 한다 —
 *   상태 0개 · effect 0개 · 하이드레이션 어긋남 0개.
 *   (`buildWhere()` 를 한 곳으로 모은 것과 같은 생각이다 — **원본은 하나여야 한다**)
 *
 * ⚠️ 그래서 이 버튼은 **클릭 시점에** 현재 테마를 읽는다. 들고 있지 않는다.
 */
export function ThemeToggle() {
  const toggle = () => {
    const cur = (document.documentElement.dataset.theme as Theme) ?? "dark";
    const next: Theme = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("pt-theme", next);
    } catch {
      // 사파리 시크릿 모드 등에서 막힌다. 테마 전환 자체는 되게 둔다.
    }
  };

  return (
    <button className="iconbtn theme-btn" onClick={toggle} aria-label="테마 전환" title="테마 전환">
      {/* 다크일 때 보이는 해 — "라이트로 바꾼다" */}
      <svg className="ico-sun" width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      {/* 라이트일 때 보이는 달 — "다크로 바꾼다" */}
      <svg className="ico-moon" width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    </button>
  );
}

/**
 * 화면이 그려지기 전에 테마를 정한다 (C-13).
 * 이게 없으면 라이트로 한 번 깜빡였다가 다크로 바뀌는 게 보인다.
 */
export const themeInitScript = `
(function(){
  try {
    var t = localStorage.getItem('pt-theme');
    if (!t) t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
  } catch (e) { document.documentElement.dataset.theme = 'dark'; }
})();
`;
