import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { people } from "@/lib/people";
import type { ProjectRef } from "@/lib/project";
import type { SessionUser } from "@/lib/auth";
import { notDeleted } from "@/lib/issue-filter";
import { jiraBoxData } from "@/lib/jira";
import { Avatar, Badge, formatFull, issueNo, StatusDot } from "@/lib/ui";
import { ProjectField } from "@/components/ProjectField";

import { hideIssue, restoreIssue } from "./actions";
import { Attachments } from "./Attachments";
import { CommentForm } from "./CommentForm";
import { CommentList } from "./CommentList";
import { HistoryList } from "./HistoryList";
import { IssueEditor } from "./IssueEditor";
import { JiraBox } from "./JiraBox";
import { PropertyPanel } from "./PropertyPanel";
import { WatchBox } from "./WatchBox";

/**
 * 이슈 상세의 **내용물**. 전체 페이지(`[seq]/page.tsx`)와 목록 옆 사이드 패널이
 * 이 한 컴포넌트를 함께 쓴다.
 *
 * ★ **왜 뺐나.** 상세를 두 곳에서 그리게 되면서, 복제하면 곧바로
 *   *"전체 화면에서는 되는데 패널에서는 안 되는 것"* 이 생긴다.
 *   `buildWhere()` 를 `issue-filter.ts` 한 곳에 둔 것과 같은 이유다 — **원본은 하나여야 한다.**
 *
 * ⚠️ **`me` · `project` 를 인자로 받는다.** `requireUser()`·`requireProject()` 는
 *   React `cache()` 로 감싸여 있지 않아, 여기서 다시 부르면 렌더마다 세션·프로젝트
 *   조회가 한 번씩 더 붙는다. 부르는 쪽이 이미 가진 값을 그대로 넘긴다.
 *
 * ⚠️⚠️ **`compact` 에서는 절대 `notFound()` 를 부르지 않는다.**
 *   패널은 목록 **안에** 그려지므로, 지워진 번호를 가리키는 옛 링크 하나에
 *   **목록이 통째로 404** 가 된다. 패널은 "찾을 수 없습니다 + 닫기" 를 그리고,
 *   `notFound()` 는 전체 페이지에만 남긴다.
 *
 * ⚠️ **여기서 부르는 서버 액션이 `redirect()` 로 끝나면 안 된다.**
 *   패널은 `…/issues?peek=1702` 에서 도는데, 액션이 `/p/{키}/issues/{번호}` 로
 *   보내버리면 **목록이 사라진다** — 패널로 여는 의미가 없어진다.
 *   `[seq]/actions.ts` 의 액션은 전부 `revalidateIssue()` 로 끝난다 (그 파일 머리 주석 참조).
 */

