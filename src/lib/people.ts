import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * **고를 수 있는 사람 = 우리 DB 의 활성 사용자 전원** (2026-09-11).
 *
 * ── 왜 이 파일이 생겼나 ─────────────────────────────────────
 * 예전엔 화면 7곳이 저마다 `projectMember.findMany()` 를 했다. 그래서
 * **프로젝트에 등록된 사람만** 담당자·멘션·기능 담당자로 고를 수 있었고,
 * 새 프로젝트를 만들면 멤버가 만든 사람 1명뿐이라 **사실상 아무도 못 골랐다.**
 * 멤버를 추가할 화면조차 없어서 DB 를 직접 건드려야 했다.
 *
 * 사용자 판단: *"프로젝트별로 사람을 나누지 않고 어차피 회사 내에서 쓰는 거니까
 * 우리 DB 에 들어간 사람은 다 확인 가능하게."* → `project_members` 를 없앴다.
 *
 * ★ **한 곳에서만 만든다.** 목록 필터·담당자·멘션·기능 담당자가 같은 목록을 쓴다.
 *   복제하면 *"멘션은 되는데 담당자로는 안 뜨는 사람"* 이 생긴다 —
 *   `issue-filter.ts` 의 `buildWhere()` 를 한 곳에 둔 것과 같은 이유다.
 *
 * ★ **비활성 계정은 뺀다.** 퇴사자·이관용 계정(`_migration`)·봇이 여기 해당한다.
 *   과거 기록에는 그대로 남는다 — 앞으로 **새로 고를 수 없을** 뿐이다
 *   (차수·플랫폼의 `isActive` 와 같은 규칙).
 *
 * ★ **팀 순서로 준다.** 16명이 한 줄로 늘어서면 찾기 어렵다.
 *   화면은 이 순서 그대로 팀별로 묶어 보여준다.
 */
export type Person = {
  id: number;
  loginId: string;
  name: string;
  team: { name: string; color: string; sortOrder: number } | null;
};

export async function people(): Promise<Person[]> {
  const rows = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      loginId: true,
      name: true,
      team: { select: { name: true, color: true, sortOrder: true } },
    },
    orderBy: { name: "asc" },
  });
  // ⚠️ 정렬을 DB 에 맡기지 않는다. 팀이 NULL 인 사람을 MySQL 은 **맨 앞**에 두는데,
  //   팀 없는 사람은 뒤로 가야 한다. 16명짜리 목록이라 여기서 세우는 편이 싸고 분명하다.
  return rows.sort(
    (a, b) =>
      (a.team?.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.team?.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name, "ko"),
  );
}

// 팀으로 묶는 일은 `lib/ui` 의 `byTeam()` 이 한다 —
// **클라이언트 컴포넌트도 같은 함수를 써야** 화면마다 순서가 갈라지지 않는다.
