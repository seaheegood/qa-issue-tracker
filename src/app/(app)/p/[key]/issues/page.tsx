import { Fragment } from "react";
import { themedText } from "@/lib/color";

import Link from "next/link";
import { ProjectField } from "@/components/ProjectField";

import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import {
  buildWhere, filterToQuery, hasAnyFilter, notDeleted, parseFilter, type SearchParams,
} from "@/lib/issue-filter";
import { people } from "@/lib/people";
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/project";
import {
  Avatar, byTeam, formatDateTime, issueNo, PriorityDot,
  REPRO_RATE_LABEL, REPRO_RATES, type ReproRate, StatusDot,
} from "@/lib/ui";
import { COLUMNS } from "@/lib/issue-columns";
import type { Prisma } from "@prisma/client";

import { ToolbarHeight } from "@/components/ToolbarHeight";

import { BulkBar } from "./BulkBar";
import { deleteFilter, saveFilter } from "./filter-actions";
import { PeekLinks } from "./PeekLinks";
import { ColumnGrip } from "./ColumnGrip";
import { ColumnPicker } from "./ColumnPicker";
import { ViewModeToggle } from "./ViewModeToggle";
import { IssueDetailBody, parseSeq } from "./[seq]/IssueDetailBody";
import { PeekResizer } from "@/components/PeekResizer";

/** 한 쪽에 몇 건. 사용자가 고른다 (`?per=`). 첫 값이 기본이다. */
const PAGE_SIZES = [50, 100] as const;
const PAGE_SIZE = PAGE_SIZES[0];

// ★ 필터 조립은 `@/lib/issue-filter` 로 나갔다. 목록·내보내기·저장된 필터가 같은 함수를 쓴다 —
//   복제하면 "화면은 441건인데 내보내면 679건" 이 된다.
/**
 * 목록의 날짜 칸 — `9/16 15:32`.
 *
 * ★ 상세의 `formatDateTime`(`2026-09-16 15:32`)보다 짧다. 목록은 한 줄에 칸이 많아
 *   **연도까지 쓰면 제목이 밀린다.** 대신 `title` 로 전체를 단다 (C-40 — 절대시간).
 * ⚠️ 해가 바뀌면 `1/03` 이 올해인지 작년인지 안 보인다. **올해가 아니면 연도를 붙인다.**
 */
function formatStamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear() !== new Date().getFullYear() ? `${String(d.getFullYear()).slice(2)}/` : "";
  return `${y}${d.getMonth() + 1}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 머리줄을 눌러 정렬 — `?sort=updated&dir=asc`.
 *
 * ★ **아는 키만 받는다.** 화이트리스트가 아니면 `?sort=;drop` 같은 값이 그대로
 *   `orderBy` 로 가고, Prisma 가 던지면 목록 전체가 500 이 된다 (재현율과 같은 이유).
 * ⚠️ `pri` 는 코드가 아니라 **`sortOrder`** 로 정렬한다. 코드(`P1`·`CRIT`)는
 *   프로젝트마다 다르고, 사람이 기대하는 건 *"급한 것부터"* 다.
 */
const SORTS: Record<string, (d: "asc" | "desc") => Prisma.IssueOrderByWithRelationInput> = {
  seq: (d) => ({ seq: d }),
  pri: (d) => ({ priority: { sortOrder: d === "desc" ? "asc" : "desc" } }),
  title: (d) => ({ title: d }),
  created: (d) => ({ createdAt: d }),
  updated: (d) => ({ updatedAt: d }),
  reported: (d) => ({ reportedAt: d }),
};

/**
 * 마스터 목록 조회 조건 — **켜진 것 + 지금 골라 둔 것**.
 *
 * ★ 꺼진 값도 골라 뒀으면 가져와야 한다. 안 그러면 공유 링크를 받은 사람의 칩이
 *   이름 대신 **코드**로 보인다 (`SV` 가 `운영자 콘솔` 이 되지 못한다).
 * ⚠️ `"none"` 은 마스터에 없는 센티널이라 걸러 낸다 — 넣으면 `code: "none"` 을 찾는다.
 */
const onOrPicked = (picked: string[] | undefined) => {
  const codes = (picked ?? []).filter((c) => c !== "none");
  return codes.length
    ? { OR: [{ isActive: true }, { code: { in: codes } }] }
    : { isActive: true };
};

const one = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

type IssueRow = Prisma.IssueGetPayload<{ include: typeof ROW_INCLUDE }>;

const ROW_INCLUDE = {
  status: true,
  round: true,
  platforms: { include: { platform: true } },
  priority: true,
  // ★ 2026-09-16 — 컬럼을 사람이 고르므로 **고를 수 있는 건 전부 받는다.**
  //   안 보이는 칸은 CSS 가 감출 뿐이고, 한 쪽에 50줄이라 조회 비용 차이가 없다.
  system: true,
  environment: true,
  reporter: { select: { name: true, team: { select: { color: true } } } },
  assignee: { select: { name: true, team: { select: { color: true } } } },
  // 가장 마지막에 쓴 사람을 보여주기 위해 마지막 코멘트 1건만 가져온다.
  // 담당자(assignee)는 목록에서 뺐다 — 누가 마지막으로 손댔는지가 더 궁금한 정보다.
  comments: {
    orderBy: { id: "desc" },
    take: 1,
    select: {
      type: true,
      legacyLastAuthor: { select: { name: true, team: { select: { color: true } } } },
    },
  },
  _count: { select: { comments: true, attachments: true } },
} as const;

export default async function IssueListPage({
  params, searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const f = parseFilter(sp);
  const page = Math.max(1, Number(one(sp.page) ?? 1) || 1);

  /**
   * 정렬 — `?sort=updated&dir=asc`.
   *
   * ★ **필터가 아니다.** `FILTER_KEYS` 에 넣지 않는다 (`page` 와 같은 취급) —
   *   저장된 필터·엑셀 링크는 *"무엇을 볼 것인가"* 지 *"어떤 차례로"* 가 아니다.
   *   대신 `url()` 의 기본값에 실어 **필터를 바꿔도 정렬이 유지**되게 한다.
   * ⚠️ 아는 키만 받는다. 모르는 값을 그대로 `orderBy` 에 넘기면 Prisma 가 던진다.
   */
  const sort = SORTS[one(sp.sort) ?? ""] ? one(sp.sort)! : "seq";
  const dir: "asc" | "desc" = one(sp.dir) === "asc" ? "asc" : "desc";
  const hasFilter = hasAnyFilter(f);

  const me = await requireUser();
  const project = await requireProject(params);

  /**
   * ⚠️ **`?deleted=1` 은 관리자만 먹는다.** 화면에서 버튼을 감추는 것만으로는
   *   부족하다 — 주소는 누구나 칠 수 있다. 여기서 값을 **떼어 낸 뒤** 조건을 만든다
   *   (`C-44` — 폼으로 들어온 값을 서버가 다시 확인하는 것과 같은 규칙).
   */
  if (f.deleted === "1" && me.systemRole !== "ADMIN") delete f.deleted;

  const where = buildWhere(project.id, f);

  /**
   * 열린 사이드 패널 — `?peek=1702` (2026-09-16).
   *
   * ★ **주소가 정한다.** 그래서 공유되고, 뒤로가기가 되고, 서버가 첫 응답에 이미
   *   그려 보낸다. 쿠키·`localStorage` 로 두면 링크를 받은 사람이 다른 화면을 본다.
   * ★ `parseFilter()` 가 모르는 키라 **필터로 세지 않는다** — 칩도 안 생기고
   *   `filterToQuery()` 에도 안 들어가므로 엑셀·저장된 필터가 흔들리지 않는다.
   * ★ 숫자가 아니면 그냥 안 연다. 여기서 `notFound()` 를 부르면 **목록이 통째로 죽는다.**
   */
  const peekSeq = one(sp.peek) ? parseSeq(one(sp.peek)!) : null;

  const [statuses, priorities, systems, rounds, platformList, environments,
         members, grandTotal, saved] =
    await Promise.all([
    // ★ 켜진 것만. 사이드바·대시보드·상세는 원래 이렇게 걸렀는데 목록만 빠져 있어서,
    //   안 쓰는 상태가 묶음 머리와 드롭다운에 남아 **같은 화면 안에서 말이 달랐다.**
    prisma.issueStatus.findMany({
      where: { projectId: project.id, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    // ★ 목록은 **필터 드롭다운 + 칩 이름**을 겸한다 (A-70·A-71).
    //   지금 걸려 있는 필터 값은 꺼져 있어도 가져온다 — 공유 링크(`?system=SV`)를 받은
    //   사람에게 칩이 코드가 아니라 **이름**으로 보여야 하기 때문이다.
    //   ⚠️ 2026-09-16 부터 드롭다운이 **늘 떠 있다**(다중 선택). 꺼진 값이 선택지로
    //     새지 않도록, 목록을 쓰는 쪽에서 `isActive` 를 한 번 더 본다.
    prisma.priority.findMany({
      where: { projectId: project.id, ...onOrPicked(f.priority) },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.system.findMany({
      where: { projectId: project.id, ...onOrPicked(f.system) },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.round.findMany({
      where: { projectId: project.id, ...onOrPicked(f.round) },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.platform.findMany({
      where: { projectId: project.id, ...onOrPicked(f.platform) },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.environment.findMany({
      where: { projectId: project.id, ...onOrPicked(f.environment) },
      orderBy: { sortOrder: "asc" },
    }),
    // ★ **고를 수 있는 사람 = 활성 사용자 전원** (2026-09-11 — 멤버 폐지).
    //   `people()` 한 곳에서만 만든다 (`src/lib/people.ts`).
    people(),
    // ⚠️ 전체 건수도 숨긴 것을 뺀다 — 옆의 «지금 건수»(buildWhere)와 같은 기준이어야 한다
    prisma.issue.count({ where: { projectId: project.id, ...notDeleted } }),
    // 내 것 + 공유된 것. 이름순으로 고정한다 — 순서가 흔들리면 근육기억이 안 붙는다.
    prisma.savedFilter.findMany({
      where: { projectId: project.id, OR: [{ ownerId: me.id }, { isShared: true }] },
      include: { owner: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  /** 현재 조건에서 키 하나만 바꾼 URL */
  const base = `/p/${project.key}`;
  const url = (patch: Record<string, string | number | string[] | undefined>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | number | string[] | undefined> = {
      ...f, page,
      // 정렬은 필터가 아니지만 **링크를 타고 살아남아야** 한다 —
      // 상태를 하나 고를 때마다 정렬이 풀리면 아무도 정렬을 안 쓴다.
      ...(sort !== "seq" ? { sort } : {}),
      ...(dir !== "desc" ? { dir } : {}),
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) {
      // 빈 배열은 값이 없는 것과 같다. 남기면 `?platform=` 같은 껍데기가 생긴다.
      if (Array.isArray(v) && v.length === 0) continue;
      const val = Array.isArray(v) ? v.join(",") : v;
      if (val !== undefined && val !== "" && !(k === "page" && val === 1)) p.set(k, String(val));
    }
    const s = p.toString();
    // ★ 프로젝트가 주소에 들어간다. 여기 한 곳만 고치면 목록의 모든 링크가 따라온다.
    return s ? `${base}/issues?${s}` : `${base}/issues`;
  };

  // 지금 걸린 필터를 쿼리스트링으로. 내보내기와 저장이 같은 문자열을 쓴다 —
  // 이게 갈라지면 "저장했는데 다른 게 열린다" 가 된다.
  // 쪽 크기. 아는 값만 받는다 — `?per=99999` 로 서버를 끌어내리지 못하게.
  const perPage = PAGE_SIZES.find((n) => String(n) === f.per) ?? PAGE_SIZE;

  const query = filterToQuery(f);

  const statusByCode = new Map(statuses.map((s) => [s.code, s]));

  const priorityByCode = new Map(priorities.map((p) => [p.code, p]));
  const systemByCode = new Map(systems.map((s) => [s.code, s]));
  const roundByCode = new Map(rounds.map((r) => [r.code, r]));
  const platformByCode = new Map(platformList.map((p) => [p.code, p]));
  const envByCode = new Map(environments.map((e) => [e.code, e]));
  const memberByLogin = new Map(members.map((m) => [m.loginId, m]));

  /**
   * 작성자·담당자 드롭다운은 **전원**을 보여주고 팀으로 묶는다 (2026-09-11).
   *
   * ★ 예전엔 작성자에 `QA` 역할, 담당자에 `DEV` 역할만 넣었다. 멤버를 없애면서
   *   그 기준이 사라졌고, 애초에 **틀린 기준**이기도 했다 — 개발이 올린 이슈나
   *   QA 가 맡은 이슈는 그 드롭다운에서 영영 안 보였다.
   *   대신 팀으로 묶어 16명이어도 한눈에 찾게 한다.
   */
  /**
   * 걸린 필터를 칩 목록으로 편다.
   *
   * ★ **한 곳에서 만든다.** 필터가 열한 개가 되면서 JSX 에 `f.xxx?.map(...)` 을
   *   열한 번 적으면 **하나가 빠져도 아무도 모른다** — 걸렸는데 칩이 없으면
   *   *"왜 21건만 나오지"* 가 된다.
   */
  /**
   * ★★ **상태의 '기본 집합'** (2026-09-16 사용자 지시).
   *
   *   주소에 `status` 가 없으면 **"Closed 빼고 전부 켜진 것"** 이다 —
   *   `buildWhere` 의 '종결 제외' 기본값과 같은 뜻이고, 사이드바도 그렇게 그린다.
   *   ⚠️ 사이드바(`IssueNav`)와 **같은 규칙**이어야 한다. 한쪽만 고치면
   *     *"사이드바에서는 꺼졌는데 툴바에서는 안 꺼진"* 상태가 된다.
   */
  const allStatusCodes = statuses.map((s) => s.code);
  const openStatusCodes = statuses.filter((s) => s.category !== "CLOSED").map((s) => s.code);
  const statusOn = f.status?.length
    ? f.status
    : f.closed === "1" ? allStatusCodes : openStatusCodes;

  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x) => b.includes(x));

  /** 상태 하나를 켜고 끈 주소. 기본 집합으로 돌아오면 주소에서 지운다 */
  const statusHref = (code: string) => {
    const next = statusOn.includes(code)
      ? statusOn.filter((c) => c !== code)
      : [...statusOn, code];
    if (sameSet(next, openStatusCodes)) return url({ status: undefined, closed: undefined, page: 1 });
    if (sameSet(next, allStatusCodes)) return url({ status: undefined, closed: "1", page: 1 });
    if (next.length === 0) return url({ status: ["__none__"], closed: undefined, page: 1 });
    return url({ status: next, closed: undefined, page: 1 });
  };

  /**
   * ★★ **버튼이 자기 상태를 말한다** (2026-09-16 · 칩을 걷어내면서).
   *
   *   `picked("priority", …)` 는 지금 걸린 값들의 **이름**을 준다. 그걸 받은
   *   `Dropdown` 이 `＋우선순위` → `우선순위 Critical` → `우선순위 2종` 으로 바뀐다.
   *
   * ★ **한 곳에서 만든다.** 필터가 아홉 개인데 버튼마다 `(f.xxx ?? []).map(...)` 을
   *   적으면 **한 군데를 빠뜨려도 아무도 모른다** — 걸렸는데 버튼이 시치미를 떼면
   *   *"왜 21건만 나오지"* 가 된다. (`toggle`·`buildWhere` 를 한 곳에 둔 것과 같은 이유)
   */
  type PickedKey = "priority" | "system" | "environment" | "platform"
                 | "round" | "repro" | "reporter" | "assignee";
  const picked = (key: PickedKey, label: (c: string) => string) => (f[key] ?? []).map(label);
  /** 그 필터만 푸는 주소. `×` 가 여기로 간다 */
  const clear = (key: PickedKey) => url({ [key]: undefined, page: 1 });

  /**
   * 상태 버튼만 규칙이 하나 더 있다.
   *
   * ★ 사이드바 `전체`(`?closed=1`)가 만들던 **`범위 종결 포함` 칩을 없앴다**
   *   (2026-09-16 사용자 지시). 그 뜻은 *"상태를 전부 본다"* 이므로
   *   **상태 버튼이 `상태 전체` 로 말한다** — 범위라는 두 번째 축을 만들 이유가 없다.
   * ★ 기본(Closed 제외)은 **안 걸린 것으로 본다.** 그게 이 화면의 출발점이라,
   *   걸렸다고 표시하면 모든 사람이 늘 필터가 걸린 화면을 보게 된다.
   */
  const statusPicked = f.status?.length
    ? f.status.map((c) => (c === "__none__" ? "없음" : statusByCode.get(c)?.name ?? c))
    : f.closed === "1" ? ["전체"] : [];

  const peopleByTeam = byTeam(members);

  return (
    <>
      <PageHeader
        title="이슈리스트"
        search={f.q}
        keep={f}
      />
      <ToolbarHeight />
      {/* ★★ **툴바는 두 줄이다** (2026-09-16 사용자 지시).
          윗줄은 화면 전체에 걸리는 것(보기 방식·엑셀·새 이슈),
          아랫줄은 **목록을 좁히는 것**(필터·컬럼·일괄·저장된 필터)이라
          목록 바로 위에 한 박스로 붙는다.
          ⚠️ 겉껍데기 `.toolbar` 는 그대로 둔다 — `ToolbarHeight` 가 이 요소의 높이를
            재서 머리줄의 sticky 위치를 잡는다. 쪼개면 머리줄이 툴바에 가린다. */}
      <div className="toolbar">
        <div className="tb-actions">
          {/* ★★ **건수가 윗줄 맨 왼쪽이다** (2026-09-16 사용자 지시 — 두 번째 이사다).
              툴바 오른쪽 끝 → 검색창 옆 → 여기. 목록을 좁히는 것들 바로 위, 왼쪽 끝이라
              *"지금 몇 건을 보고 있나"* 가 제일 먼저 읽힌다.
              ⚠️ **필터가 없어도 전체 건수가 아니다.** 기본 화면이 이미 '종결 제외' 라
                `2,328건` 을 보여주면 목록(888줄)과 어긋난다 — 실제로 그렇게 나왔었다.
                언제나 **지금 조회 조건으로 센 수**를 보여준다. */}
          <span className="tb-count">
            <FilteredCount where={where} total={grandTotal} />
          </span>

          {/* ★ **보는 방식을 정하는 것들**이 여기로 올라왔다 (2026-09-16 사용자 지시).
              아랫줄은 *목록을 좁히는 것*(필터)만 남긴다 — 성격이 다르다. */}
          <ColumnPicker />

          {/* ★ 일괄 편집은 **새 값을 박는 자리**다. 위 목록에는 지금 걸린 필터 때문에
              꺼진 값이 섞여 있을 수 있으므로 여기서는 켜진 것만 넘긴다 (A-70). */}
          <BulkBar
            members={members.map((m) => ({ id: m.id, name: m.name }))}
            rounds={rounds.filter((r) => r.isActive).map((r) => ({ id: r.id, name: r.name }))}
            priorities={priorities.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }))}
            platforms={platformList.filter((p) => p.isActive).map((p) => ({ code: p.code, name: p.name }))}
          />

          {/* 줄을 누르면 전체 페이지로 갈지, 오른쪽 패널에 띄울지 (I-09) */}
          <ViewModeToggle />

          {/* ★ 지금 보고 있는 목록 그대로 내려받는다. 화면과 같은 조건을 그대로 넘긴다 —
              목록과 파일의 건수가 다르면 그 파일은 못 믿는 파일이 된다. */}
          <a
            className="btn-export"
            href={`/api/issues/export?p=${project.key}${query ? `&${query}` : ""}`}
            title={hasFilter ? "지금 걸린 필터 그대로 엑셀로" : "전체를 엑셀로"}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
            엑셀
          </a>
          <Link href={`${base}/issues/new`} className="btn-new">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            새 이슈
          </Link>
        </div>

        <div className="tb-filters">
        {/* ★★ **칩을 걷어냈다 — 버튼이 자기가 걸렸다고 말한다** (2026-09-16 사용자 지시).
            예전엔 고른 값마다 칩이 하나씩 생겼다. 그래서 우선순위 둘만 골라도
            `우선순위 Critical ×` `우선순위 Major ×` 가 나란히 서고, 바로 옆에
            `＋우선순위` 버튼이 또 있었다 — **같은 필터가 화면에 세 번** 나왔다.
            이제 버튼 하나가 `우선순위 2종 ×` 로 끝낸다 (`Dropdown` 참고).

            ⚠️ **버튼이 없는 필터만 칩으로 남긴다** — 미해결 · 관련 · 고른 것.
              대시보드와 알림이 보내는 링크라 드롭다운에 짝이 없다. 표시까지 없애면
              **화면이 왜 좁혀졌는지 아무 데도 안 적힌 채** 목록만 줄어든다 —
              그건 *"이슈가 사라졌다"* 로 읽힌다 (`I-47` 에서 겪은 그것).
              검색어는 검색창이 이미 보여주므로 칩이 없다. */}
        {f.open === "1" && (
          <Chip k="상태" v="미해결" href={url({ open: undefined, page: 1 })} />
        )}
        {(f.person ?? []).map((code) => (
          <Chip key={`person:${code}`} k="관련"
            v={memberByLogin.get(code)?.name ?? code}
            href={url({ person: (f.person ?? []).filter((x) => x !== code), page: 1 })} />
        ))}
        {f.seq?.length ? (
          <Chip k="고른 것" v={`${f.seq.length}건`} href={url({ seq: undefined, page: 1 })} />
        ) : null}

        {/* ★★ **드롭다운은 늘 떠 있고, 항목은 토글이다** (2026-09-16).
            예전엔 `{!f.status && …}` 라 **필터가 걸리면 드롭다운이 사라졌다** —
            다른 값으로 바꾸려면 칩을 먼저 지워야 했고, 두 개를 고를 길이 아예 없었다.
            플랫폼만 이 모양이었고 이제 전부 같아졌다. */}
        {/* ★ 사이드바와 **같은 규칙**이다 — 기본은 Closed 빼고 전부 켜진 것으로 보고,
            누르면 그 집합을 펼쳐 적은 뒤 그 값을 끈다 (`statusHref`). */}
        <Dropdown label="상태" picked={statusPicked}
          clearHref={url({ status: undefined, closed: undefined, page: 1 })}>
          {statuses.map((s) => (
            <Pick key={s.id} on={statusOn.includes(s.code)} href={statusHref(s.code)}>
              <StatusDot color={s.color} />
              {s.name}
            </Pick>
          ))}
        </Dropdown>
        <Dropdown label="우선순위" clearHref={clear("priority")}
          picked={picked("priority", (c) => priorityByCode.get(c)?.name ?? c)}>
          {priorities.map((p) => (
            <Pick key={p.id} on={f.priority?.includes(p.code) ?? false}
              href={url({ priority: toggle(f.priority, p.code), page: 1 })}>
              <PriorityDot color={p.color} name={p.name} />
              {p.name}
            </Pick>
          ))}
        </Dropdown>
        <Dropdown label="시스템" clearHref={clear("system")}
          picked={picked("system", (c) => systemByCode.get(c)?.name ?? c)}>
          {systems.map((s) => (
            <Pick key={s.id} on={f.system?.includes(s.code) ?? false}
              href={url({ system: toggle(f.system, s.code), page: 1 })}>{s.name}</Pick>
          ))}
        </Dropdown>
        {/* 환경 — 2026-09-16 신설. 목록에는 계속 있었는데 **필터가 없었다** */}
        <Dropdown label="환경" clearHref={clear("environment")}
          picked={picked("environment", (c) => envByCode.get(c)?.name ?? c)}>
          {environments.map((e) => (
            <Pick key={e.id} on={f.environment?.includes(e.code) ?? false}
              href={url({ environment: toggle(f.environment, e.code), page: 1 })}>{e.name}</Pick>
          ))}
        </Dropdown>
        <Dropdown label="플랫폼" clearHref={clear("platform")}
          picked={picked("platform", (c) => platformByCode.get(c)?.name ?? c)}>
          {platformList.map((pf) => (
            <Pick key={pf.id} on={f.platform?.includes(pf.code) ?? false}
              href={url({ platform: toggle(f.platform, pf.code), page: 1 })}>{pf.name}</Pick>
          ))}
        </Dropdown>
        <Dropdown label="차수" clearHref={clear("round")}
          picked={picked("round", (c) => (c === "none" ? "미분류" : roundByCode.get(c)?.name ?? c))}>
          {rounds.map((r) => (
            <Pick key={r.id} on={f.round?.includes(r.code) ?? false}
              href={url({ round: toggle(f.round, r.code), page: 1 })}>{r.name}</Pick>
          ))}
          {/* 이관한 1,704건은 차수를 모른다. 그것만 따로 볼 수 있어야 한다. */}
          <Pick on={f.round?.includes("none") ?? false}
            href={url({ round: toggle(f.round, "none"), page: 1 })}>미분류</Pick>
        </Dropdown>
        {/* 재현율 (FB-008).
            ★ `항상` 만 걸러서 보는 게 이 필터의 주 용도다 — 개발에 넘기기 전에
              "확실히 재현되는 것부터" 훑을 때. 반대로 `1회성` 만 모으면
              **Monitoring 으로 보낼 후보**가 나온다. 두 요구가 한 필터로 이어진다. */}
        <Dropdown label="재현율" clearHref={clear("repro")}
          picked={picked("repro", (c) => REPRO_RATE_LABEL[c as ReproRate] ?? c)}>
          {REPRO_RATES.map((r) => (
            <Pick key={r} on={f.repro?.includes(r) ?? false}
              href={url({ repro: toggle(f.repro, r), page: 1 })}>{REPRO_RATE_LABEL[r]}</Pick>
          ))}
        </Dropdown>
        <Dropdown label="작성자" clearHref={clear("reporter")}
          picked={picked("reporter", (c) => memberByLogin.get(c)?.name ?? c)}>
          {peopleByTeam.map((g) => (
            <Fragment key={g.team}>
              <span className="dd-group">{g.team}</span>
              {g.people.map((m) => (
                <Pick key={m.id} on={f.reporter?.includes(m.loginId) ?? false}
                  href={url({ reporter: toggle(f.reporter, m.loginId), page: 1 })}>
                  <Avatar name={m.name} color={m.team?.color} />
                  {m.name}
                </Pick>
              ))}
            </Fragment>
          ))}
        </Dropdown>
        <Dropdown label="담당자" clearHref={clear("assignee")}
          picked={picked("assignee", (c) => (c === "none" ? "미지정" : memberByLogin.get(c)?.name ?? c))}>
          <Pick on={f.assignee?.includes("none") ?? false}
            href={url({ assignee: toggle(f.assignee, "none"), page: 1 })}>
            <Avatar name={null} />
            미지정
          </Pick>
          {peopleByTeam.map((g) => (
            <Fragment key={g.team}>
              <span className="dd-group">{g.team}</span>
              {g.people.map((m) => (
                <Pick key={m.id} on={f.assignee?.includes(m.loginId) ?? false}
                  href={url({ assignee: toggle(f.assignee, m.loginId), page: 1 })}>
                  <Avatar name={m.name} color={m.team?.color} />
                  {m.name}
                </Pick>
              ))}
            </Fragment>
          ))}
        </Dropdown>

        {/* ★★ **숨긴 이슈 보기** (2026-09-17 · 사용자 지시 — 되살리기는 목록의 필터로).
            ★ 새 화면을 안 만든 이유 — 검색·정렬·컬럼을 그대로 쓴다.
            ⚠️ **관리자에게만 버튼이 보인다.** 다만 주소는 누구나 칠 수 있으므로
              `buildWhere` 가 아니라 **여기서** 한 번 더 막는다 (`C-44` 와 같은 규칙). */}
        {me.systemRole === "ADMIN" && (
          <Link
            className={f.deleted === "1" ? "ddbox on deleted-toggle" : "ddbox deleted-toggle"}
            href={url({ deleted: f.deleted === "1" ? undefined : "1", page: 1 })}
          >
            {f.deleted === "1" ? "숨긴 이슈만 ×" : "숨긴 이슈"}
          </Link>
        )}

        {hasFilter && <Link className="chip-clear" href={`${base}/issues`}>모두 지우기</Link>}

        {/* ★ `저장된 필터` 는 **여기 남는다** — 컬럼·일괄과 달리 *"무엇을 볼 것인가"* 라
            필터 박스의 일원이다 (2026-09-16 사용자 지시). */}
        <div className="right">
          <SavedFilters saved={saved} meId={me.id} query={query} hasFilter={hasFilter} projectKey={project.key} />
        </div>
        </div>
      </div>

      {/* ★ 목록과 패널이 **나란히** 선다. 패널이 닫혀 있으면 격자 자체가 없다 —
          `grid-template-columns` 에 0 폭 칸을 남겨두면 그 칸의 테두리가 그대로 보인다. */}
      <div className={peekSeq === null ? "listwrap" : "listwrap listwrap--peek"}>
        {/* ★★ **화면이 하나다** (2026-09-16 · 사용자 지시).
            예전엔 필터가 없으면 **상태별 아코디언**, 있으면 평면 목록으로 갈렸다.
            같은 주소가 두 가지 화면을 내는 셈이라 *"내가 뭘 보고 있는지"* 가 흐렸고,
            아코디언은 상태마다 쿼리를 둘씩(상태 9개면 18개) 돌렸다. */}
        <PeekLinks>
          <FlatList
            projectKey={project.key} perPage={perPage} where={where} page={page}
            url={url} prefix={project.issuePrefix} sort={sort} dir={dir}
          />
        </PeekLinks>

        {peekSeq !== null && (
          // ⚠️ 일괄 편집 폼(`#bulk`) **안에 넣으면 안 된다** — 폼 중첩이 되어
          //   패널 안의 폼들이 조용히 죽는다. 툴바의 폼과 형제로 둔다.
          <aside className="peek">
            <PeekResizer />
            <div className="peek-scroll">
              {/* 전체 페이지와 **같은 컴포넌트**를 그린다 (compact). 닫기는 `?peek` 만 뺀 주소 */}
              {/* ★ 변경 이력도 **패널에서 열린다** (2026-09-17). 주소로 여는 방식이라
                  전체 페이지와 규칙이 같다. 안 열면 질의가 아예 안 나간다.
                  ⚠️ `?history` 는 **필터가 아니다** — `parseFilter` 가 모르는 키라
                    칩도 안 생기고 엑셀·저장된 필터가 흔들리지 않는다 (`I-75`). */}
              <IssueDetailBody
                me={me} project={project} seq={peekSeq} compact closeHref={url({})}
                showHistory={one(sp.history) === "1"}
                historyHref={peekLinks(url({}), peekSeq)}
              />
            </div>
          </aside>
        )}
      </div>
    </>
  );
}

