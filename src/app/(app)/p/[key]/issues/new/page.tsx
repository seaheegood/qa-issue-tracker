
import { PageHeader } from "@/components/PageHeader";
import { issueNo } from "@/lib/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { people } from "@/lib/people";
import { requireProject } from "@/lib/project";

import Link from "next/link";

import { IssueForm } from "./IssueForm";
import { notDeleted } from "@/lib/issue-filter";

export const metadata = { title: "새 이슈 · IssueTracker" };

/**
 * 후보 중 **목록에 실제로 있는** 첫 값을 고른다 (A-70 · N-03).
 *
 * ★ 왜 필요한가. 기본값은 템플릿 → 직전 이슈 → 목록의 첫 값 순으로 내려오는데,
 *   직전 이슈가 물고 있던 값이 그 사이 `사용` 꺼졌으면 **목록에 없는 코드**가 기본값이 된다.
 *   그러면 드롭다운이 엉뚱한 항목을 고른 것처럼 보인다.
 *   차수는 이 화면이 처음부터 `isActive` 로 걸러 왔으므로 **이 문제가 이미 있었다.**
 */
function firstIn(
  rows: { code: string }[],
  cands: (string | null | undefined)[],
  fallback = rows[0]?.code ?? "",
) {
  return cands.find((c) => !!c && rows.some((r) => r.code === c)) ?? fallback;
}


