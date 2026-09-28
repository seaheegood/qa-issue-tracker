"use client";

import { useRef } from "react";

/** 패널이 좁아질 수 있는 바닥. CSS 의 `clamp()` 와 같은 값이어야 한다. */
const MIN = 360;
const max = () => Math.round(window.innerWidth * 0.7);

/**
 * 사이드 패널의 **폭 조절 손잡이**.
 *
 * ★ **React 상태가 없다.** 폭의 원본은 `<html style="--peek-w">` 하나뿐이고,
 *   CSS 가 그걸 읽어 그린다. 상태로 들고 있으면 드래그하는 동안 프레임마다
 *   목록 전체가 다시 그려진다 — 1,800줄짜리 목록에서는 그대로 끊긴다.
 *   (`ThemeToggle` 이 테마를 상태로 안 들고 `<html data-theme>` 을 읽는 것과 같은 생각이다)
 *
 * ★ `localStorage` 쓰기는 **놓을 때 한 번**이다. 움직일 때마다 쓰면
 *   드래그 한 번에 수백 번 동기 쓰기가 일어난다.
 *
 * ★ 손잡이는 `.peek-scroll` **밖**에 둔다. 안에 두면 패널 내용과 같이 스크롤돼
 *   내려간 상태에서는 손잡이가 사라진다.
 *
 * ⚠️ `setPointerCapture` 가 있어야 커서가 손잡이를 벗어나도 드래그가 이어진다.
 *   없으면 빨리 끌 때 패널이 커서를 놓친다.
 */
export function PeekResizer() {
  const from = useRef({ x: 0, w: 0, cur: 0 });

  const apply = (w: number) => {
    from.current.cur = w;
    document.documentElement.style.setProperty("--peek-w", `${w}px`);
  };

  const save = () => {
    try {
      localStorage.setItem("pt-peek-w", String(from.current.cur));
    } catch {
      // 사파리 시크릿 모드 등. 이번 세션 동안은 그대로 쓰이고 기억만 안 된다.
    }
  };

  return (
    <div
      className="peek-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="패널 폭 조절"
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const el = e.currentTarget.parentElement;
        if (!el) return;
        from.current = { x: e.clientX, w: el.getBoundingClientRect().width, cur: 0 };
        e.currentTarget.setPointerCapture(e.pointerId);
        document.documentElement.dataset.resizing = "1";
      }}
      onPointerMove={(e) => {
        if (!document.documentElement.dataset.resizing) return;
        // 왼쪽으로 끌면 넓어진다 — 패널이 오른쪽에 붙어 있기 때문이다.
        apply(Math.min(max(), Math.max(MIN, from.current.w + (from.current.x - e.clientX))));
      }}
      onPointerUp={(e) => {
        if (!document.documentElement.dataset.resizing) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        delete document.documentElement.dataset.resizing;
        if (from.current.cur) save();
      }}
      onKeyDown={(e) => {
        // 마우스 없이도 조절할 수 있어야 한다 (손잡이가 포커스를 받는 이유).
        const step = e.key === "ArrowLeft" ? 24 : e.key === "ArrowRight" ? -24 : 0;
        if (!step) return;
        e.preventDefault();
        const el = e.currentTarget.parentElement;
        if (!el) return;
        apply(Math.min(max(), Math.max(MIN, el.getBoundingClientRect().width + step)));
        save();
      }}
    />
  );
}

/**
 * 화면이 그려지기 전에 **패널 폭과 여는 방식**을 정한다.
 *
 * ★ 테마와 같은 이유다 (`themeInitScript` · C-13). 이게 없으면 기본 520px 로 한 번
 *   그렸다가 저장해 둔 폭으로 **툭 바뀌는 게 보인다.** 툴바의 `전체 화면/사이드 패널`
 *   표시도 마찬가지로 한 번 잘못 그려졌다가 고쳐진다.
 *
 * ★ 여는 방식을 `<html data-issue-view>` 에 찍어 두면 **CSS 가 어느 쪽이 켜졌는지
 *   그릴 수 있다** — 버튼이 상태를 들고 있을 필요가 없어 하이드레이션 어긋남이 0이다.
 */
export const peekInitScript = `
(function(){
  try {
    var w = parseInt(localStorage.getItem('pt-peek-w') || '', 10);
    if (w > 0) document.documentElement.style.setProperty('--peek-w', w + 'px');
    var v = localStorage.getItem('pt-issue-view');
    document.documentElement.dataset.issueView = v === 'panel' ? 'panel' : 'page';
  } catch (e) { document.documentElement.dataset.issueView = 'page'; }
})();
`;