/* ── 조각들 ──────────────────────────────────────────────── */

/**
 * 패널에서 변경 이력을 열고 닫는 주소.
 *
 * ⚠️⚠️ **`url({})` 은 «패널을 닫는» 주소다** — `peek` 은 필터가 아니라서
 *   `url()` 이 안 실어 준다 (`I-75`). 거기에 `&history=1` 만 붙이면
 *   **이력을 열면서 패널이 같이 닫힌다.** 그래서 `peek` 을 다시 넣어 준다.
 */
function peekLinks(base: string, seq: number) {
  const [path, q = ""] = base.split("?");
  const mk = (history: boolean) => {
    const p = new URLSearchParams(q);
    p.set("peek", String(seq));
    if (history) p.set("history", "1");
    else p.delete("history");
    return `${path}?${p.toString()}`;
  };
  return { open: mk(true), close: mk(false) };
}

function Chip({ k, v, href }: { k: string; v: string; href: string }) {
  return (
    <span className="chip">
      <span className="k">{k}</span>
      <span className="v" title={v}>{v}</span>
      <Link className="x" href={href} aria-label={`${k} 필터 해제`}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </Link>
    </span>
  );
}

/**
 * 저장된 필터 (요구사항서 09).
 *
 * ★ JS 없이 동작한다. `<details>` 로 열고 폼 두 개(저장·삭제)로 끝낸다 —
 *   나머지 드롭다운과 같은 방식이라 새로 배울 게 없다.
 *
 * ★ **내 것과 공유된 것을 나눠 보여준다.** 섞으면 남의 필터를 자기 것으로 알고
 *   지우려다 못 지운다 (삭제는 주인만 된다).
 */
