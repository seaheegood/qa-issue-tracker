"use client";

import { useEffect } from "react";

/**
 * 툴바의 **실제 높이**를 CSS 변수로 내보낸다.
 *
 * ★ 왜 필요한가.
 *   툴바는 필터가 늘면 두 줄, 세 줄이 된다. 그런데 아래 그룹 머리(`.ghead`)가
 *   `top: 상단바 + 툴바` 로 붙어 있어서, 툴바가 길어지면 **그룹 머리가 툴바 뒤로 숨는다.**
 *   그래서 예전에는 툴바를 `nowrap` 으로 박아 높이를 고정했는데 —
 *   그러면 필터가 많아졌을 때 **엑셀·저장된 필터·일괄·새 이슈가 통째로 잘렸다.**
 *
 *   높이를 고정하는 대신 **재서 알려준다.** 이제 툴바는 마음껏 감싸도 된다.
 *
 * ★ JS 가 없으면 변수가 안 잡히고, CSS 가 `var(--toolbar-h, var(--h-toolbar))` 로
 *   기본값을 쓴다 — 한 줄일 때는 정확히 같은 값이라 아무 차이가 없다.
 */
export function ToolbarHeight() {
  useEffect(() => {
    const el = document.querySelector(".toolbar");
    if (!el) return;
    const set = () => {
      document.documentElement.style.setProperty(
        "--toolbar-h", `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--toolbar-h");
    };
  }, []);
  return null;
}
