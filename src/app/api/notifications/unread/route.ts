import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * **안 읽은 알림 건수만** 돌려준다 (2026-09-11).
 *
 * ── 왜 이게 필요한가 ───────────────────────────────────────
 * 알림 벨은 서버 컴포넌트라 **화면을 옮기거나 새로고침할 때만** 다시 그려진다.
 * 그래서 이슈 하나를 열어둔 채 일하는 사람에게는 **새 알림이 영영 안 뜬다.**
 * *"멘션했는데 알림이 안 간다"* 의 실제 원인이 대개 이것이다 — 알림은 갔고,
 * 받는 사람 화면이 그걸 모를 뿐이다.
 *
 * ★ **숫자 하나만 준다.** 벨 내용을 통째로 다시 받지 않는다.
 *   `router.refresh()` 는 **화면 전체**를 다시 렌더하므로(Next 16 `use-router`),
 *   목록 화면에서 주기적으로 부르면 2,000건짜리 질의가 그 간격마다 다시 돈다.
 *   그래서 **숫자가 달라졌을 때만** 새로 받는다 (`NotifWatch`).
 *
 * ★ **`requireUser` 가 아니라 `getCurrentUser`** 를 쓴다. 세션이 끊겼을 때
 *   `requireUser` 는 로그인 화면으로 **리다이렉트**하는데, 그걸 `fetch` 가 받으면
 *   로그인 HTML 을 JSON 으로 읽으려다 실패한다. 여기서는 401 로 분명히 말한다.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const unread = await prisma.notification.count({
    where: { userId: user.id, readAt: null },
  });

  // 이 응답은 절대 캐시하지 않는다 — 캐시되면 숫자가 안 바뀐다
  return NextResponse.json({ unread }, { headers: { "Cache-Control": "no-store" } });
}