function SavedFilters({
  saved, meId, query, hasFilter, projectKey,
}: {
  projectKey: string;
  saved: { id: number; name: string; query: string; isShared: boolean; ownerId: number;
           owner: { name: string } }[];
  meId: number; query: string; hasFilter: boolean;
}) {
  const mine = saved.filter((s) => s.ownerId === meId);
  const shared = saved.filter((s) => s.ownerId !== meId);

  return (
    <details className="dd sf">
      <summary title="저장된 필터">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h16l-6 7v6l-4 2v-8z" />
        </svg>
        저장된 필터{saved.length > 0 && <span className="sf-n">{saved.length}</span>}
      </summary>

      <div className="dd-menu sf-menu">
        {mine.length > 0 && (
          <>
            <p className="sf-head">내 필터</p>
            {mine.map((s) => (
              <span key={s.id} className="sf-row">
                <Link href={`/p/${projectKey}/issues?${s.query}`}>
                  {s.name}
                  {s.isShared && <span className="sf-tag">공유</span>}
                </Link>
                <form action={deleteFilter}>
      <ProjectField />
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="sf-x" aria-label={`${s.name} 지우기`}>×</button>
                </form>
              </span>
            ))}
          </>
        )}

        {shared.length > 0 && (
          <>
            <p className="sf-head">팀이 공유한 필터</p>
            {shared.map((s) => (
              <span key={s.id} className="sf-row">
                <Link href={`/p/${projectKey}/issues?${s.query}`}>
                  {s.name}
                  <span className="sf-by">{s.owner.name}</span>
                </Link>
              </span>
            ))}
          </>
        )}

        {saved.length === 0 && (
          <p className="sf-empty">
            아직 저장한 필터가 없습니다.
            <br />
            자주 보는 조건을 걸어 두고 여기서 저장하세요.
          </p>
        )}

        {/* 조건이 하나도 없으면 저장할 게 없다. 버튼을 살려두면 빈 필터가 쌓인다. */}
        {hasFilter ? (
          <form action={saveFilter} className="sf-save">
      <ProjectField />
            <input type="hidden" name="query" value={query} />
            <input
              name="name" required maxLength={60} placeholder="지금 조건에 이름 붙이기"
              suppressHydrationWarning
            />
            <label className="sf-share">
              <input type="checkbox" name="isShared" value="1" suppressHydrationWarning />
              팀에 공유
            </label>
            <button type="submit" className="btn-primary sm">저장</button>
          </form>
        ) : (
          <p className="sf-empty dim">필터를 걸면 여기서 저장할 수 있습니다.</p>
        )}
      </div>
    </details>
  );
}

