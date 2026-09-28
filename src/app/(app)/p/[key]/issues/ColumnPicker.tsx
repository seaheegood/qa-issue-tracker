"use client";

import { useSyncExternalStore } from "react";

import { COLS_KEY, COLUMNS, DEFAULT_COLS, resetColWidths } from "@/lib/issue-columns";

/**
 * 목록에서 **어떤 컬럼을 볼지** 고른다.
 *
 * ── 원본은 어디에 있나 ─────────────────────────────────────
 * `<html data-cols="pri no title …">` 다. `ThemeToggle` 의 `data-theme`,
 * `SidebarToggle` 의 `data-sidebar` 와 같은 자리다.
 * **보이고 감추는 건 CSS 가 한다** — 여기서는 속성만 바꾼다.
 *
 * ★★ **켜고 끄는 동작은 클릭 시점에 원본(`data-cols`)을 읽는다.**
 *   React 상태를 뒤집지 않는다. 서버 렌더는 늘 기본 컬럼이고 React 는
 *   하이드레이션 뒤에야 맞추므로, 그 보정 전에 누르면 **첫 클릭이 먹지 않는다.**
 *   2026-09-16 에 `SidebarToggle` 에서 실제로 터진 버그다.
 */
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** 지금 켜진 컬럼. 원본(`<html>`)을 그대로 읽는다 — 복사본을 두지 않는다. */
function read(): string {
  return document.documentElement.dataset.cols ?? DEFAULT_COLS.join(" ");
}
function snapshot() { return read(); }
function serverSnapshot() { return DEFAULT_COLS.join(" "); }

function write(next: string[]) {
  const v = next.join(" ");
  document.documentElement.dataset.cols = v;
  try {
    localStorage.setItem(COLS_KEY, v);
  } catch {
    // 시크릿 모드 등. 이번 세션 동안은 되고 기억만 안 된다.
  }
  listeners.forEach((fn) => fn());
}

export function ColumnPicker() {
  const cols = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const on = new Set(cols.split(" ").filter(Boolean));

  const toggle = (key: string) => {
    // ★ 클릭 시점에 원본을 읽는다 (위 주석)
    const cur = read().split(" ").filter(Boolean);
    write(cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]);
  };

  return (
    <details className="dd cols">
      <summary>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16M15 4v16" />
        </svg>
        컬럼
      </summary>
      <div className="dd-menu cols-menu">
        <p className="sf-head">보여줄 칸</p>
        {COLUMNS.filter((c) => c.key !== "check").map((c) => (
          <button
            key={c.key}
            type="button"
            className={`cols-item${on.has(c.key) ? " on" : ""}`}
            onClick={() => toggle(c.key)}
            disabled={c.always}
            title={c.always ? "이 칸은 끌 수 없습니다" : undefined}
          >
            <span className="ddcheck">{on.has(c.key) || c.always ? "✓" : ""}</span>
            {c.label}
          </button>
        ))}
        {/* ★ **칸 폭까지 되돌린다** (2026-09-17). 예전엔 보이기/숨기기만 되돌려서,
            제목 칸을 한 번 끌어 좁혀 두면 되돌릴 길이 없었다 (`resetColWidths` 주석). */}
        <button
          type="button"
          className="cols-reset"
          onClick={() => { resetColWidths(); write([...DEFAULT_COLS]); }}
        >
          기본으로 되돌리기
          <span className="cols-reset-sub">보여줄 칸 · 칸 폭</span>
        </button>
      </div>
    </details>
  );
}
