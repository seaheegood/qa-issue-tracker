import { BrandLink } from "@/components/BrandLink";
import { ProjectSwitch } from "@/components/ProjectSwitch";
import { SidebarToggle } from "@/components/SidebarToggle";
import Link from "next/link";
import { Suspense } from "react";

import { logout } from "@/app/login/actions";
import { FeedbackLink } from "@/components/FeedbackLink";
import { NavLink } from "@/components/NavLink";
import { IssueNav, type RoundItem, type StatusItem } from "@/components/IssueNav";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/lib/ui";
import { notDeleted } from "@/lib/issue-filter";



/**
 * 좌측 사이드바.
 *
 * 프로젝트를 맨 위에 두는 건 취향이 아니라 설계다.
 * P-1 "프로젝트는 나중에 붙이는 기능이 아니라 모든 데이터의 뿌리" 를 화면으로 옮긴 것.
 * 지금은 프로젝트가 1개뿐이지만, 그건 "1개인 상태"일 뿐이다.
 */
export async function Sidebar({ user, projectKey }: {
  user: SessionUser;
  /**
   * 지금 보는 프로젝트. **반드시 받아야 한다.**
   *
   * ★ 예전엔 여기서 `firstProjectKey()` 로 스스로 찾았는데, 그러면
   *   `/p/MALL/issues` 를 열어도 사이드바 숫자는 **첫 프로젝트 것**이 나왔다.
   *   프로젝트가 하나일 땐 안 보이던 종류의 고장이다 —
   *   화면이 다른 프로젝트의 숫자를 자기 것처럼 보여준다.
   */
  projectKey: string | null;
}) {
  // ★ 지금 보는 프로젝트는 **주소**가 정한다 (`/p/SP/…`). 사이드바는 그 바깥이라
  //   경로를 못 읽으므로, 클라이언트 조각(ProjectSwitch·IssueNav)이 읽어서 쓴다.
  //   여기서는 목록과 기본값만 준비한다.
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, key: true, name: true },
    orderBy: { id: "asc" },
  });
  const project = projects.find((x) => x.key === projectKey) ?? null;

  // 관리자에게만 — 안 읽은 의견 수 (2026-09-28 · `F-09`). 알림 표가 이슈에 매여 있어 알림으로는 못 보낸다
  const unreadFeedback = user.systemRole === "ADMIN"
    ? await prisma.feedback.count({ where: { checkedAt: null } })
    : 0;

  const [issueCount, importCount, me, statusList, statusCounts, roundList, roundCounts] = await Promise.all([
    // ⚠️ 숨긴 이슈는 세지 않는다 — 목록(`buildWhere`)과 같은 조건이어야 한다 (2026-09-17)
    project ? prisma.issue.count({ where: { projectId: project.id, ...notDeleted } }) : 0,
    // 대량등록으로 올린 엑셀 (FR-907)
    project ? prisma.importedList.count({ where: { projectId: project.id } }) : 0,
    // 내 프로필 색도 소속 팀 색을 따른다
    prisma.user.findUnique({
      where: { id: user.id },
      select: { team: { select: { name: true, color: true } } },
    }),
    project
      ? prisma.issueStatus.findMany({
          where: { projectId: project.id, isActive: true },
          orderBy: { sortOrder: "asc" },
        })
      : [],
    project
      ? prisma.issue.groupBy({
          by: ["statusId"],
          where: { projectId: project.id, ...notDeleted },
          _count: { _all: true },
        })
      : [],
    project
      ? prisma.round.findMany({
          where: { projectId: project.id, isActive: true },
          orderBy: { sortOrder: "asc" },
        })
      : [],
    project
      ? prisma.issue.groupBy({
          by: ["roundId"],
          where: { projectId: project.id, ...notDeleted },
          _count: { _all: true },
        })
      : [],
  ]);

  const countByStatus = new Map(statusCounts.map((r) => [r.statusId, r._count._all]));
  const countByRound = new Map(roundCounts.map((r) => [r.roundId, r._count._all]));
  // 마스터를 기준으로 돌린다. 0건인 차수도 사라지지 않아야 "아직 아무것도 없다"가 보인다.
  const rounds: RoundItem[] = roundList.map((r) => ({
    code: r.code, name: r.name, count: countByRound.get(r.id) ?? 0,
  }));
  // 이관한 1,704건은 차수를 모른다. 따로 셀 수 있어야 한다.
  const unroundedCount = countByRound.get(null) ?? 0;
  const statuses: StatusItem[] = statusList.map((s) => ({
    code: s.code,
    name: s.name,
    color: s.color,
    category: s.category,
    count: countByStatus.get(s.id) ?? 0,
  }));

  return (
    <aside className="sidebar">
      {/* ★ 접기 버튼은 **머리에** 둔다 — 접힌 뒤에도 같은 자리에서 다시 펼 수 있어야 한다.
          좁은 화면(≤760px)에서는 CSS 가 숨긴다. 거기선 사이드바가 이미 서랍이라
          접는다는 말 자체가 성립하지 않는다. */}
      <div className="sb-head">
        <BrandLink fallbackKey={project?.key ?? null} />
        <SidebarToggle />
      </div>

      <ProjectSwitch projects={projects} fallback={project?.key ?? null} />


      <Suspense
        fallback={
          <div className="nav" title="이슈">
            <span className="n">이슈</span>
            <span className="cnt">{issueCount.toLocaleString()}</span>
          </div>
        }
      >
        <IssueNav
          statuses={statuses} rounds={rounds} unrounded={unroundedCount}
          total={issueCount} fallbackKey={project?.key ?? null}
        />
      </Suspense>

      {/* 이슈 대량등록 (FR-907).
          ★ **0건이어도 누를 수 있게 둔다.** 여기는 만드는 입구라,
            잠가 두면 첫 파일을 올릴 길이 없어진다. */}
      <NavLink
        href="imports"
        label="이슈 대량등록"
        fallbackKey={project?.key ?? null}
        badge={importCount > 0 ? <span className="cnt">{importCount}</span> : undefined}
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5M12 15V3" />
          </svg>
        }
      />

      <NavLink
        href="dashboard"
        label="대시보드"
        fallbackKey={project?.key ?? null}
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
          </svg>
        }
      />

      {user.systemRole === "ADMIN" ? (
        <NavLink
          // ★ 사이드바에서 가는 곳은 **지금 프로젝트의 설정**이다.
          //   상태·전이 규칙·차수·템플릿이 거기 있다.
          //   전역(/admin/teams)으로 보냈더니 "전이 규칙 어디 갔냐" 는 질문을 받았다.
          href="admin/project"
          label="프로젝트 설정"
          /**
           * ⚠️ **`fallbackKey` 가 없으면 프로젝트 밖에서 `/` 로 떨어진다** (2026-09-17 제보 —
           *   *"관리자 설정 들어갔다가 프로젝트 설정으로 들어가는 게 불가능"*).
           *
           *   `href` 가 상대(`admin/project`)라 `NavLink` 가 지금 프로젝트를 앞에 붙인다.
           *   그런데 `/admin/*`·`/notifications` 는 주소에 프로젝트가 없어서
           *   `useProjectKey()` 가 `null` 을 주고, 그러면 **`/` 로 간다.**
           *   위 `이슈 대량등록`·`대시보드` 는 이걸 넘기고 있었는데 여기만 빠져 있었다 —
           *   그래서 **관리자 설정에 들어가면 프로젝트 설정으로 돌아올 길이 없었다.**
           */
          fallbackKey={project?.key ?? null}
          badge={<span className="cnt">상태 · 전이</span>}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
            </svg>
          }
        />
      ) : (
        <span className="nav off" title="프로젝트 설정 — 관리자 전용">
          <span className="ico">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
            </svg>
          </span>
          <span className="n">프로젝트 설정</span>
          <span className="soon">관리자 전용</span>
        </span>
      )}

      {/* ★★ **관리자 설정을 사이드바로 옮겼다** (2026-09-16 사용자 지시 —
          *"[관리자설정] 가는걸 화면에 넣지말고 사이드바에서 나오게끔"*).
          예전엔 프로젝트 설정 **탭 줄 끝**의 `관리자 설정 →` 가 유일한 입구였다.
          ⚠️ **`?from=` 을 반드시 데려간다** (`A-87`). 안 데려가면 저쪽이
            `firstProjectKey()` 로 떨어져 **WEB 에서 눌렀는데 첫 프로젝트**이 된다.
          ⚠️ `match` 를 따로 주는 이유 — 쿼리가 붙은 주소는 `usePathname()` 과
            절대 같아지지 않아 **영영 강조되지 않는다.** */}
      {user.systemRole === "ADMIN" && (
        <NavLink
          href={unreadFeedback > 0
            ? (project ? `/admin/feedback?from=${project.key}` : "/admin/feedback")
            : (project ? `/admin/teams?from=${project.key}` : "/admin/teams")}
          match="/admin"
          label="관리자 설정"
          badge={unreadFeedback > 0
            ? <span className="cnt fb-new" title="안 읽은 의견">의견 {unreadFeedback}</span>
            : <span className="cnt">팀 · 사용자</span>}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
      )}

      {/* ★ 모두에게 보인다 — 관리자 전용이 아니다. 불편은 쓰는 사람이 먼저 안다 (2026-09-28) */}
      <Suspense fallback={null}>
        <FeedbackLink />
      </Suspense>

      <div className="sb-foot">
        <div className="sb-user">
          <Avatar name={user.name} color={me?.team?.color} />
          <span className="u">
            <span className="un">{user.name}</span>
            <span className="ur">
              {[me?.team?.name, user.systemRole === "ADMIN" ? "관리자" : null]
                .filter(Boolean)
                .join(" · ") || user.loginId}
            </span>
          </span>
          {/* ★ 내 계정(비밀번호 변경) — 이름 옆 열쇠. 알림처럼 **프로젝트 밖**이라 `?from=` 을 데려간다 (A-87) */}
          <Link
            href={projectKey ? `/account?from=${projectKey}` : "/account"}
            className="iconbtn" title="내 계정 · 비밀번호 변경" aria-label="내 계정 · 비밀번호 변경"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7.5" cy="15.5" r="4.5" />
              <path d="M10.7 12.3 21 2M16 7l3 3M19 4l2 2" />
            </svg>
          </Link>
          <form action={logout}>
            <button type="submit" className="iconbtn" title="로그아웃" aria-label="로그아웃">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
