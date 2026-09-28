"use client";

import { useRouter } from "next/navigation";

/** 지금 고른 여는 방식. 원본은 `localStorage` 이고 `<html data-issue-view>` 는 그 사본이다. */
export function readViewMode(): "page" | "panel" {
  let mode: "page" | "panel" = "page";
  try {
    mode = localStorage.getItem("pt-issue-view") === "panel" ? "panel" : "page";
  } catch {
    // 시크릿 모드 등. 기본값(전체 화면)으로 둔다 — 링크가 가리키는 그대로다.
  }
  // 다른 탭에서 바꿨을 수 있다. CSS 가 보는 사본을 여기서 맞춰 준다.
  document.documentElement.dataset.issueView = mode;
  return mode;
}

/**
 * 줄 클릭을 **사이드 패널로 승격**시키는 껍데기.
 *
 * ★★ **줄의 `href` 는 건드리지 않는다.** 항상 `/p/{키}/issues/{번호}` 그대로다 —
 *   ⌘클릭·가운데클릭·`새 탭에서 열기`·JS 꺼짐이 전부 **진짜 페이지**로 간다.
 *   `href` 가 거짓말을 하기 시작하면 브라우저가 해 주던 것이 전부 깨진다.
 *   점진적 향상 그대로다 — `<Link>` 가 바닥이고 JS 가 그 위에 얹는다.
 *
 * ★ **줄마다 핸들러를 달지 않는다.** 한 화면에 50~600줄이 뜨는데 줄마다 클로저를
 *   만들면 그만큼이 클라이언트 번들과 메모리에 얹힌다. 묶음 하나에 위임 클릭 한 개면
 *   `closest("a.row")` 로 어느 줄인지 알 수 있다 — 넘길 데이터도 없다.
 *   (목록 자체는 그대로 **서버 컴포넌트**로 남는다)
 *
 * ★ 열린 패널은 주소(`?peek=1702`)가 기억한다. 그래서 공유되고, 뒤로가기가 되고,
 *   서버가 읽어서 첫 응답에 이미 들어 있다.
 */
export function PeekLinks({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <div
      className="peek-list"
      /*
       * ⚠️⚠️ **`onClick` 이 아니라 `onClickCapture` 여야 한다.**
       *   `<Link>` 는 `<a>` 자신에 `onClick` 을 단다. 거품 단계에서는 **줄이 먼저**
       *   처리되므로, 여기서 아무리 `preventDefault()` 를 해도 `router.push()` 는
       *   이미 나간 뒤다 — 상세 페이지로 갔다가 패널 주소로 한 번 더 가게 된다.
       *   잡는 단계에서 먼저 막아야 한다. (Next 의 Link 는 `e.defaultPrevented` 면
       *   물러나므로, 잡는 단계의 `preventDefault()` 하나로 실제로 멈춘다)
       */
      onClickCapture={(e) => {
        if (readViewMode() !== "panel") return;
        // ⚠️ 좁은 화면에서는 승격하지 않는다. 목록 옆에 패널을 세울 자리가 없다.
        //   (미디어쿼리로는 못 막는다 — 막아야 하는 건 그리기가 아니라 이동이다)
        if (window.innerWidth <= 980) return;
        // 새 탭·새 창으로 여는 손짓은 브라우저에게 그대로 넘긴다.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if ((e.nativeEvent as MouseEvent).button !== 0) return;

        const a = (e.target as HTMLElement).closest?.("a.row");
        if (!a) return; // 체크박스 등 — 줄 링크가 아니면 아무것도 안 한다

        const seq = a.getAttribute("href")?.split("/").pop();
        if (!seq) return;

        e.preventDefault();
        e.stopPropagation();
        const sp = new URLSearchParams(window.location.search);
        sp.set("peek", seq);
        // ⚠️ `scroll: false` 가 없으면 줄을 누를 때마다 목록이 맨 위로 튄다.
        router.push(`${window.location.pathname}?${sp}`, { scroll: false });
      }}
    >
      {children}
    </div>
  );
}
