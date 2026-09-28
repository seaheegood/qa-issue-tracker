"use client";

import { useEffect } from "react";

/**
 * 열린 팝업을 **Esc** 로 닫는다. 바깥을 눌러도 닫힌다.
 *
 * ★ 이 앱의 팝업은 전부 `<details>` 다 — 자바스크립트가 없어도 열리라고 그렇게 만들었다.
 *   그 대가로 **닫는 방법이 "그 버튼을 다시 누르기" 하나뿐**이었다. 필터를 고르고
 *   다른 데를 누르면 메뉴가 그대로 떠 있어서 뒤를 가린다.
 *
 * ★ 여기서 여는 방법은 손대지 않는다. **닫는 방법만 더한다.**
 *   그래서 JS 가 없어도 예전과 똑같이 동작한다 — 닫기가 불편할 뿐이다.
 *
 * ★ 대상은 `.dd`(툴바 드롭다운 · 저장된 필터 · 일괄 · 알림 벨)와 `.proj`(프로젝트 전환)
 *   **뿐이다.** 이슈 수정(`.edit-wrap`)과 답글(`.reply-wrap`)은 폼이지 팝업이 아니다 —
 *   Esc 로 닫으면 **쓰던 글이 날아간다.** 상태 묶음(`.group`)도 접는 장치라 제외한다.
 */
const POPUP = "details.dd[open], details.proj[open]";

export function PopupClose() {
  useEffect(() => {
    const close = (d: Element) => {
      d.removeAttribute("open");
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      /**
       * ★★ **팝업이 먼저다** (2026-09-17). 변경 이력 팝업은 `<details>` 가 아니라
       *   주소로 여닫는다(`?history=1`) — 그래서 닫는 것도 **링크를 누르는 것**이다.
       *
       * ★ 닫는 법을 여기 모으는 이유 — 팝업이 생기면서 «닫는 방식»이 둘이 됐다.
       *   각자 Esc 를 달면 **하나만 고쳐도 다른 하나가 어긋난다** (`S-05`~`S-08` 과 같은 생각).
       * ⚠️ 팝업이 떠 있으면 아래 `<details>` 는 건드리지 않는다 — 한 번에 하나만 닫는다.
       */
      const modalX = document.querySelector<HTMLElement>(".modal-back .modal-x");
      if (modalX) {
        e.preventDefault();
        modalX.click();
        return;
      }

      const open = document.querySelectorAll(POPUP);
      if (open.length === 0) return;
      // 브라우저 기본 Esc(입력 되돌리기 등)를 가로채지 않도록, 실제로 닫을 게
      // 있을 때만 막는다.
      e.preventDefault();
      open.forEach((d) => {
        close(d);
        // 닫은 뒤 초점을 그 버튼으로 돌려준다. 안 그러면 키보드 사용자가
        // 문서 맨 위로 튕긴다.
        (d.querySelector("summary") as HTMLElement | null)?.focus();
      });
    };

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      document.querySelectorAll(POPUP).forEach((d) => {
        if (!d.contains(t)) close(d);
      });
    };

    document.addEventListener("keydown", onKey);
    // 캡처 단계에서 듣는다. 메뉴 안의 링크가 자기 자신을 지우며 사라지면
    // 버블 단계에서는 `contains` 가 이미 false 가 되어 엉뚱하게 닫힌 것처럼 보인다.
    document.addEventListener("mousedown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown, true);
    };
  }, []);

  return null;
}
