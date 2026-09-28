"use client";

import { useEffect, useState } from "react";

/**
 * 저장했다는 **말**.
 *
 * ── 왜 필요했나 (2026-08-24 피드백 2·3번) ─────────────────────────
 * *"저장 클릭시 내용은 저장되는데 저장되었다는 알림이나 그런게 없네"*
 *
 * 화면이 바뀌지 않는 저장은 **안 된 것과 구분이 안 된다.** 그래서 사람들은
 * 한 번 더 누르거나, 새로고침해서 확인하거나, 엑셀로 돌아간다 (R1).
 *
 * ── 왜 전역 이벤트인가 ───────────────────────────────────────────
 * 저장하는 곳이 한둘이 아니다 — 드롭다운 6개 · 플랫폼 · 본문 폼 · 일괄 편집.
 * 컴포넌트마다 토스트를 하나씩 그리면 두 개가 동시에 겹치고, 위치도 제각각이 된다.
 * `window` 이벤트로 던지고 **화면에 하나뿐인 `ToastHost`** 가 받아 그린다.
 * Context 를 끼우지 않은 이유는 `"use client"` 경계를 넘어 감쌀 필요가 없어서다 —
 * 알리는 쪽은 서버 컴포넌트 안 어디에 있어도 된다.
 */
const EVENT = "pt:toast";

export type ToastKind = "ok" | "error";

/** 어디서든 부를 수 있다. `toast("우선순위를 Major 로 바꿨습니다")` */
export function toast(text: string, kind: ToastKind = "ok") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { text, kind } }));
}

type Item = { id: number; text: string; kind: ToastKind };

/** 화면에 **한 번만** 놓는다 (`Shell`). */
export function ToastHost() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    // id 는 카운터로 만든다 — 같은 밀리초에 둘이 뜨면 key 가 겹친다.
    let n = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const onToast = (e: Event) => {
      const { text, kind } = (e as CustomEvent<{ text: string; kind: ToastKind }>).detail;
      const id = ++n;
      // 최근 3개까지만. 더 쌓이면 읽지도 못하면서 화면만 가린다.
      setItems((prev) => [...prev.slice(-2), { id, text, kind }]);
      const t = setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== id));
        timers.delete(t);
      }, kind === "error" ? 5000 : 2600);
      timers.add(t);
    };

    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      for (const t of timers) clearTimeout(t);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    /* 읽어주는 순서는 화면 순서와 같게. aria-live 라 새로 뜬 줄만 읽힌다. */
    <div className="toast-host" role="status" aria-live="polite">
      {items.map((it) => (
        <div key={it.id} className={`toast ${it.kind}`}>
          <span className="ti" aria-hidden="true">
            {it.kind === "ok" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
            )}
          </span>
          <span>{it.text}</span>
        </div>
      ))}
    </div>
  );
}
