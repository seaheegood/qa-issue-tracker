import { requireAdmin } from "@/lib/auth";

/**
 * 전역 관리자 구역 — **팀과 사용자**.
 *
 * ★ 이 둘만 여기 있는 이유: `project_id` 가 없다. 사람과 팀은 회사에 속하지
 *   프로젝트에 속하지 않는다. 프로젝트별 설정(상태·전이·차수·템플릿)은
 *   `/p/{프로젝트}/admin` 아래에 있다.
 *
 * ★ **여기서는 보호만 한다.** 껍데기(`Shell`·탭)는 각 페이지가 `GlobalAdminFrame`
 *   으로 직접 그린다 — 걸치고 있는 프로젝트가 `?from=` 으로 오는데
 *   **레이아웃은 `searchParams` 를 못 읽기 때문**이다 (A-87).
 */
export default async function GlobalAdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