/** 주소 조각 → 이슈 번호. `PT-1702` 처럼 약자가 붙어 와도 숫자만 남긴다. */
export function parseSeq(raw: string): number | null {
  const n = Number(decodeURIComponent(raw).replace(/^\D+-?/, ""));
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/**
 * **필요할 때만** 도는 조회 둘.
 *
 * ★ 조건이 서로 다르다 — 이력은 `?history=1` 일 때만, 화면명 목록은 전체 페이지일 때만.
 *   예전엔 둘을 `compact` 하나로 묶었는데, 이력을 주소로 열게 되면서 갈라졌다.
 */
async function fullOnly(
  projectId: number,
  issueId: number,
  want: { history: boolean; screens: boolean },
) {
  const [histories, screenRows] = await Promise.all([
    want.history
      ? prisma.issueHistory.findMany({
      where: { issueId },
      orderBy: { id: "desc" },
      include: {
        changedBy: { select: { name: true, team: { select: { name: true, color: true } } } },
      },
    })
      : Promise.resolve([]),
    // 프로젝트 **전건** groupBy 다. 수정 폼의 `<datalist>` 를 채우는 데만 쓴다 —
    // 패널에서까지 돌릴 이유가 없다.
    want.screens
      ? prisma.issue.groupBy({
          by: ["legacyScreenName"],
          where: { projectId, legacyScreenName: { not: null }, ...notDeleted },
          _count: { _all: true },
          orderBy: { _count: { legacyScreenName: "desc" } },
        })
      : Promise.resolve([] as { legacyScreenName: string | null }[]),
  ]);
  return {
    histories,
    screens: screenRows.map((r) => r.legacyScreenName!).filter(Boolean),
  };
}

export async function IssueDetailBody({
  me,
  project,
  seq,
  compact = false,
  closeHref,
  showHistory = false,
  historyHref,
}: {
  me: SessionUser;
  project: ProjectRef;
  seq: number;
  /** 목록 옆 사이드 패널로 그리는가 */
  compact?: boolean;
  /** `compact` 일 때 우상단 닫기 링크 (목록 주소에서 `?peek` 만 뺀 것) */
  closeHref?: string;
  /**
   * 변경 이력을 펼쳤나 (`?history=1`).
   *
   * ★★ **주소가 정한다** (2026-09-17 · 사용자 지시 — *"변경이력을 윗부분에 버튼으로 분리"*).
   *   그래서 **사이드 패널에서도 같은 방식으로 열린다** — 예전엔 패널이 이력을
   *   아예 안 불러오고 *"N건의 변경 기록이 있습니다"* 만 보여줬다.
   * ★ 안 켜면 질의가 **안 나간다.** 이력은 상한이 없는 목록이라 오래된 이슈일수록 길다.
   * ⚠️ `?history` 는 **필터가 아니다** — `buildWhere()` 가 모르는 값이라
   *   엑셀·저장된 필터가 흔들리지 않는다 (`I-75` 와 같은 규칙).
   */
  showHistory?: boolean;
  /** 이력을 열고 닫는 주소. 안 주면 버튼을 안 그린다 */
  historyHref?: { open: string; close: string };
}) {
  // project_id 로 먼저 좁힌다. 번호만으로 찾으면 다른 프로젝트 이슈가 열린다.
  const issue = await prisma.issue.findUnique({
    where: { projectId_seq: { projectId: project.id, seq } },
    include: {
      status: true,
      priority: true,
      environment: true,
      system: true,
      round: true,
      platforms: { include: { platform: true } },
      relationsFrom: { include: { toIssue: { select: { seq: true, title: true } } } },
      relationsTo: { include: { fromIssue: { select: { seq: true, title: true } } } },
      reporter: { select: { name: true, team: { select: { name: true, color: true } } } },
      assignee: { select: { name: true, team: { select: { name: true, color: true } } } },
      // 누가 지라로 보냈나 (`J-14`). 지라 쪽 등록자가 아니라 **버튼을 누른 사람**이다
      jiraSentBy: { select: { name: true } },
      // 변경 이력은 **건수만** 여기서 센다. 목록 자체는 전체 페이지에서만 가져온다
      // (상한이 없어서 오래된 이슈는 수십 줄이 된다).
      _count: { select: { histories: true } },
      attachments: {
        orderBy: { id: "asc" },
        include: { uploadedBy: { select: { name: true } } },
      },
      comments: {
        // 최신 코멘트가 위로. 답글은 부모 아래에 시간순으로 붙는다.
        where: { parentId: null },
        orderBy: { id: "desc" },
        include: {
          author: { select: { id: true, name: true, loginId: true, team: { select: { name: true, color: true } } } },
          legacyLastAuthor: { select: { name: true, team: { select: { name: true, color: true } } } },
          attachments: { orderBy: { id: "asc" } },
          replies: {
            orderBy: { id: "asc" },
            include: {
              author: { select: { id: true, name: true, loginId: true, team: { select: { name: true, color: true } } } },
              legacyLastAuthor: { select: { name: true, team: { select: { name: true, color: true } } } },
              attachments: { orderBy: { id: "asc" } },
            },
          },
        },
      },
    },
  });

  // ★★ 없는 번호. 패널은 **목록을 죽이지 않고** 자기 자리에서만 말한다.
  //   `notFound()` 는 `compact` 가 아닐 때만 — 즉 전체 페이지에서만 난다.
  if (!issue) {
    if (compact) return <PeekMissing seq={seq} project={project} closeHref={closeHref} />;
    notFound();
  }

  /**
   * ★★ **숨긴 이슈** (2026-09-17) — 숨길 수 있는 사람에게만 보인다.
   *
   *   작성자와 관리자는 **띠와 함께** 보고 되살릴 수 있다.
   *   나머지에게는 **없는 것과 같다** — 목록에서 빠진 것과 같은 답을 준다.
   * ⚠️ 여기서도 `compact` 는 `notFound()` 를 안 부른다 (`I-76-1`) —
   *   패널에서 숨긴 이슈를 가리키는 옛 링크 하나에 **목록이 통째로 죽으면 안 된다.**
   */
  const canUnhide = issue.reporterId === me.id || me.systemRole === "ADMIN";
  if (issue.deletedAt && !canUnhide) {
    if (compact) return <PeekMissing seq={seq} project={project} closeHref={closeHref} />;
    notFound();
  }

  const [myTeam, statuses, transitions, priorities, environments, systems,
         rounds, platforms, persons, watcherRows, extra, jira] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: me.id },
        select: { team: { select: { name: true, color: true } } },
      }),
      prisma.issueStatus.findMany({
        where: { projectId: project.id, isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      // 지금 상태에서 갈 수 있는 곳 (docs/13 D-01).
      // 목록 전체를 그린 뒤 화면에서 거르지 않는다 — 못 가는 곳은 애초에 안 내려보낸다.
      prisma.statusTransition.findMany({
        where: { projectId: project.id, fromStatusId: issue.statusId, isActive: true },
        select: { toStatusId: true, requireNote: true, noteLabel: true, noteHint: true },
      }),
      // ★ 상세는 **선택지 + 현재값 표시**를 겸한다 (A-71).
      //   고를 수 있는 것 = 켜진 것 + 이 이슈가 이미 들고 있는 값.
      //   현재값을 빼면 PropertyPanel 의 제어 `<select value={shown}>` 이 그 값을 못 찾아
      //   **첫 항목을 고른 것처럼 그린다** — 화면이 이슈의 값을 거짓말하게 된다.
      prisma.priority.findMany({
        where: { projectId: project.id, OR: [{ isActive: true }, { id: issue.priorityId }] },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.environment.findMany({
        where: { projectId: project.id, OR: [{ isActive: true }, { id: issue.environmentId }] },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.system.findMany({
        where: { projectId: project.id, OR: [{ isActive: true }, { id: issue.systemId }] },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.round.findMany({
        where: {
          projectId: project.id,
          OR: [{ isActive: true }, ...(issue.roundId ? [{ id: issue.roundId }] : [])],
        },
        orderBy: { sortOrder: "asc" },
      }),
      // ★ 플랫폼은 더 위험하다 (A-73). 체크박스라 목록에서 빠지면 "안 고른 것"이 되고,
      //   다른 플랫폼을 하나 누르는 순간 setPlatforms 의 deleteMany 가
      //   **손댄 적 없는 연결까지 지운다.** 이 이슈가 물고 있는 것은 반드시 남긴다.
      prisma.platform.findMany({
        where: {
          projectId: project.id,
          OR: [{ isActive: true }, { issues: { some: { issueId: issue.id } } }],
        },
        orderBy: { sortOrder: "asc" },
      }),
      // ★ **담당자 후보 = 활성 사용자 전원** (2026-09-11 — 멤버 폐지).
      //   ★ 멘션 후보도 **같은 목록**이다. 예전엔 `people()` 을 두 번 불렀는데
      //     같은 질의를 두 번 돌린 것뿐이었다 — 한 번으로 줄였다.
      people(),
      // 구독자 (요구사항서 05).
      // ★ muted 까지 다 가져온다. 목록에서는 빼지만, **내 상태는 세 가지**라
      //   "껐다" 와 "한 번도 안 건드렸다" 를 구분해야 화면이 거짓말을 안 한다.
      prisma.issueWatcher.findMany({
        where: { issueId: issue.id },
        include: { user: { select: { id: true, name: true, team: { select: { color: true } } } } },
        orderBy: { id: "asc" },
      }),
      // ★ 이력은 **펼쳤을 때만** 가져온다 (2026-09-17). 화면명 목록은 수정 폼의
      //   `<datalist>` 용이라 전체 페이지에서만 — 두 조건이 다르므로 따로 넘긴다.
      fullOnly(project.id, issue.id, { history: showHistory, screens: !compact }),
      // ★ 지라 설정 한 벌 (2026-09-21). 조회는 `lib/jira.ts` 가 갖는다 —
      //   상세가 두 곳에서 그려지므로 화면이 직접 DB 를 보면 곧 한쪽만 고치게 된다.
      jiraBoxData(project.id, issue.jiraKey),
    ]);

  // 상태를 화면이 쓰기 쉬운 모양으로 바꾼다.
  // category 는 DB 의 분류이고, 화면이 알아야 할 건 "닫는 상태인가" 하나뿐이다.
  //
  // ★ 사유 필수는 **상태가 아니라 전이**가 정한다 (docs/13 §5).
  //   `Fixed` 하나만 봐서는 "원인·조치를 적어라"(Merge Pending 에서 왔을 때)와
  //   "확인한 케이스를 적어라"(Fixed→Closed)를 구분할 수 없다.
  //   그래서 지금 상태에서 나가는 전이를 도착지 기준으로 펴서 붙인다.
  const rule = new Map(transitions.map((t) => [t.toStatusId, t]));
  const statusOpts = statuses.map((s) => ({
    id: s.id, name: s.name, color: s.color,
    isClosed: s.category === "CLOSED",
    requireNote: rule.get(s.id)?.requireNote ?? false,
    noteLabel: rule.get(s.id)?.noteLabel ?? null,
    noteHint: rule.get(s.id)?.noteHint ?? null,
    // ★ 반영 버전은 상태를 바꾸는 **그 자리에서** 받는다.
    //   본문 폼에만 두면 취소 → 위로 올라가 저장 → 다시 상태 변경 이 된다. 그러면 안 쓴다 (P-3).
    needsVersion: s.code === "FIXED" && !issue.fixedVersion,
  }));

  const hasMigrated = issue.comments.some(
    (c) => c.author.loginId === "_migration" || c.replies.some((r) => r.author.loginId === "_migration")
  );

  const peopleNames = persons.map((x) => x.name);
  const fullHref = `/p/${project.key}/issues/${issue.seq}`;

  return (
    <div className="detail-wrap">
      <main className="detail-main">
        {compact ? (
          // 패널 머리 — 전체 화면으로 넘어가는 길과 닫는 길.
          // 목록으로 돌아가는 `.backlink` 는 여기서 의미가 없다(목록이 이미 왼쪽에 있다).
          <div className="peek-head">
            <Link className="backlink" href={fullHref}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6M10 14L21 3M21 14v7H3V3h7" />
              </svg>
              전체 화면으로
            </Link>
            {closeHref && (
              <Link className="peek-x" href={closeHref} scroll={false} aria-label="패널 닫기" title="패널 닫기">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </Link>
            )}
          </div>
        ) : (
          <Link href={`/p/${project.key}/issues`} className="backlink">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            이슈 목록
          </Link>
        )}

        <div className="dmeta">
          <span className="id">{issueNo(project.issuePrefix, issue.seq)}</span>
          <Badge color={issue.status.color}>
            <StatusDot color={issue.status.color} />
            {issue.status.name}
          </Badge>
          <Badge color={issue.priority.color}>{issue.priority.name}</Badge>

          {/* ★★ **변경 이력은 여기서 연다** (2026-09-17 · 사용자 지시 —
              *"변경이력을 이슈 상세 윗부분에 버튼으로 분리"*).
              ★ 주소로 열기 때문에 **사이드 패널에서도 똑같이** 열린다. 안 열면 질의가
                아예 안 나간다 — 이력은 상한이 없는 목록이다.
              ⚠️ `scroll={false}` — 이력을 펴고 접을 때마다 화면이 맨 위로 튀면 성가시다. */}
          {/* ★ 숨긴 이슈는 **띠로 말한다.** 여기 있는 사람은 되살릴 수 있는 사람뿐이다 */}
          {issue.deletedAt && (
            <form action={restoreIssue} className="dhide-back">
              <ProjectField />
              <input type="hidden" name="seq" value={issue.seq} />
              <span className="dhide-tag">숨긴 이슈</span>
              <button type="submit" className="dhide-restore">되살리기</button>
            </form>
          )}

          {historyHref && (
            <Link
              className={showHistory ? "dhist on" : "dhist"}
              href={showHistory ? historyHref.close : historyHref.open}
              scroll={false}
              title={showHistory ? "변경 이력 접기" : "무엇이 언제 어떻게 바뀌었는지 본다"}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
                <path d="M12 7v5l3 2" />
              </svg>
              변경 이력
              {issue._count.histories > 0 && <span className="cnt">{issue._count.histories}</span>}
            </Link>
          )}
        </div>

        {/* ★★ **변경 이력은 팝업으로 본다** (2026-09-17 · 사용자 지시).
            원래 여기 본문 위에 펼쳐졌는데 두 가지가 아쉬웠다 —
            ① 펴면 코멘트가 아래로 밀려 **보던 자리를 잃는다**
            ② 사이드 패널은 폭이 500px 남짓이라 전/후 글이 욱여넣어진다

            ★ **이력은 본문의 일부가 아니라 «잠깐 딴 데 보는 것»** 이다.
              딤 처리된 팝업이 그 성격을 말해 준다 — 열면 «지금은 이것만»,
              닫으면 원래 자리 그대로.

            ★ **여는 것도 닫는 것도 그냥 링크다.** 서버가 `?history=1` 을 보고 그려
              내려보내므로 **자바스크립트가 없어도 동작한다** (`S-04` 와 같은 생각).
              Esc 로 닫는 것만 `PopupClose` 가 맡는다 (`S-05`). */}
        {showHistory && historyHref && (
          <div className="modal-back">
            {/* 딤 자체가 닫기 버튼이다. 내용보다 **뒤에** 둔다 — 안에서 누르면 안 닫히게 */}
            <Link className="modal-scrim" href={historyHref.close} scroll={false} aria-label="닫기" />
            <div className="modal" role="dialog" aria-modal="true" aria-label="변경 이력">
              <header className="modal-head">
                <h2>
                  변경 이력
                  {issue._count.histories > 0 && <span className="cnt">{issue._count.histories}</span>}
                </h2>
                <span className="modal-sub">{issueNo(project.issuePrefix, issue.seq)}</span>
                <Link className="modal-x" href={historyHref.close} scroll={false} aria-label="닫기" title="닫기 (Esc)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </Link>
              </header>
              <div className="modal-body">
                <HistoryList rows={extra.histories} />
              </div>
            </div>
          </div>
        )}

        {/* ★ 읽는 자리에서 그대로 고친다 (2026-08-24 피드백 4번).
            `수정` 을 열면 `.dread` 가 통째로 숨고 그 자리에 폼이 온다 —
            같은 내용이 위아래로 두 벌 보이던 것을 없앤다. 버튼은 `.dedit` 의
            오른쪽 위에 고정이라 열고 닫아도 자리가 안 바뀐다. `docs/05` §14 (v6) */}
        <div className="dedit">
          {/* ★★ **삭제** (2026-09-17 · 사용자 지시 — *"수정 버튼 옆에 삭제 만들고 빨간 색으로"*).
              작성자와 관리자에게만 보인다.

              ★ **하는 일은 «숨기기» 인데 버튼 이름은 «삭제» 다.** 사람이 찾는 말은
                «삭제» 이고, 무슨 일이 실제로 일어나는지는 **펼친 안쪽이 말한다.**
                이름을 «숨기기» 로 두면 지우고 싶은 사람이 이 버튼을 못 찾는다.
              ⚠️ 한 번에 안 지워진다 — 누르면 먼저 무슨 일이 일어나는지 말한다.
                코멘트 삭제(`D-102`)와 같은 단계다. 목록에서 사라지면 어디로 갔는지
                알기 어려우므로 더더욱 한 단계가 필요하다.
              ⚠️ 화면에서 감추는 것만으로는 부족하다 — **서버가 다시 확인한다** (`C-44`).
              ★ `.dedit` 안에 둔다 — `수정` 버튼과 **같은 기준 상자**라야 둘이 나란히 선다. */}
          {!issue.deletedAt && (issue.reporterId === me.id || me.systemRole === "ADMIN") && (
            <details className="ddel">
              <summary className="btn-ghost danger ddel-btn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                </svg>
                삭제
              </summary>
              <div className="ddel-pop">
                <p>
                  목록·검색·엑셀·대시보드에서 <b>사라집니다.</b> 다만 <b>정말 지우지는 않습니다</b> —
                  코멘트·첨부·변경 이력은 그대로 남고 관리자가 <b>되살릴 수 있습니다.</b>
                  <br />
                  ⚠️ 이슈번호 <b>{issueNo(project.issuePrefix, issue.seq)}</b> 는 돌아오지 않습니다.
                </p>
                <form action={hideIssue}>
                  <ProjectField />
                  <input type="hidden" name="seq" value={issue.seq} />
                  <button type="submit" className="btn-ghost danger">삭제합니다</button>
                </form>
              </div>
            </details>
          )}

          {/* ⚠️ 패널에서는 화면명 `<datalist>` 가 비어 있다 (`screens: []`).
              자동완성만 없을 뿐 입력은 그대로 된다 — 프로젝트 전건 groupBy 한 번을
              패널을 열 때마다 돌릴 값어치가 없다. */}
          <IssueEditor
            issue={{
              seq: issue.seq,
              title: issue.title,
              content: issue.content,
              testPath: issue.testPath,
              expected: issue.expected,
              legacyScreenName: issue.legacyScreenName,
              externalRef: issue.externalRef,
              foundVersion: issue.foundVersion,
              fixedVersion: issue.fixedVersion,
            }}
            screens={extra.screens}
          />

          <div className="dread">
            <div className="dtitle-row">
              <h1 className="dtitle">{issue.title}</h1>
            </div>

            {/* ★ **이슈 내용은 여기서만 보인다** (2026-09-16).
                목록은 제목만 보여준다 — 본문이 길어 줄이 잘리던 것을 나눈 결과다. */}
            <section className="sec">
              <h2>이슈 내용</h2>
              <div className={`prose${issue.content ? "" : " none"}`}>
                {issue.content || "기록 없음"}
              </div>
            </section>

            <section className="sec">
              <h2>테스트 경로</h2>
              <div className={`prose${issue.testPath ? "" : " none"}`}>
                {issue.testPath ?? "기록 없음"}
              </div>
            </section>

            <section className="sec">
              <h2>테스트 기대값</h2>
              <div className={`prose${issue.expected ? "" : " none"}`}>
                {issue.expected ?? "기록 없음"}
              </div>
            </section>
          </div>
        </div>

        {/* ★ **첨부가 0건이면 절 자체가 비어 보인다** (2026-09-16).
            업로드 칸을 수정 중일 때만 보이게 바꾸면서, 첨부가 없는 이슈에서는
            제목만 덩그러니 남게 됐다. 그래서 `.sec--att` 를 두고
            **0건이면서 수정 중도 아닐 때** CSS 가 통째로 숨긴다.
            ⚠️ 렌더는 계속 한다 — 수정 폼을 열면 그 자리에 나타나야 한다. */}
        <section className={`sec sec--att${issue.attachments.length === 0 ? " empty" : ""}`}>
          <h2>
            첨부 {issue.attachments.length > 0 && `${issue.attachments.length}건`}
            <span className="h2-sub">이슈에 직접 붙은 것. 코멘트 첨부는 각 코멘트 아래에</span>
          </h2>
          <Attachments seq={issue.seq} rows={issue.attachments} />
        </section>

        {/* ★ **여기부터 '대화' 다** (2026-09-16 제보 — *"이슈 본문 내용이랑 코멘트
            영역이 좀더 구분됐으면"*). 코멘트와 변경 이력을 하나로 묶고 바닥을
            가라앉힌다. 위쪽 굵은 선 + 회색 배경이 경계가 된다.
            ★ 구조는 안 바꾼다 — 안의 `.sec` 들은 그대로다. 감싸는 것만 더한다. */}
        <div className="talk">
        <section className="sec">
          <h2>
            코멘트 {issue.comments.reduce((n, c) => n + 1 + c.replies.length, 0)}건
          </h2>

          <CommentForm
            seq={issue.seq}
            authorName={me.name}
            teamName={myTeam?.team?.name ?? null}
            teamColor={myTeam?.team?.color ?? null}
            people={peopleNames}
          />

          {hasMigrated && (
            <div className="note">
              <span className="ico">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 16v-5M12 8h.01" />
                </svg>
              </span>
              <span>
                아래 <b>엑셀 이관</b> 표시가 붙은 코멘트는 작성 시각이 없습니다. 엑셀에는
                작성자·시각 칸이 없었고, 본문에 <b>{"7/29 14:57 이름)"}</b> 을 손으로 적었기
                때문입니다(전체의 <b>95%</b>). 지금부터 다는 코멘트는 작성자와 시각이
                <b> 자동으로</b> 기록됩니다.
              </span>
            </div>
          )}

          <CommentList
            comments={issue.comments}
            seq={issue.seq}
            people={peopleNames}
            meId={me.id}
          />
        </section>

        {/* ★★ 변경 이력은 **머리의 버튼**이 연다 (2026-09-17 · 사용자 지시).
            예전엔 여기 본문·코멘트 **아래**에 통째로 펼쳐져 있었다 — 오래된 이슈일수록
            길어져서 **코멘트를 보려면 이력을 지나쳐야** 했다. 위 `dhist` 참고. */}
        </div>
      </main>

      <aside className="detail-side">
        <PropertyPanel
          seq={issue.seq}
          statuses={statusOpts}
          currentStatus={statusOpts.find((s) => s.id === issue.statusId) ?? statusOpts[0]}
          allowedStatusIds={transitions.map((t) => t.toStatusId)}
          priorities={priorities}
          environments={environments}
          systems={systems}
          rounds={rounds}
          platforms={platforms}
          members={persons}
          current={{
            priorityId: issue.priorityId,
            environmentId: issue.environmentId,
            systemId: issue.systemId,
            assigneeId: issue.assigneeId,
            roundId: issue.roundId,
            platformCodes: issue.platforms.map((x) => x.platform.code),
            reproRate: issue.reproRate,
          }}
        />

        <div className="side-sep" />

        <WatchBox
          seq={issue.seq}
          // 구독 중 / 내가 껐다 / 아직 안 건드렸다 — 세 가지다 (docs/13 미결 4)
          mine={(() => {
            const row = watcherRows.find((w) => w.userId === me.id);
            return !row ? "none" : row.muted ? "muted" : "on";
          })()}
          watchers={watcherRows
            .filter((w) => !w.muted)
            .map((w) => ({
              id: w.user.id, name: w.user.name, teamColor: w.user.team?.color ?? null,
            }))}
        />

        <div className="side-sep" />

        <dl className="props">
          <div>
            <dt>작성자</dt>
            <dd>
              <Avatar name={issue.reporter.name} color={issue.reporter.team?.color} />
              {issue.reporter.name}
              {issue.reporter.team && <span className="team-tag">{issue.reporter.team.name}</span>}
            </dd>
          </div>
          <div>
            <dt>화면</dt>
            <dd>{issue.legacyScreenName ?? "—"}</dd>
          </div>
          <div>
            <dt>발생일</dt>
            <dd>{formatFull(issue.reportedAt)}</dd>
          </div>
          <div>
            <dt>작업일</dt>
            <dd>{formatFull(issue.resolvedAt)}</dd>
          </div>
          <div>
            <dt>QAI #</dt>
            <dd>{issue.externalRef ?? "—"}</dd>
          </div>
          <div>
            <dt>검출 버전</dt>
            <dd>{issue.foundVersion ?? "—"}</dd>
          </div>
          <div>
            <dt>반영 버전</dt>
            <dd>{issue.fixedVersion ?? "—"}</dd>
          </div>
        </dl>

        {/* ★ 지라 (2026-09-21 · `J-13`). **설정이 없으면 아무것도 안 그린다** —
            연동을 안 붙인 프로젝트에 빈 절이 생기면 «고장난 것» 처럼 보인다. */}
        {jira && (
          <JiraBox
            seq={issue.seq}
            jiraKey={issue.jiraKey}
            sentAt={issue.jiraSentAt ? formatFull(issue.jiraSentAt) : null}
            sentBy={issue.jiraSentBy?.name ?? null}
            url={jira.url}
            active={jira.active}
            hasToken={jira.hasToken}
            defaultParentKey={jira.defaultParentKey}
          />
        )}

        {/* 관련 이슈. 양쪽에서 보인다 —
            "이건 저것의 중복이다"와 "이걸 중복이라고 한 게 있다"가 둘 다 필요하다. */}
        {(issue.relationsFrom.length > 0 || issue.relationsTo.length > 0) && (
          <>
            <div className="side-sep" />
            <h2 className="side-h">관련 이슈</h2>
            <ul className="rel-list">
              {issue.relationsFrom.map((r) => (
                <li key={`f${r.id}`}>
                  <span className="rel-k">이 이슈는</span>
                  <Link href={`/p/${project.key}/issues/${r.toIssue.seq}`}>
                    {issueNo(project.issuePrefix, r.toIssue.seq)}
                  </Link>
                  <span className="rel-k">의 중복</span>
                  <span className="rel-t" title={r.toIssue.title}>{r.toIssue.title}</span>
                </li>
              ))}
              {issue.relationsTo.map((r) => (
                <li key={`t${r.id}`}>
                  <Link href={`/p/${project.key}/issues/${r.fromIssue.seq}`}>
                    {issueNo(project.issuePrefix, r.fromIssue.seq)}
                  </Link>
                  <span className="rel-k">가 이 이슈의 중복</span>
                  <span className="rel-t" title={r.fromIssue.title}>{r.fromIssue.title}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="side-sep" />

        <h2 className="side-h">기록</h2>
        <p className="side-note">
          상태·담당자를 바꾸면 <b style={{ color: "var(--text-dim)" }}>누가 언제 무엇을</b> 바꿨는지
          자동으로 남습니다. 본문 아래 <b style={{ color: "var(--text-dim)" }}>변경 이력</b>에서 볼 수 있습니다.
          <br />
          <br />
          엑셀에는 이 기록이 없어 처리 소요일과 재수정률을 계산할 수 없었습니다.
        </p>
      </aside>
    </div>
  );
}

/**
 * 패널이 가리키는 번호가 없을 때.
 *
 * ★★ 여기서 `notFound()` 를 부르면 **목록 전체가 404** 가 된다.
 *   지워진 번호를 가리키는 옛 링크 하나에 화면이 통째로 죽는 것이라,
 *   전체 페이지와 달리 패널은 반드시 자기 자리에서만 말해야 한다.
 */
function PeekMissing({
  seq, project, closeHref,
}: {
  seq: number; project: ProjectRef; closeHref?: string;
}) {
  return (
    <div className="peek-missing">
      <h3>{issueNo(project.issuePrefix, seq)} 이슈를 찾을 수 없습니다</h3>
      <p>지워졌거나, 다른 프로젝트의 번호일 수 있습니다.</p>
      {closeHref && <Link href={closeHref} scroll={false} className="btn-primary sm">닫기</Link>}
    </div>
  );
}
