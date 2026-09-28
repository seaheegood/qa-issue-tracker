"use client";

import { useRouter } from "next/navigation";

/**
 * 이슈를 **어떻게 열 것인가** — 전체화면 / 사이드탭.
 *
 * ★ 라벨은 `전체화면` · `사이드탭` 이다 (2026-09-17 사용자 지시).
 *   ⚠️ 안쪽 이름(`panel` · `.vm-panel` · `pt-issue-view`)은 **그대로 둔다** —
 *     CSS·blocking 스크립트·저장된 값이 전부 그 이름을 쓴다. 라벨만 바꾼다.
 *
 * ★ **상태를 들고 있지 않는다.** 원본은 `localStorage["pt-issue-view"]` 이고,
 *   `<html data-issue-view>` 가 그 사본이다. 어느 쪽이 켜졌는지는 **CSS 가 그린다**
 *   (`:root[data-issue-view="panel"] .vm-panel`). 그래서 서버 렌더와 어긋날 일이 없다 —
 *   `ThemeToggle` 과 똑같은 방식이다 (C-12).
 *
 * ★ 이 선택은 **쿠키가 아니다.** 서버가 알 필요가 없는 개인 취향이고,
 *   쿠키로 두면 요청마다 실려 가면서 캐시 키까지 흔든다. 열린 패널이 무엇인지는
 *   주소(`?peek=`)가 말하고, 취향만 브라우저가 기억한다.
 *
 * ★ **사이드탭을 보다가 `전체화면` 을 누르면 보던 이슈를 그대로 전체화면으로 연다.**
 *   그냥 패널만 닫으면 방금 읽던 것이 사라진다.
 */
export function ViewModeToggle() {
  const router = useRouter();

  const set = (mode: "page" | "panel") => {
    document.documentElement.dataset.issueView = mode;
    try {
      localStorage.setItem("pt-issue-view", mode);
    } catch {
      // 시크릿 모드 등. 이번 세션 동안은 동작하고 기억만 안 된다.
    }
    const open = new URLSearchParams(window.location.search).get("peek");
    if (mode === "page" && open) {
      router.push(`${window.location.pathname}/${open}`);
    }
  };

  return (
    <div className="vmode" role="group" aria-label="이슈를 여는 방식">
      <button
        type="button" className="vm-page" onClick={() => set("page")}
        title="줄을 누르면 이슈 상세 페이지로 이동합니다"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
        </svg>
        전체화면
      </button>
      <button
        type="button" className="vm-panel" onClick={() => set("panel")}
        title="줄을 누르면 목록은 그대로 두고 오른쪽 사이드탭에 엽니다"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M14 4v16" />
        </svg>
        사이드탭
      </button>
    </div>
  );
}
