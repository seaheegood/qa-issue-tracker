"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SearchBox } from "@/components/SearchBox";
import { ThemeToggle } from "@/components/ThemeToggle";

/** 프로젝트별 설정 탭. 경로에 프로젝트가 들어가므로 함수로 만든다. */
const tabs = (k: string) => [
  { href: `/p/${k}/admin/project`, label: "프로젝트" },
  { href: `/p/${k}/admin/statuses`, label: "상태" },
  { href: `/p/${k}/admin/transitions`, label: "전이 규칙" },
  // 순서는 **이슈 등록 화면의 입력 순서**에 맞춘다 (docs/11 5절) —
  // 설정을 고치러 온 사람은 등록 화면에서 본 차례로 찾는다.
  { href: `/p/${k}/admin/priorities`, label: "우선순위" },
  { href: `/p/${k}/admin/environments`, label: "환경" },
  { href: `/p/${k}/admin/systems`, label: "시스템" },
  { href: `/p/${k}/admin/platforms`, label: "플랫폼" },
  { href: `/p/${k}/admin/rounds`, label: "차수" },
  { href: `/p/${k}/admin/templates`, label: "템플릿" },
  // ★ 지라는 **마지막**이다 (2026-09-21). 위 여덟은 «이 프로젝트가 어떻게 생겼나» 이고
  //   지라는 «밖으로 내보내는 길» 이라 성격이 다르다. 안 붙인 프로젝트도 있다.
  { href: `/p/${k}/admin/jira`, label: "지라 연동" },
];

/**
 * ★ `bell` 을 prop 으로 받는 이유.
 *   이 컴포넌트는 `usePathname()` 때문에 클라이언트다. 알림 벨은 DB 를 읽는
 *   서버 컴포넌트라 여기서 직접 못 만든다. 레이아웃(서버)에서 만들어 넘긴다.
 */
export function AdminTabs({ projectKey, projectName, bell }: {
  projectKey: string; projectName: string; bell?: React.ReactNode;
}) {
  const path = usePathname();
  return (
    <>
      <header className="topbar">
        <span className="page-title">프로젝트 설정</span>
        <span className="page-sub">{projectName} · 관리자 전용</span>
        <span className="spacer" />
        <SearchBox />
        {bell}
        <ThemeToggle />
      </header>
      {/* ★ 목록 툴바(`.toolbar`)와 **다른 클래스**다 (2026-09-16).
          예전엔 같이 썼는데, 목록 툴바를 두 줄로 바꾸자 **이 탭 줄이 세로로 무너졌다.** */}
      <nav className="tabbar">
        {tabs(projectKey).map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`tab${path.startsWith(t.href) ? " on" : ""}`}
          >
            {t.label}
          </Link>
        ))}
        {/* ★ **정정 (2026-09-16)** — 여기 `관리자 설정 →` 링크가 있었다.
            *"[관리자설정] 가는걸 화면에 넣지말고 사이드바에서 나오게끔"* (사용자 지시).
            탭 줄은 **이 프로젝트의 설정**만 말하고, 구역을 옮기는 일은 사이드바가 맡는다.
            ⚠️ 옮겨 간 곳(`Sidebar.tsx`)도 **`?from=` 을 데려가야** 한다 (`A-87`) —
              안 데려가면 저쪽이 `firstProjectKey()` 로 떨어져 남의 프로젝트가 된다. */}
      </nav>
    </>
  );
}