/**
 * 다중 선택 값 하나를 켜고 끈다.
 *
 * ★ **한 곳에서만 만든다.** 드롭다운이 아홉 개고 필터 키도 아홉 개인데,
 *   `on ? filter : [...prev, code]` 를 아홉 번 적으면 **한 군데가 반대로 돌아도
 *   아무도 모른다.** (`buildWhere` 를 한 곳에 둔 것과 같은 이유)
 */
const toggle = (cur: string[] | undefined, code: string) =>
  cur?.includes(code) ? cur.filter((c) => c !== code) : [...(cur ?? []), code];

/** 드롭다운 항목. 고른 것은 체크가 붙고, 누르면 빠진다. */
function Pick({ on, href, children }: {
  on: boolean; href: string; children: React.ReactNode;
}) {
  return (
    <Link className={on ? "on" : undefined} href={href}>
      <span className="ddcheck">{on ? "✓" : ""}</span>
      {children}
    </Link>
  );
}

/**
 * 필터 버튼 하나.
 *
 * ★★ **버튼이 자기가 걸렸는지 말한다** (2026-09-16 사용자 지시).
 *
 *   | 지금 | 보이는 것 |
 *   |---|---|
 *   | 안 걸림 | `＋ 우선순위` — 흐린 글자, 그냥 테두리 |
 *   | 하나 | `우선순위 Critical ×` — 진한 테두리 + 연한 바탕 |
 *   | 둘 이상 | `우선순위 2종 ×` |
 *
 *   값마다 칩을 하나씩 늘어놓던 걸 대신한다. 값이 다섯이면 칩이 다섯 개 생기고
 *   그 옆에 같은 이름의 버튼이 또 있었다 — **한 필터가 화면에 여섯 번** 나왔다.
 *
 * ⚠️ `×` 는 `<details>` **밖**에 둔다. `<summary>` 안에 링크를 넣으면 누를 때마다
 *   드롭다운이 같이 열린다 — 필터를 푸는 동작인데 메뉴가 펼쳐진다.
 *   그래서 겉을 `.ddbox` 로 한 번 감싸고, 테두리는 그 껍데기가 그린다.
 */
