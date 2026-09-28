"use client";

import { COLW_KEY, resetColWidths } from "@/lib/issue-columns";

/**
 * 칸 폭 손잡이. 머리줄 각 칸의 오른쪽 끝을 끌어 폭을 바꾼다.
 *
 * ★ **React 상태가 하나도 없다.** 폭은 CSS 변수(`--cw-{키}`)가 정하고,
 *   끄는 동안에는 DOM 에 직접 쓴다 — 드래그 중 리렌더가 0이다.
 *   (`PeekResizer` 와 같은 방식)
 *
 * ★ `localStorage` 쓰기는 **놓을 때 한 번**이다. 움직일 때마다 쓰면
 *   1초에 수십 번 직렬화한다.
 *
 * ⚠️ 머리 칸과 줄 칸이 **같은 변수**를 본다. 여기서 한 값만 바꾸면 둘이 같이 움직인다 —
 *   따로 두면 머리와 몸이 어긋난다 (실제로 한 번 어긋나 본 자리다).
 */
const MIN = 40;
/**
 * 상한은 **줄 폭**이다 — 칸이 줄보다 넣을 수는 없다.
 *
 * ⚠️ 예전엔 `800` 이 박혀 있었다. 좋은 값처럼 보였지만,
 *   **넓은 화면에서 제목 칸을 늘리려면 800px 에서 막혔다** —
 *   1920px 창에서 제목이 800 에서 멈추고 **오른쪽 200px 이 빈 채** 늘지 않았다
 *   (2026-09-17 제보). 모니터가 커지면 마법의 숫자는 반드시 틀린다.
 */
const maxFor = (cell: HTMLElement) =>
  Math.max(200, Math.round(cell.parentElement?.getBoundingClientRect().width ?? 1200));

export function ColumnGrip({ col }: { col: string }) {
  const onDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();          // 머리글 클릭(정렬)이 같이 먹지 않게
    const grip = e.currentTarget;
    const cell = grip.parentElement;
    if (!cell) return;

    const root = document.documentElement;
    const startX = e.clientX;
    const startW = cell.getBoundingClientRect().width;
    const max = maxFor(cell);

    /**
     * 제목 칸이 **안 정해 둔 상태에서 먹는 폭**.
     *
     * ★ 제목은 남는 폭을 먹는 칸이라 그 값까지 끌고 나면
     *   **상한을 아예 벗겨** 다시 유연해지게 한다.
     *   안 그랬면 창을 키우는 순간 오른쪽이 빈다 — 한 번 끈 것이
     *   영영 고정폭이 되는 것은 쓰는 사람이 기대하는 동작이 아니다.
     * ⚠️ 재단이 한 번 일어나므로 **끌 때 한 번만** 재고 끌기는 동안엔 안 재다.
     */
    let flexW = Infinity;
    if (col === "title") {
      const keep = root.style.getPropertyValue("--cw-title");
      root.style.removeProperty("--cw-title");
      flexW = cell.getBoundingClientRect().width;
      if (keep) root.style.setProperty("--cw-title", keep);
    }

    grip.setPointerCapture(e.pointerId);
    root.dataset.colresize = "1";   // 끄는 동안 글자가 선택되지 않게

    const move = (ev: PointerEvent) => {
      const w = Math.min(max, Math.max(MIN, Math.round(startW + ev.clientX - startX)));
      if (col === "title" && w >= flexW - 4) root.style.removeProperty("--cw-title");
      else root.style.setProperty(`--cw-${col}`, `${w}px`);
    };
    const up = () => {
      grip.releasePointerCapture(e.pointerId);
      delete root.dataset.colresize;
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      try {
        const saved = JSON.parse(localStorage.getItem(COLW_KEY) ?? "{}");
        const now = parseInt(root.style.getPropertyValue(`--cw-${col}`), 10);
        // 제목을 끝까지 늘렸으면 상한을 벗은 것이다 — 저장소에서도 지운다
        if (Number.isFinite(now)) saved[col] = now;
        else delete saved[col];
        localStorage.setItem(COLW_KEY, JSON.stringify(saved));
      } catch {
        // 시크릿 모드 등. 이번 세션 동안은 되고 기억만 안 된다.
      }
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
  };

  /**
   * 두 번 누르면 **그 칸만** 기본 폭으로 (표에서 흔한 방식).
   *
   * ⚠️ 특히 **제목 칸**에 필요하다 — 한 번 끌면 그 값이 상한이 되어
   *   넓은 화면에서 오른쪽이 통째로 빈다. 되돌릴 길이 메뉴 하나뿐이면 못 찾는다
   *   (2026-09-17 제보).
   */
  const onDouble = (e: React.MouseEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    document.documentElement.style.removeProperty(`--cw-${col}`);
    try {
      const saved = JSON.parse(localStorage.getItem(COLW_KEY) ?? "{}");
      delete saved[col];
      if (Object.keys(saved).length) localStorage.setItem(COLW_KEY, JSON.stringify(saved));
      else resetColWidths();
    } catch {
      // 저장소가 막혔어도 지금 화면은 되돌아간다
    }
  };

  return (
    <span
      className="colgrip"
      onPointerDown={onDown}
      onDoubleClick={onDouble}
      // 머리글이 정렬 링크인 칸도 있다 — 손잡이를 눌렀을 때 그리로 가면 안 된다
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      role="separator"
      aria-orientation="vertical"
      aria-label="칸 폭 조절"
      title="끌어서 폭 조절 · 두 번 누르면 기본값으로"
    />
  );
}
