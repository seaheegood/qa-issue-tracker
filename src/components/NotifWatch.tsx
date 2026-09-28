"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * **열어둔 화면에서도 새 알림이 도착하게 한다** (2026-09-11).
 *
 * ★ 벨은 서버 컴포넌트라 화면을 옮길 때만 다시 그려진다. 이슈 하나를 열어두고
 *   일하는 사람에게는 **새 알림이 영영 안 뜬다.**
 *
 * ── 어떻게 ─────────────────────────────────────────────────
 * 1. 60초마다 `/api/notifications/unread` 에서 **숫자 하나만** 받는다
 * 2. 그 숫자가 **내가 아는 값과 다를 때만** `router.refresh()` 로 벨을 다시 받는다
 *
 * ⚠️ **주기적으로 그냥 `router.refresh()` 를 부르면 안 된다.** 그건 지금 화면을
 *   **통째로** 다시 렌더한다 — 이슈 목록이라면 2,000건짜리 질의가 60초마다 다시 돈다.
 *   (`refresh()` 는 클라이언트 상태와 스크롤은 지켜준다. 비싼 건 서버 쪽이다)
 *
 * ★ **탭이 숨겨져 있으면 쉰다.** 창을 열어만 둔 사람에게 1분마다 질의를 돌릴 이유가 없다.
 *   다시 보이는 순간 **곧바로 한 번** 확인한다 — 돌아왔을 때 낡은 숫자를 보면 안 된다.
 *
 * ⚠️ 읽음 처리는 여기서 하지 않는다. 그건 폼 POST 다 (`notifications/actions.ts`) —
 *   GET 이 읽음 처리를 하면 벨을 열어보기만 해도 읽은 것이 된다.
 */
const EVERY_MS = 60_000;

export function NotifWatch({ unread }: { unread: number }) {
  const router = useRouter();
  // 서버가 방금 그려준 값. 이것과 달라졌을 때만 새로 받는다.
  // ⚠️ **렌더 중에 ref 를 건드리지 않는다** (`react-hooks/refs`). 서버가 새 값을
  //   내려주면 effect 에서 맞춘다 — PropertyPanel 이 겪은 것과 같은 계열의 규칙이다.
  const known = useRef(unread);

  useEffect(() => { known.current = unread; }, [unread]);

  useEffect(() => {
    let stopped = false;

    const check = async () => {
      if (stopped || document.hidden) return;
      try {
        const res = await fetch("/api/notifications/unread", { cache: "no-store" });
        if (!res.ok) return;                       // 401(세션 끊김) 등은 조용히 넘긴다
        const { unread: now } = await res.json();
        if (!stopped && typeof now === "number" && now !== known.current) {
          known.current = now;                      // 먼저 기억해야 연달아 새로고침하지 않는다
          router.refresh();
        }
      } catch {
        // 네트워크가 잠깐 끊긴 것뿐이다. 다음 차례에 다시 본다.
      }
    };

    const timer = setInterval(check, EVERY_MS);
    // 탭으로 돌아오면 기다리지 않고 바로 본다
    const onShow = () => { if (!document.hidden) void check(); };
    document.addEventListener("visibilitychange", onShow);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [router]);

  return null;
}