function Dropdown({ label, picked, clearHref, children }: {
  label: string;
  /** 지금 걸린 값들의 **이름**. 비어 있으면 안 걸린 것이다 */
  picked?: string[];
  /** `×` 가 갈 곳 — 이 필터만 푼 주소 */
  clearHref?: string;
  children: React.ReactNode;
}) {
  const n = picked?.length ?? 0;
  const on = n > 0;
  return (
    <span className={on ? "ddbox on" : "ddbox"}>
      <details className="dd">
        <summary title={on ? `${label}: ${picked!.join(", ")}` : undefined}>
          {!on && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          )}
          <span className="dd-k">{label}</span>
          {/* 하나면 값을 그대로 보여준다. 여럿이면 `N종` — 값을 다 늘어놓으면 칩으로 돌아간다 */}
          {on && <span className="dd-v">{n === 1 ? picked![0] : `${n}종`}</span>}
        </summary>
        <div className="dd-menu">{children}</div>
      </details>
      {on && clearHref && (
        <Link className="dd-x" href={clearHref} aria-label={`${label} 필터 해제`}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
      )}
    </span>
  );
}

async function FilteredCount({ where, total }: { where: Prisma.IssueWhereInput; total: number }) {
  const n = await prisma.issue.count({ where });
  return (
    <>
      <b>{n.toLocaleString()}</b>건 <span style={{ opacity: 0.72 }}>/ {total.toLocaleString()}</span>
    </>
  );
}


/**
 * **그 화면에 실제로 뜬 값 중 제일 긴 것에 칸 폭을 맞춘다** (2026-09-12 제보).
 *
 * ★ 예전엔 `width: 152px` 처럼 박아 뒀다. 그래서 `이슈 리스트`(5글자)만 있는 화면에서도
 *   칸은 늘 152px 이었고, **글자 뒤가 반쯤 비어 보였다** — *"여백이 좀 마음에 안드는데"*.
 *
 * ★ CSS 로는 못 한다. 줄이 `flex` 라 칸 폭은 **줄마다** 계산되고, 그러면 줄끼리 안 맞는다
 *   (실제로 그렇게 만들었다가 *"박스 지랄난거"* 를 들었다 — `C-61-1`).
 *   그래서 **서버가 세어서** 한 번 정하고, 모든 줄이 같은 값을 쓴다.
 *
 * ⚠️ 글자 폭은 글꼴마다 다르므로 **재는 게 아니라 어림한다.**
 *   한글·한자·가나는 한 글자가 대략 1em, 라틴 소문자·숫자는 0.55em 쯤이다.
 *   조금 넉넉하게 잡는 편이 낫다 — 모자라면 글자가 잘리지만 남으면 여백일 뿐이다.
 */
