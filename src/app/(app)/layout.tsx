import { requireUser } from "@/lib/auth";

/**
 * 로그인이 필요한 화면들의 공통 껍데기.
 *
 * 여기 한 곳에서 requireUser() 를 부르므로 (app) 안의 모든 화면이 자동으로 보호된다.
 *
 * ★ **사이드바는 여기 없다.** 사이드바는 "지금 보는 프로젝트"의 숫자를 세는데,
 *   이 레이아웃은 라우트의 `[key]` 를 못 본다. 여기서 스스로 찾게 두면
 *   `/p/MALL/…` 을 열어도 첫 프로젝트 숫자가 나온다 — 실제로 그렇게 만들었다가 잡았다.
 *   그래서 `Shell` 을 각 구역(프로젝트 안 / 프로젝트 밖)이 직접 그린다.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <>{children}</>;
}
