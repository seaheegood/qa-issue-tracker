import { NotificationBell } from "@/components/NotificationBell";
import { Shell } from "@/components/Shell";
import { contextProjectKey } from "@/lib/project";

import { GlobalAdminTabs } from "./GlobalAdminTabs";

/**
 * **관리자 설정**(팀 · 사용자 · 프로젝트)의 껍데기.
 *
 * ★ 이름이 둘이다 — 프로젝트에 딸린 것이 `프로젝트 설정`(`/p/{키}/admin`),
 *   회사 전체에 걸리는 것이 `관리자 설정`(여기). 권한은 둘 다 관리자다.
 *
 * ★ **레이아웃이 아니라 페이지가 그린다.** Next 의 레이아웃은 `searchParams` 를
 *   못 읽는데, 걸치고 있는 프로젝트는 `?from=` 으로 온다. 레이아웃에 두면
 *   **어디서 왔든 늘 첫 프로젝트**가 된다 — 그게 바로 고치려는 고장이다.
 *
 *   같은 이유로 `(app)/layout.tsx` 도 일부러 `Shell` 을 안 그린다
 *   (`[key]` 를 못 봐서 `/p/MALL` 에도 SP 숫자가 나왔던 일).
 */
export async function GlobalAdminFrame({ from, children }: {
  from?: string;
  children: React.ReactNode;
}) {
  const key = await contextProjectKey(from);
  return (
    <Shell projectKey={key}>
      <GlobalAdminTabs bell={<NotificationBell projectKey={key} />} projectKey={key} />
      {children}
    </Shell>
  );
}
