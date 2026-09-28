"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SearchBox } from "@/components/SearchBox";
import { ThemeToggle } from "@/components/ThemeToggle";

const TABS = [
  { href: "/admin/projects", label: "프로젝트" },
  { href: "/admin/teams", label: "팀" },
  { href: "/admin/users", label: "사용자" },
  { href: "/admin/feedback", label: "의견" },
];

/** 전역 설정 탭. 프로젝트별 설정은 `/p/{키}/admin` 에 따로 있다. */
export function GlobalAdminTabs({ bell, projectKey }: {
  bell?: React.ReactNode;
  /** 돌아갈 프로젝트. 상태·전이 규칙·차수·템플릿은 프로젝트 안에 있다 */
  projectKey?: string | null;
}) {
  const path = usePathname();
  // ★ 탭 사이를 옮겨도 걸치고 있는 프로젝트를 놓치지 않는다 (A-87).
  //   `팀 → 사용자` 한 번에 남의 프로젝트로 떨어지면 고친 의미가 없다.
  const q = projectKey ? `?from=${projectKey}` : "";
  return (
    <>
      <header className="topbar">
        <span className="page-title">관리자 설정</span>
        <span className="page-sub">회사 전체 — 팀 · 사용자 · 프로젝트 · 의견</span>
        <span className="spacer" />
        <SearchBox />
        {bell}
        <ThemeToggle />
      </header>
      {/* 목록 툴바(`.toolbar`)와 **다른 클래스**다 — 위 AdminTabs 주석 참고 */}
      <nav className="tabbar">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href + q} className={`tab${path.startsWith(t.href) ? " on" : ""}`}>
            {t.label}
          </Link>
        ))}
        {/* ★ 상태·전이 규칙은 프로젝트에 딸린다 — 그쪽이 **프로젝트 설정**이다.
            여기서 찾다 못 찾는 일이 없게 돌아가는 길을 둔다 */}
        {projectKey && (
          <Link href={`/p/${projectKey}/admin/project`} className="tab out"
            title="상태 · 전이 규칙 · 우선순위 · 환경 · 시스템 · 플랫폼 · 차수 · 템플릿">
            ← 프로젝트 설정
          </Link>
        )}
      </nav>
    </>
  );
}