export default async function NewIssuePage({
  params, searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const templateId = Number(Array.isArray(sp.template) ? sp.template[0] : sp.template) || 0;

  const project = await requireProject(params);

  const [priorities, environments, systems, rounds, platforms, members, screenRows, templates, lastMine] =
    await Promise.all([
    // ★ 등록 화면은 **순수 선택지**다. 켜진 것만 보여준다 (A-70).
    //   상세·목록과 달리 "이미 이 값인 이슈"가 없으므로 그냥 걸어도 안전하다.
    prisma.priority.findMany({ where: { projectId: project.id, isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.environment.findMany({ where: { projectId: project.id, isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.system.findMany({ where: { projectId: project.id, isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.round.findMany({ where: { projectId: project.id, isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.platform.findMany({ where: { projectId: project.id, isActive: true }, orderBy: { sortOrder: "asc" } }),
    // ★ **담당자 후보 = 활성 사용자 전원** (2026-09-11 — 멤버 폐지).
    //   예전엔 `DEV`·`LEAD` 멤버만이었다. 새 프로젝트에서는 그게 **만든 사람 1명**이라
    //   담당자 지정이 사실상 막혔다. `people()` 한 곳에서만 만든다.
    people(),
    // 이미 쓰인 화면명. 자동완성으로 제안해서 새로 타이핑하는 걸 줄인다.
    // 표기 오염(19그룹)이 생긴 원인이 "사람이 기억으로 타이핑"이었다.
    prisma.issue.groupBy({
      by: ["legacyScreenName"],
      where: { projectId: project.id, legacyScreenName: { not: null }, ...notDeleted },
      _count: { _all: true },
      orderBy: { _count: { legacyScreenName: "desc" } },
    }),
    // 이슈 템플릿 (요구사항서 09). 필수값 9개의 부담을 상쇄하는 것이 목적이다.
    prisma.issueTemplate.findMany({
      where: { projectId: project.id, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { round: true, priority: true, environment: true, system: true },
    }),
    // 내가 마지막으로 등록한 이슈. 그 값을 기본값으로 쓴다.
    // 같은 사람이 같은 화면을 연달아 테스트하는 경우가 많아 클릭 수가 크게 준다 (P-3).
    prisma.issue.findFirst({
      where: { projectId: project.id, reporterId: me.id },
      orderBy: { id: "desc" },
      include: { priority: true, environment: true, system: true, round: true,
                 platforms: { include: { platform: true } } },
    }),
  ]);
  // ★ **없는 것과 꺼둔 것을 나눠 말하려면 꺼진 개수를 알아야 한다** (A-84).
  //   켜진 목록이 0개일 때만 세므로 평소에는 쿼리가 돌지 않는다.
  const offCount = async (
    m: { count: (a: { where: { projectId: number; isActive: false } }) => Promise<number> },
    active: unknown[],
  ) => (active.length === 0 ? m.count({ where: { projectId: project.id, isActive: false } }) : 0);
  const [offRound, offPriority, offEnvironment, offSystem, offPlatform] = await Promise.all([
    offCount(prisma.round, rounds),
    offCount(prisma.priority, priorities),
    offCount(prisma.environment, environments),
    offCount(prisma.system, systems),
    offCount(prisma.platform, platforms),
  ]);
  // 등록을 막는 필수값 다섯. 서버의 거부 조건과 같은 목록이다 (`new/actions.ts`).
  const blockers = [
    { label: "차수", tab: "rounds", list: rounds, off: offRound },
    { label: "우선순위", tab: "priorities", list: priorities, off: offPriority },
    { label: "환경", tab: "environments", list: environments, off: offEnvironment },
    { label: "시스템", tab: "systems", list: systems, off: offSystem },
    { label: "플랫폼", tab: "platforms", list: platforms, off: offPlatform },
  ].filter((b) => b.list.length === 0);


  const screens = screenRows.map((r) => r.legacyScreenName!).filter(Boolean);

  const tpl = templates.find((t) => t.id === templateId) ?? null;

  /**
   * 기본값 **4단**: 템플릿 → 직전값 → 마스터 → 빈값 (요구사항서 09 · N-02).
   *
   * ★ 템플릿을 여기서 처리하는 이유 — `IssueForm` 을 한 줄도 안 건드려도 된다.
   *   기본값은 원래 서버가 만들어 넘기고 있었다. `?template=3` 이면 그 객체만 덮으면 끝이다.
   *   **클라이언트 코드가 0줄이고 JS 없이 동작한다.**
   *
   * ★ 템플릿이 **일부만** 채워도 된다. 안 채운 칸은 직전값으로 내려간다.
   */
  const defaults = {
    priority: firstIn(priorities, [tpl?.priority?.code, lastMine?.priority.code],
      priorities[1]?.code ?? priorities[0]?.code ?? ""),
    environment: firstIn(environments, [tpl?.environment?.code, lastMine?.environment.code]),
    system: firstIn(systems, [tpl?.system?.code, lastMine?.system.code]),
    screen: tpl?.screenName ?? lastMine?.legacyScreenName ?? null,
    // 차수는 직전값이 없으면 **가장 마지막 차수**를 고른다. 보통 지금 도는 회차다.
    // 차수는 직전값이 없으면 **가장 마지막 차수**를 고른다 — 첫 값이 아니다.
    round: firstIn(rounds, [tpl?.round?.code, lastMine?.round?.code],
      rounds[rounds.length - 1]?.code ?? ""),
    foundVersion: tpl?.foundVersion ?? lastMine?.foundVersion ?? "",
    // 꺼진 플랫폼이 직전값에 남아 있을 수 있다 — 체크박스에 없는 코드는 걸러낸다.
    platforms: ((tpl?.platformCodes as string[] | null) ??
      lastMine?.platforms.map((x) => x.platform.code) ??
      []).filter((c) => platforms.some((x) => x.code === c)),
    // 이 둘은 템플릿에만 있다. 직전값으로 채우면 남의 재현 경로가 그대로 들어간다.
    testPath: tpl?.testPath ?? "",
    expected: tpl?.expected ?? "",
  };

  return (
    <>
      {/* ★ **번호를 그대로 보여준다** (`N-67` · 2026-09-11 · TS-8).
          `다음 번호 14` 라고 적었더니 *"저장되는 번호가 이상한 형태로 뜬다"* 는
          제보를 받았다 — 설명하는 말보다 **실제로 붙을 번호**를 보여주는 게 낫다. */}
      <PageHeader title="새 이슈" sub={issueNo(project.issuePrefix, project.issueSeq + 1)} />
      <main className="admin" style={{ maxWidth: 760 }}>
        {/*
          ★ **막다른 길을 막는다** (2026-09-04).
            필수값은 하나도 없으면 서버가 등록을 거부한다. 그런데 화면은
            **빈 드롭다운**만 보여줘서, 왜 안 되는지 알 방법이 없었다.
            새로 만든 프로젝트가 정확히 그 상태였다 (`create-project.ts` 는 시스템을
            복제하지 않는다 — `SV`·`SL` 은 첫 프로젝트의 것이라 당연하다).
            이제 **무엇이 없고 어디서 만드는지**를 말한다.
        */}
        {/* ★ **고를 게 없는데 고르라고 하지 않는다** (`A-84` · 2026-09-11).
            예전엔 **시스템만** 안내했다. 그래서 차수를 0개로 만들면 빈 드롭다운 앞에서
            *"차수를 골라주세요."* 만 들었다 — 고를 것이 없는데.
            등록을 막는 필수값은 다섯이라(우선순위·환경·시스템·차수·플랫폼) 다섯 다 말한다.

            ★ **없는 것과 꺼둔 것을 같은 말로 하지 않는다.** 꺼놓고 *"하나 만들어 주세요"* 를
            들으면 **이미 있는 것을 또 만들게** 된다 (시스템 코드는 두 글자라 금방 동이 난다). */}
        {blockers.length > 0 && (
          <p className="empty" style={{ marginBottom: 14 }}>
            {blockers.map((b, n) => (
              <span key={b.tab}>
                {n > 0 && <br />}
                {b.off > 0 ? (
                  <>
                    <b>{b.label} {b.off}개가 모두 꺼져 있습니다.</b> 이슈 등록의 필수값이라
                    켜진 것이 없으면 등록할 수 없습니다.{" "}
                    <Link href={`/p/${project.key}/admin/${b.tab}`}><b>프로젝트 설정 › {b.label}</b></Link> 에서
                    <b> 사용을 다시 켜 주세요</b> — 새로 만들 필요는 없습니다.
                  </>
                ) : (
                  <>
                    이 프로젝트에는 아직 <b>{b.label}</b>이 없습니다. 이슈 등록의 필수값이라
                    하나도 없으면 등록할 수 없습니다.{" "}
                    <Link href={`/p/${project.key}/admin/${b.tab}`}><b>프로젝트 설정 › {b.label}</b></Link> 에서
                    하나 만들어 주세요.
                  </>
                )}
              </span>
            ))}
          </p>
        )}
        {templates.length > 0 && (
          <div className="tpl-pick">
            <span className="tpl-k">템플릿</span>
            {/* ★ 링크라서 **먼저** 골라야 한다. 쓰던 내용이 날아가므로 폼 맨 위에 두고 그렇게 적는다 */}
            <Link href={`/p/${project.key}/issues/new`} className={`tpl-chip${tpl ? "" : " on"}`}>기본</Link>
            {templates.map((t) => (
              <Link
                key={t.id}
                href={`/p/${project.key}/issues/new?template=${t.id}`}
                className={`tpl-chip${tpl?.id === t.id ? " on" : ""}`}
              >
                {t.name}
              </Link>
            ))}
            <span className="tpl-note">
              {tpl ? "적힌 칸이 채워졌습니다. 바꿔도 됩니다." : "먼저 고르세요 — 고르면 쓰던 내용이 지워집니다."}
            </span>
          </div>
        )}

        {tpl ? (
          <p className="admin-hint" style={{ marginBottom: 12 }}>
            <b>{tpl.name}</b> 템플릿으로 채웠습니다. 필수값 9개 중 대부분이 이미 들어 있으니
            <b> 이슈 내용과 기대 결과</b>만 쓰시면 됩니다.
          </p>
        ) : lastMine ? (
          <p className="admin-hint" style={{ marginBottom: 12 }}>
            우선순위·환경·시스템·화면은 <b>직전에 등록하신 값</b>으로 채워져 있습니다. 그대로면 바로 내용만 쓰시면 됩니다.
          </p>
        ) : null}
        <IssueForm
        rounds={rounds}
        platforms={platforms}
          priorities={priorities}
          environments={environments}
          systems={systems}
          members={members}
          screens={screens}
          defaults={defaults}
          reporterName={me.name}
        projectKey={project.key}
        />
      </main>
    </>
  );
}
