import { requireUser } from "@/lib/auth";

/**
 * 내 계정은 **프로젝트 밖**이다 — 알림(`/notifications`)과 같은 자리.
 * 껍데기(`Shell`)는 페이지가 그린다. 레이아웃은 `?from=` 을 못 읽는다 (A-87).
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requireUser("/account");
  return <>{children}</>;
}
