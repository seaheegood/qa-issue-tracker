import { requireUser } from "@/lib/auth";

/**
 * 알림은 **프로젝트 밖**이다 — 여러 프로젝트의 알림이 한 곳에 모인다.
 *
 * ★ **여기서는 보호만 한다.** 껍데기(`Shell`)는 페이지가 직접 그린다 —
 *   걸치고 있는 프로젝트가 `?from=` 으로 오는데 **레이아웃은 `searchParams` 를
 *   못 읽기 때문**이다 (A-87). 레이아웃에 두면 어디서 왔든 늘 첫 프로젝트가 된다.
 */
export default async function NotificationsLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <>{children}</>;
}
