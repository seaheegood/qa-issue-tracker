import Link from "next/link";
import { formatFull } from "@/lib/ui";

import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/project";

import { Donut, DonutLegend, type Slice } from "./Donut";
import { PersonBars, type PersonRow } from "./PersonBars";
import { SplitBars, type SplitRow } from "./SplitBars";
import { Trend, type TrendPoint } from "./Trend";
import { notDeleted } from "@/lib/issue-filter";

export const metadata = { title: "대시보드 · IssueTracker" };


/** 미해결 = OPEN · PENDING. 상태 이름이 프로젝트마다 달라도 분류는 4종 고정이다 (docs/03 D8). */
const OPEN_CATEGORIES = ["OPEN", "PENDING"] as const;

/**
 * 대시보드.
 *
 * ★ 주인공은 **쓰는 사람**이다 (docs/10 v2). 임원은 계정이 없다 — 보고는 문서로 나간다.
 * ★ 이 화면은 종착지가 아니라 **입구**다. 모든 숫자는 눌러서 목록으로 갈 수 있다.
 *   못 누르게 하면 사람들은 결국 목록으로 가서 다시 찾고, 대시보드를 거치는 게 손해가 된다.
 */
export default async function DashboardPage({ params }: { params: Promise<{ key: string }> }) {
  const me = await requireUser();
  const project = await requireProject(params);

  // ★ 대시보드의 모든 숫자는 링크다. 프로젝트가 주소에 들어가므로 여기 한 번만 정한다.
  const base = `/p/${project.key}`;
  /** 마스터 표(상태·우선순위·시스템·차수)를 고르는 조건. **이슈 조건이 아니다** */
  const where = { projectId: project.id };
  /**
   * 이슈를 세는 조건. ⚠️ **숨긴 이슈는 빠진다** (2026-09-17).
   * 이 한 줄이 아래 `groupBy`·`count` **열넷 전부**에 걸린다.
   *
   * ★ 안 넣으면 *"화면의 숫자 = 링크 결과 건수"* 가 깨진다. 막대는 15인데
   *   눌러서 간 목록은 14가 된다 (목록은 `buildWhere` 가 이미 거른다).
   * ⚠️⚠️ **마스터와 같은 조건을 쓰면 안 된다.** 처음에 `where` 한 개에 `deletedAt` 을
   *   섞었더니 `priority.findMany` 가 «Unknown argument deletedAt» 으로 죽어
   *   **대시보드가 통째로 500** 이었다. 마스터 표에는 그런 칸이 없다.
   */
  const iw = { ...where, ...notDeleted };
  const openWhere = { ...iw, status: { category: { in: [...OPEN_CATEGORIES] } } };

  const [
    statuses, priorities, systems, rounds, users,
    byStatus, byPriority, byPriorityOpen, bySystem, bySystemOpen,
    byReporterStatus, byAssigneeStatus, byRound, byRoundOpen,
    byReporter, byReporterOpen, byAssignee, byAssigneeOpen,
    unassigned, bothCount, total, createdRows, closedRows,
  ] = await Promise.all([
    prisma.issueStatus.findMany({ where: { ...where, isActive: true }, orderBy: { sortOrder: "asc" } }),
    // ★ 여기는 `isActive` 로 거르지 않는다 (A-72). 꺼진 것에도 이슈가 달려 있고,
    //   막대의 링크는 `?system=CODE` 인데 목록 쪽 buildWhere() 는 isActive 를 안 본다.
    //   여기서만 거르면 "막대는 없는데 눌러 보면 12건" 이 되어
    //   **화면의 숫자 = 링크 결과 건수** 가 깨진다 (docs/10).
    //   이슈 0건인 것은 아래 split() 의 `.filter((r) => r.total > 0)` 가 이미 숨긴다.
    prisma.priority.findMany({ where, orderBy: { sortOrder: "asc" } }),
    prisma.system.findMany({ where, orderBy: { sortOrder: "asc" } }),
    prisma.round.findMany({ where, orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({ select: { id: true, loginId: true, name: true, team: { select: { color: true } } } }),

    prisma.issue.groupBy({ by: ["statusId"], where: iw, _count: { _all: true } }),
    prisma.issue.groupBy({ by: ["priorityId"], where: iw, _count: { _all: true } }),
    prisma.issue.groupBy({ by: ["priorityId"], where: openWhere, _count: { _all: true } }),
    prisma.issue.groupBy({ by: ["systemId"], where: iw, _count: { _all: true } }),
    prisma.issue.groupBy({ by: ["systemId"], where: openWhere, _count: { _all: true } }),
    // ★ 사람 × 상태. 막대를 상태 색으로 나눠 칠하려면 교차 집계가 있어야 한다.
    prisma.issue.groupBy({ by: ["reporterId", "statusId"], where: iw, _count: { _all: true } }),
    prisma.issue.groupBy({ by: ["assigneeId", "statusId"], where: iw, _count: { _all: true } }),
    // 차수별 — 회귀 범위를 정할 때 본다
    prisma.issue.groupBy({ by: ["roundId"], where: iw, _count: { _all: true } }),
    prisma.issue.groupBy({ by: ["roundId"], where: openWhere, _count: { _all: true } }),
    prisma.issue.groupBy({ by: ["reporterId"], where: iw, _count: { _all: true } }),
    prisma.issue.groupBy({ by: ["reporterId"], where: openWhere, _count: { _all: true } }),
    prisma.issue.groupBy({ by: ["assigneeId"], where: iw, _count: { _all: true } }),
    prisma.issue.groupBy({ by: ["assigneeId"], where: openWhere, _count: { _all: true } }),

    prisma.issue.count({ where: { ...iw, assigneeId: null } }),
    // 작성자==담당자. 0건이라는 전제로 두 축을 따로 그리므로 **매번 확인한다**.
    prisma.issue.count({
      where: { ...iw, assigneeId: { not: null, equals: prisma.issue.fields.reporterId } },
    }),
    prisma.issue.count({ where: iw }),

    // 추이. 날짜만 필요해서 스칼라 두 개만 가져온다.
    prisma.issue.findMany({ where: iw, select: { reportedAt: true } }),
    prisma.issue.findMany({ where: { ...iw, resolvedAt: { not: null } }, select: { resolvedAt: true } }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const n = (rows: { _count: { _all: number } }[], id: number | null, key: string) =>
    (rows as unknown as Record<string, unknown>[])
      .find((r) => r[key] === id)?.["_count"] as { _all: number } | undefined;

  // ── 상태별 (도넛)
  const cntStatus = new Map(byStatus.map((r) => [r.statusId, r._count._all]));
  const slices: Slice[] = statuses.map((s) => ({
    label: s.name, value: cntStatus.get(s.id) ?? 0, color: s.color,
    href: `${base}/issues?status=${s.code}`,
  }));
  const closed = statuses.filter((s) => s.category === "CLOSED")
    .reduce((a, s) => a + (cntStatus.get(s.id) ?? 0), 0);
  const remaining = total - closed;
  const pct = total ? (closed / total) * 100 : 0;

  // ── 우선순위 · 시스템 (겹친 막대)
  const split = <T extends { id: number; name: string }>(
    master: T[], all: { _count: { _all: number } }[], open: { _count: { _all: number } }[],
    key: string, param: string, code: (m: T) => string, color: (m: T) => string,
  ): SplitRow[] =>
    master.map((m) => ({
      label: m.name,
      color: color(m),
      total: n(all, m.id, key)?._all ?? 0,
      open: n(open, m.id, key)?._all ?? 0,
      // ★ `closed=1` — 이 막대는 **종결까지 센** 숫자다 (2026-09-16).
      //   목록의 기본이 '종결 제외' 로 바뀌었으므로 안 붙이면 눌렀을 때 덜 나온다.
      href: `${base}/issues?${param}=${code(m)}&closed=1`,
      openHref: `${base}/issues?${param}=${code(m)}&open=1`,
    })).filter((r) => r.total > 0);

  const priorityRows = split(priorities, byPriority, byPriorityOpen, "priorityId", "priority",
    (p) => p.code, (p) => p.color);
  // 시스템은 색이 없다. 진한 부분이 '남은 것'이라는 뜻이 색으로 읽혀야 하므로
  // 완료처럼 보이는 teal 대신 주황을 쓴다.
  const systemRows = split(systems, bySystem, bySystemOpen, "systemId", "system",
    (s) => s.code, () => "#c2410c");

  const criticalOpen = priorityRows[0]?.open ?? 0;
  const criticalCode = priorities[0]?.code ?? "";

  // ── 사람별
  //
  // ★ 링크가 바뀌었다 — 정정 기록 (docs/10 §4, docs/11 B-07)
  //   예전에는 작성자 막대도 담당자 막대도 똑같이 `?person=`(작성 또는 담당) 으로 갔다.
  //   "역할을 몰라도 동작한다" 는 게 이유였는데, 그 대가로 **막대 길이와 결과 건수가
  //   달랐다.** QA-A 작성 40건 막대를 눌러 46건이 나오는 화면은 숫자를 못 믿게 만든다.
  //   이제 작성자축은 `?reporter=`, 담당자축은 `?assignee=` 로 간다. 화면의 모든 숫자가
  //   자기 링크와 정확히 일치한다.

  const people = (
    all: { _count: { _all: number } }[], open: { _count: { _all: number } }[],
    cross: { _count: { _all: number } }[], key: string, param: "reporter" | "assignee",
  ): PersonRow[] => {
    // 사람 → 상태 → 건수
    const seg = new Map<number, Map<number, number>>();
    for (const r of cross as unknown as Record<string, unknown>[]) {
      const uid = r[key] as number | null;
      if (uid === null) continue;
      const m = seg.get(uid) ?? new Map<number, number>();
      m.set(r["statusId"] as number, (r["_count"] as { _all: number })._all);
      seg.set(uid, m);
    }

    return (all as unknown as Record<string, unknown>[])
      .map((r) => ({ id: r[key] as number | null, cnt: (r["_count"] as { _all: number })._all }))
      .filter((r) => r.id !== null)
      .map((r) => {
        const u = userById.get(r.id!);
        // ★ `closed=1` — 사람 막대도 종결까지 센 숫자다 (2026-09-16).
        //   ⚠️ 상태 조각(`${who}&status=…`)은 상태를 콕 집으므로 그쪽이 이긴다.
        const who = u
          ? `${base}/issues?${param}=${encodeURIComponent(u.loginId)}&closed=1`
          : `${base}/issues?closed=1`;
        const m = seg.get(r.id!) ?? new Map<number, number>();
        return {
          loginId: u?.loginId ?? null,
          name: u?.name ?? "(알 수 없음)",
          teamColor: u?.team?.color ?? null,
          total: r.cnt,
          open: n(open, r.id, key)?._all ?? 0,
          href: who,
          // 상태 순서(sortOrder)대로. 막대 색 배열이 사람마다 같아야 눈으로 비교된다
          segments: statuses
            .filter((st) => (m.get(st.id) ?? 0) > 0)
            .map((st) => ({
              code: st.code, name: st.name, color: st.color, count: m.get(st.id)!,
              href: `${who}&status=${st.code}`,
            })),
        };
      })
      .filter((r) => r.loginId !== "_migration")
      .sort((a, b) => b.total - a.total);   // 정렬 고정 — 바꿀 수 있게 하면 순위표가 된다
  };

  const reporterRows = people(byReporter, byReporterOpen, byReporterStatus, "reporterId", "reporter");
  const assigneeRows = people(byAssignee, byAssigneeOpen, byAssigneeStatus, "assigneeId", "assignee");

  // ── 내 이슈 상태별 — 작성 · 담당을 **나눠서** 본다.
  //   합치면 "내 것 12건" 이 되는데, 내가 **올린** 12건과 내가 **고쳐야 할** 12건은
  //   할 일이 전혀 다르다. 한 줄로 만들면 그 차이가 사라진다.
  const mine = (rows: PersonRow[], label: string, hint: string) => {
    const r = rows.find((x) => x.loginId === me.loginId);
    return { label, hint, row: r ?? null };
  };
  const myAxes = [
    mine(reporterRows, "내가 올린 것", "내가 등록한 이슈가 지금 어느 단계에 있나"),
    mine(assigneeRows, "내가 맡은 것", "나에게 배정된 이슈. 여기가 오늘 할 일이다"),
  ];
  const myTotal = myAxes.reduce((a, x) => a + (x.row?.total ?? 0), 0);

  // ── 차수별 — 회귀 범위를 정할 때 본다
  const roundRows = split(rounds, byRound, byRoundOpen, "roundId", "round",
    (r) => r.code, () => "#7c3aed");
  // ★ 차수가 없는 이슈를 숨기지 않는다 — 다만 **막대로는 그리지 않는다.**
  //   지금 1,719건이 차수 미지정(엑셀에서 옮겨온 것)이라, 막대에 넣으면 척도를 혼자
  //   다 먹어 1차·2차가 선 하나가 된다. 비교가 목적인 패널에서 비교가 불가능해진다.
  //   그래서 아래에 각주 줄로 내린다. 빼는 게 아니라 자리를 옮기는 것이다.
  const noRoundCnt = (rows: unknown[]): number =>
    ((rows as Record<string, unknown>[]).find((r) => r["roundId"] === null)?.["_count"] as
      { _all: number } | undefined)?._all ?? 0;
  const noRound = noRoundCnt(byRound);
  const noRoundOpen = noRoundCnt(byRoundOpen);


  const myOpen =
    (n(byAssigneeOpen, me.id, "assigneeId")?._all ?? 0) +
    (n(byReporterOpen, me.id, "reporterId")?._all ?? 0);

  // ── 추이 (일자별 등록 vs 종결)
  // ★ `toISOString()` 으로 자르면 **UTC 기준**이라 KST 오전 9시 이전 값이 전날로 찍힌다 (C-40)
  const day = (d: Date) => formatFull(d);
  const bump = (m: Map<string, TrendPoint>, k: string, f: "created" | "closed") => {
    const p = m.get(k) ?? { date: k, created: 0, closed: 0 };
    p[f] += 1; m.set(k, p);
  };
  const trendMap = new Map<string, TrendPoint>();
  for (const r of createdRows) bump(trendMap, day(r.reportedAt), "created");
  for (const r of closedRows) if (r.resolvedAt) bump(trendMap, day(r.resolvedAt), "closed");
  const trend = [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);

  return (
    <>
      <PageHeader title="대시보드" sub={project.name} />

      <main className="dash">
        {/* ① 나부터. 이 화면을 여는 이유가 "오늘 뭘 하지" 이기 때문이다 */}
        <section className="dash-cards">
          <Link href={`/p/${project.key}/issues?person=${encodeURIComponent(me.loginId)}&open=1`} className="card lead">
            <span className="c-k">나와 관련된 미해결</span>
            <span className="c-v">{myOpen.toLocaleString()}</span>
            <span className="c-h">내가 올렸거나 맡은 것 →</span>
          </Link>

          <Link
            href={`/p/${project.key}/issues?priority=${criticalCode}&open=1`}
            className={`card${criticalOpen > 0 ? " alert" : ""}`}
          >
            <span className="c-k">{priorities[0]?.name ?? "Critical"} 미해결</span>
            <span className="c-v">{criticalOpen.toLocaleString()}</span>
            <span className="c-h">가장 먼저 볼 숫자 →</span>
          </Link>

          <Link href={`/p/${project.key}/issues?assignee=none&closed=1`} className="card">
            <span className="c-k">담당자 없는 이슈</span>
            <span className="c-v">{unassigned.toLocaleString()}</span>
            <span className="c-h">아무도 안 잡은 것 →</span>
          </Link>

          <div className="card flat">
            <span className="c-k">전체 진행</span>
            <span className="c-v">{pct.toFixed(1)}%</span>
            <span className="c-bar"><i style={{ width: `${pct}%` }} /></span>
            <span className="c-h">남은 것 {remaining.toLocaleString()}건</span>
          </div>
        </section>

        {/* ①-b 내 이슈가 지금 어느 단계에 있나 — 작성 · 담당을 나눠서 */}
        <section className="panel">
          <h2>내 이슈 상태별</h2>
          <p className="p-hint">
            <b>내가 올린 것</b>과 <b>내가 맡은 것</b>을 나눠서 봅니다 — 할 일이 서로 다르기 때문입니다.
            조각을 누르면 그 상태만 걸러집니다.
          </p>
          {myTotal === 0 ? (
            <p className="dash-none">
              아직 내가 올리거나 맡은 이슈가 없습니다.{" "}
              <Link href={`${base}/issues/new`}>이슈 등록 →</Link>
            </p>
          ) : (
            <PersonBars
              showAvatar={false}
              emptyText=""
              rows={myAxes
                .filter((x) => x.row)
                .map((x) => ({ ...x.row!, name: x.label }))}
            />
          )}
          {myAxes.some((x) => !x.row) && (
            <p className="p-note">
              아직 0건 — {myAxes.filter((x) => !x.row).map((x) => x.label).join(" · ")}
            </p>
          )}
        </section>

        {/* ② 상태 | 우선순위 */}
        <div className="dash-grid">
          <section className="panel">
            <h2>상태별 진행도</h2>
            <p className="p-hint">조각이나 상태 이름을 누르면 그 상태의 목록으로 갑니다.</p>
            <div className="donut-row">
              <Donut slices={slices} centerValue={`${pct.toFixed(1)}%`} centerLabel="종결" />
              <DonutLegend slices={slices} total={total} />
            </div>
          </section>

          <section className="panel">
            <h2>우선순위별</h2>
            <p className="p-hint">
              옅은 막대가 전체, <b>진한 부분이 아직 남은 것</b>입니다.
              진한 게 길수록 손댈 게 많습니다.
            </p>
            <SplitBars rows={priorityRows} />
          </section>
        </div>

        {/* ③ 사람별 — 두 축을 따로 */}
        <div className="dash-grid">
          <section className="panel">
            <h2>작성자별</h2>
            <p className="p-hint">
              막대는 <b>상태 색</b>으로 나눠 칠했습니다. 조각을 누르면 <b>그 사람의 그 상태</b>만,
              이름을 누르면 그 사람이 <b>올린</b> 것 전부가 나옵니다.
            </p>
            <PersonBars rows={reporterRows} emptyText="아직 등록된 이슈가 없습니다." />
          </section>

          <section className="panel">
            <h2>담당자별</h2>
            <p className="p-hint">
              조각을 누르면 <b>그 사람이 맡은 그 상태</b>만 나옵니다. 작성자와 담당자를 <b>따로</b> 봅니다.
              {/* ★ "겹치는 이슈가 없습니다" 를 박아 뒀었다. 누군가 자기 이슈를 자기가
                  맡는 순간 거짓말이 된다. 세는 값으로 바꾼다. */}
              {bothCount === 0
                ? " 지금 두 역할이 겹치는 이슈가 없습니다."
                : ` 두 역할이 겹치는 이슈가 ${bothCount.toLocaleString()}건 있어 양쪽에 모두 셉니다.`}
            </p>
            <PersonBars rows={assigneeRows} emptyText="아직 담당자가 지정된 이슈가 없습니다." />
            {unassigned > 0 && (
              <Link href={`/p/${project.key}/issues?assignee=none&closed=1`} className="p-warn">
                담당자 없는 이슈 <b>{unassigned.toLocaleString()}건</b> — 놓치기 가장 쉽습니다 →
              </Link>
            )}
          </section>
        </div>

        {/* ④ 어디에 몰려 있나 — 차수 · 시스템 */}
        <div className="dash-grid">
          <section className="panel">
            <h2>차수별</h2>
            <p className="p-hint">
              {rounds.length <= 1
                ? "아직 한 차수뿐입니다. 차수를 더 만들면 회귀 때 여기서 비교합니다."
                : "지난 차수의 진한 부분이 남아 있으면 이번 차수로 넘어온 것입니다."}
              {noRound > 0 && " 차수가 없는 이슈는 막대 아래에 따로 셉니다."}
            </p>
            <SplitBars rows={roundRows} showDot={false} />
            {noRound > 0 && (
              <Link href={`${base}/issues?round=none&closed=1`} className="p-warn">
                차수 미지정 <b>{noRound.toLocaleString()}건</b>
                {noRoundOpen > 0 && ` (남은 것 ${noRoundOpen.toLocaleString()})`} — 엑셀에서
                옮겨온 이슈입니다. 막대에 넣으면 척도를 혼자 다 먹어 따로 셉니다 →
              </Link>
            )}
          </section>

          <section className="panel">
            <h2>시스템별</h2>
            <p className="p-hint">회귀 범위를 정할 때 봅니다. 남은 것이 몰린 쪽이 이번에 볼 곳입니다.</p>
            <SplitBars rows={systemRows} showDot={false} />
          </section>
        </div>

        {/* ⑤ 추이 */}
        <section className="panel">
          <h2>등록 vs 종결</h2>
          <p className="p-hint">
            등록선이 종결선 위에 있으면 쌓이는 중, 아래로 내려오면 줄어드는 중입니다.
            <b> 교차점이 안정화 시점</b>입니다.
          </p>
          <Trend points={trend} />
        </section>

        <p className="dash-foot">
          <b>처리 소요일</b>과 <b>재수정률</b>은 아직 없습니다. 변경 이력이 2~4주 쌓여야
          의미가 생기고, 지금 넣으면 빈 그래프가 됩니다 —
          <b> 없는 데이터를 있는 척하지 않습니다</b> (<code>docs/10</code> §7).
        </p>
      </main>
    </>
  );
}