const CJK = /[\u1100-\u11FF\u3040-\u30FF\u3130-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uFF00-\uFF60]/;
const textEm = (v: string) =>
  [...v].reduce(
    (n, c) =>
      n + (CJK.test(c) ? 0.94 : c === " " ? 0.28 : /[A-Z0-9]/.test(c) ? 0.6 : 0.5),
    0,
  );

/** 여러 값 중 제일 긴 것(em). 너무 좁아지지 않게 바닥을 둔다. */
const colEm = (vals: (string | null | undefined)[], floor: number) =>
  Math.max(floor, ...vals.map((v) => textEm(v ?? "—"))).toFixed(2);

/** 한 화면에 뜬 이슈들로 칸 폭 세 개를 정한다. `.rows` 를 감싼 곳에 실어 보낸다. */
function colWidths(rows: { platforms: { platform: { code: string } }[];
                           environment: { name: string } }[]) {
  return {
    "--w-plat": colEm(rows.map((r) => r.platforms.map((x) => x.platform.code).join("·")), 2.6),
    "--w-env": colEm(rows.map((r) => r.environment.name), 4),
  } as React.CSSProperties;
}

/**
 * 목록 한 줄.
 *
 * ★★ **컬럼은 전부 그리고 CSS 가 감춘다** (2026-09-16). 각 칸이 `c-{키}` 를 달고,
 *   머리줄의 같은 칸도 같은 클래스를 단다 — 둘이 **함께** 숨는다.
 *   서버는 무엇이 보이는지 모른다 (`src/lib/issue-columns.ts` 참고).
 *
 * ⚠️ 체크박스를 `<Link>` **안**에 넣으면 중첩 인터랙티브가 되어 클릭이 삼켜진다.
 *   밖 형제로 두고 HTML 의 form 속성으로 툴바의 폼(#bulk)에 붙인다 — JS 가 필요 없다.
 */
function Row({ issue, prefix, projectKey }: {
  issue: IssueRow; prefix: string | null; projectKey: string;
}) {
  // 마지막으로 코멘트를 단 사람. 아바타를 셋씩 늘리지 않고 코멘트 수 툴팁에 담는다.
  const lastWriter = issue.comments[0]?.legacyLastAuthor;

  return (
    <div className="row-wrap">
      <input
        type="checkbox" name="seq" value={issue.seq} form="bulk"
        className="row-check c-check" aria-label={`${issue.seq}번 고르기`}
      />
      <Link className="row" href={`/p/${projectKey}/issues/${issue.seq}`}>
        {/* DB 색을 글자로 쓸 때는 테마별로 읽히는 값을 계산해 넘긴다 (C-51) */}
        <span className="pri c-pri" style={themedText(issue.priority.color, 5)}>
          <span className="pdot" style={{ background: issue.priority.color }} />
          {issue.priority.name}
        </span>

        <span className="id c-no">{issueNo(prefix, issue.seq)}</span>

        <span className="pill st c-status" title={`상태: ${issue.status.name}`}>
          <span className="sdot" style={{ background: issue.status.color }} />
          {issue.status.name}
        </span>

        <span
          className={`pill plat c-platform${issue.platforms.length ? "" : " none"}`}
          title={issue.platforms.length
            ? issue.platforms.map((x) => x.platform.name).join(" · ")
            : "플랫폼 미지정"}
        >
          {issue.platforms.length
            ? issue.platforms.map((x) => x.platform.code).join("·")
            : "—"}
        </span>
        <span className="pill env c-env" title={`환경: ${issue.environment.name}`}>
          {issue.environment.name}
        </span>
        <span className="pill sys c-system" title={issue.system.name}>{issue.system.name}</span>
        <span className="pill c-round" title={`차수: ${issue.round?.name ?? "미분류"}`}>
          {issue.round?.name ?? "—"}
        </span>
        <span className="pill c-repro" title={`재현율: ${issue.reproRate ? REPRO_RATE_LABEL[issue.reproRate] : "미기록"}`}>
          {issue.reproRate ? REPRO_RATE_LABEL[issue.reproRate] : "—"}
        </span>

        <span className="title c-title">{issue.title}</span>

        <span className="cell c-screen" title={issue.legacyScreenName ?? "화면명 없음"}>
          {issue.legacyScreenName ?? "—"}
        </span>
        <span className="cell c-ver" title={`검출 ${issue.foundVersion ?? "—"} · 반영 ${issue.fixedVersion ?? "—"}`}>
          {issue.foundVersion ?? "—"}{issue.fixedVersion ? ` → ${issue.fixedVersion}` : ""}
        </span>
        <span className="cell c-qai" title={issue.externalRef ?? "QAI # 없음"}>
          {issue.externalRef ?? "—"}
        </span>

        <span className="who c-reporter" title={`작성자: ${issue.reporter.name}`}>
          <Avatar name={issue.reporter.name} color={issue.reporter.team?.color} size={19} />
        </span>
        <span className="who c-assignee" title={issue.assignee ? `담당자: ${issue.assignee.name}` : "담당자 미지정"}>
          <Avatar name={issue.assignee?.name} color={issue.assignee?.team?.color} size={19} />
        </span>

        <span className="date c-created" title={`등록 ${formatDateTime(issue.createdAt)}`}>
          {formatStamp(issue.createdAt)}
        </span>
        <span className="date c-updated" title={`수정 ${formatDateTime(issue.updatedAt)}`}>
          {formatStamp(issue.updatedAt)}
        </span>
        <span className="date c-reported" title={`발생 ${formatDateTime(issue.reportedAt)}`}>
          {formatStamp(issue.reportedAt)}
        </span>
        {/* ★ 첨부·코멘트는 **한 규격**이다. 0건이어도 자리를 지켜 아바타 세로줄이 안 흔들린다 */}
        <span className="rmark c-att" title={
          issue._count.attachments === 0 ? "첨부 없음" : `첨부 ${issue._count.attachments}건`
        }>
          {issue._count.attachments > 0 && (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.4 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              {issue._count.attachments}
            </>
          )}
        </span>
        <span className="rmark c-cmt" title={
          issue._count.comments === 0
            ? "코멘트 없음"
            : lastWriter
              ? `코멘트 ${issue._count.comments}건 · 마지막 ${lastWriter.name}`
              : `코멘트 ${issue._count.comments}건`
        }>
          {issue._count.comments > 0 && (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.8-.9L3 20.5l1.5-4.2A8.4 8.4 0 0 1 3.6 12a8.4 8.4 0 0 1 8.4-8.4h.5A8.4 8.4 0 0 1 21 11.5z" />
              </svg>
              {issue._count.comments}
            </>
          )}
        </span>

      </Link>
    </div>
  );
}

/** 머리줄. 정렬되는 칸은 눌러서 차례를 뒤집는다. */
function HeadRow({ url, sort, dir }: {
  url: (patch: Record<string, string | number | string[] | undefined>) => string;
  sort: string; dir: "asc" | "desc";
}) {
  return (
    /**
     * ★★ **줄(`.row-wrap`)과 **같은 뼈대**여야 한다** (2026-09-16 제보 —
     *   *"구분 색이 checkbox 부분까지 덮어서 이상하게 떨어져있다"*).
     *
     *   예전엔 `margin-left` 로 체크박스만큼 밀어냈다. 그래서 왼쪽에 흰 홈이 파여
     *   머리줄이 목록과 따로 놀았다. 이제 바깥 여백 → **체크박스 자리(빈 칸)** →
     *   안쪽 상자 순서로, 줄과 한 글자도 다르지 않게 맞춘다.
     */
    <div className="row-head">
      <span className="c-check" aria-hidden="true" />
      <div className="hc-in">
        {COLUMNS.filter((c) => c.key !== "check").map((c) => {
          const cls = `hc c-${c.key}`;
          /**
           * ★ **모든 칸에 손잡이가 붙는다 — 제목도** (2026-09-16 제보 —
           *   *"이슈 타이틀의 가장 우측 구분선은 넓이 조절이 안 된다"*).
           *   선을 그어 놓고 안 움직이면 고장으로 읽힌다.
           *   제목은 남는 폭을 먹는 칸이지만, 끌면 `--cw-title` 이 `max-width` 로
           *   상한을 걸어 거기서 멈춘다 (`globals.css` 의 `.c-title`).
           */
          const grip = <ColumnGrip col={c.key} />;
          // ⚠️ 라벨은 **반드시 `.hl` 안**에 있어야 한다. 말줄임(`overflow:hidden`)이
          //   칸 자체에 걸리면 칸 밖으로 걸친 손잡이가 잘려 **눌리지도 않는다**
          //   (2026-09-16 에 실제로 그래서 드래그가 통째로 안 먹었다).
          if (!c.sort) {
            return (
              <span key={c.key} className={cls}>
                <span className="hl">{c.label}</span>
                {grip}
              </span>
            );
          }
          const on = sort === c.sort;
          // 같은 칸을 다시 누르면 차례가 뒤집힌다
          const next = on && dir === "desc" ? "asc" : "desc";
          return (
            <Link
              key={c.key}
              className={`${cls} sortable${on ? " on" : ""}`}
              href={url({ sort: c.sort === "seq" ? undefined : c.sort, dir: next === "desc" ? undefined : next, page: 1 })}
            >
              <span className="hl">{c.label}</span>
              <span className="sarrow">{on ? (dir === "asc" ? "▲" : "▼") : ""}</span>
              {grip}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

async function FlatList({
  where,
  page,
  url,
  prefix,
  projectKey,
  perPage,
  sort,
  dir,
}: {
  projectKey: string;
  /** 한 쪽에 몇 건 (`?per=`) */
  perPage: number;
  where: Prisma.IssueWhereInput;
  page: number;
  url: (patch: Record<string, string | number | string[] | undefined>) => string;
  prefix: string | null;
  sort: string;
  dir: "asc" | "desc";
}) {
  const [total, issues] = await Promise.all([
    prisma.issue.count({ where }),
    prisma.issue.findMany({
      where,
      // ★ 같은 값이 여럿이면 차례가 흔들린다 — 번호를 **두 번째 기준**으로 고정한다.
      //   (수정일이 같은 두 건이 쪽을 넘길 때마다 자리를 바꾸면 훑기가 안 된다)
      orderBy: sort === "seq"
        ? [SORTS.seq(dir)]
        : [SORTS[sort](dir), { seq: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: ROW_INCLUDE,
    }),
  ]);

  if (total === 0) {
    return (
      <div className="empty">
        <h3>조건에 맞는 이슈가 없습니다</h3>
        <Link href={`/p/${projectKey}/issues`} style={{ color: "var(--accent)" }}>필터 모두 지우기</Link>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="rows-scope" style={colWidths(issues)}>
      <HeadRow url={url} sort={sort} dir={dir} />
      <div className="rows">
        {issues.map((it) => (
          <Row key={it.id} issue={it} prefix={prefix} projectKey={projectKey} />
        ))}
      </div>
      {/* ★ 쪽 정보. 예전에는 페이지 번호만 있어서 **지금 몇 건 중 몇 번째를 보는지**
          알 수가 없었다. 1,818건에서 3쪽이면 101–150 번째다. */}
      <div className="pageinfo">
        <span className="pi-range">
          {total === 0 ? "0건" : (
            <>
              <b>{((page - 1) * perPage + 1).toLocaleString()}</b>–
              <b>{Math.min(page * perPage, total).toLocaleString()}</b>
              {" / "}{total.toLocaleString()}건
              {totalPages > 1 && <span className="pi-pg">{page} / {totalPages}쪽</span>}
            </>
          )}
        </span>
        <span className="pi-per">
          쪽당
          {PAGE_SIZES.map((n) => (
            <Link
              key={n}
              href={url({ per: n === PAGE_SIZE ? undefined : String(n), page: 1 })}
              className={n === perPage ? "on" : undefined}
            >
              {n}
            </Link>
          ))}
        </span>
      </div>

      {totalPages > 1 && (
        <nav className="pager">
          {page > 1 && <Link href={url({ page: page - 1 })}>‹</Link>}
          {pageNumbers(page, totalPages).map((n, i) =>
            n === null ? (
              <span key={`g${i}`} className="gap">…</span>
            ) : n === page ? (
              <span key={n} className="current">{n}</span>
            ) : (
              <Link key={n} href={url({ page: n })}>{n}</Link>
            )
          )}
          {page < totalPages && <Link href={url({ page: page + 1 })}>›</Link>}
        </nav>
      )}
    </div>
  );
}

function pageNumbers(current: number, total: number): (number | null)[] {
  const set = new Set<number>([1, total]);
  for (let i = current - 2; i <= current + 2; i++) if (i >= 1 && i <= total) set.add(i);
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push(null);
    out.push(n);
    prev = n;
  }
  return out;
}
