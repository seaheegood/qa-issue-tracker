import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * 새 프로젝트 만들기 (P-1 · P-2).
 *
 * ★ **"공통은 템플릿, 차이는 설정"** (P-2). 새 프로젝트를 5분 안에 세팅하는 게 목표다.
 *   그래서 마스터를 빈 채로 두지 않고 **본보기 프로젝트에서 복제**한다.
 *   상태·전이가 비어 있으면 이슈를 **하나도 못 올린다** — 초기 상태가 없어서다.
 *
 * ★ 복제하는 것: 상태 · 전이 규칙(+Reason) · 우선순위 · 환경 · 플랫폼
 *   복제하지 **않는** 것:
 *     - **시스템** — 프로젝트마다 완전히 다르다. 첫 프로젝트의 `SV/SL/DI/AD` 를
 *       다른 프로젝트에 넣으면 그냥 쓰레기가 된다
 *     - **차수** — 회차는 그 프로젝트의 일정이다. 1차 하나만 비워 둔다
 *     - **템플릿** — 재현 경로가 시스템에 딸려 있어 시스템 없이는 의미가 없다
 *     - 이슈·코멘트·첨부·구독·알림 — 당연히
 *
 * ★ **멤버는 만들지 않는다** (2026-09-11). 예전엔 만든 사람을 `LEAD` 로 넣었는데,
 *   그게 **그 프로젝트에서 고를 수 있는 유일한 사람**이었다 — 멤버를 추가할 화면이
 *   없어서 담당자 지정이 사실상 막혔다. 이제 사람은 프로젝트에 속하지 않는다.
 *   활성 사용자 전원을 고를 수 있다 (`src/lib/people.ts`).
 *
 * ★ 전부 한 트랜잭션이다. 상태만 서고 전이가 안 서면 **드롭다운이 텅 빈 프로젝트**가
 *   남는데, 그건 만들다 만 것보다 나쁘다 — 만들어진 것처럼 보이기 때문이다.
 */
export type CreateProjectInput = {
  key: string;
  name: string;
  issuePrefix: string | null;
  /** 마스터를 복제해 올 본보기 프로젝트 id */
  copyFromId: number;
};

export const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;
export const PREFIX_RE = /^[A-Z][A-Z0-9]{0,9}$/;

export async function createProject(input: CreateProjectInput) {
  const { key, name, issuePrefix, copyFromId } = input;

  const src = await prisma.project.findUnique({
    where: { id: copyFromId },
    include: {
      // ★ 켜진 것만 복제한다. 안 쓰기로 한 것을 새 프로젝트에까지 물려주면
      //   똑같은 혼란이 프로젝트 수만큼 늘어난다 (상태는 9종 — docs/11 D-70 정정 2026-08-30).
      statuses: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
      // ★ 이 셋도 켜진 것만 (A-81). 설정 화면이 생기기 전에는 끌 방법이 없어서
      //   `where` 가 없어도 결과가 같았지만, 이제는 끈 것이 새 프로젝트에 켜져서
      //   나타난다 — "SP 에서 껐는데 왜 여기 있지" 가 된다.
      priorities: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
      environments: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
      platforms: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
      transitions: { include: { from: true, to: true } },
    },
  });
  if (!src) return { error: "복제할 프로젝트를 찾을 수 없습니다." };

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: { key, name, issuePrefix, issueSeq: 0 },
      select: { id: true, key: true },
    });

    // ── 상태. id 가 바뀌므로 code → 새 id 표를 들고 다닌다 (전이가 이걸 쓴다)
    const statusId = new Map<string, number>();
    for (const s of src.statuses) {
      const made = await tx.issueStatus.create({
        data: {
          projectId: project.id, code: s.code, name: s.name, color: s.color,
          category: s.category, sortOrder: s.sortOrder,
          isInitial: s.isInitial, isTerminal: s.isTerminal, isActive: s.isActive,
        },
        select: { id: true },
      });
      statusId.set(s.code, made.id);
    }

    // ── 전이 규칙 + Reason. **여기까지 와야 이슈 상태를 바꿀 수 있다**
    for (const t of src.transitions) {
      const from = statusId.get(t.from.code);
      const to = statusId.get(t.to.code);
      if (!from || !to) continue;
      await tx.statusTransition.create({
        data: {
          projectId: project.id, fromStatusId: from, toStatusId: to,
          isActive: t.isActive, requireNote: t.requireNote,
          noteLabel: t.noteLabel, noteHint: t.noteHint,
        },
      });
    }

    const copyMany = async <T extends { code: string; name: string; sortOrder: number }>(
      rows: T[],
      make: (r: T) => Prisma.PrismaPromise<unknown>,
    ) => { for (const r of rows) await make(r); };

    await copyMany(src.priorities, (p) =>
      tx.priority.create({ data: {
        projectId: project.id, code: p.code, name: p.name,
        color: (p as { color: string }).color, sortOrder: p.sortOrder,
      } }));
    await copyMany(src.environments, (e) =>
      tx.environment.create({ data: {
        projectId: project.id, code: e.code, name: e.name, sortOrder: e.sortOrder,
      } }));
    await copyMany(src.platforms, (pf) =>
      tx.platform.create({ data: {
        projectId: project.id, code: pf.code, name: pf.name,
        sortOrder: pf.sortOrder, isActive: (pf as { isActive: boolean }).isActive,
      } }));

    // ── 차수는 복제하지 않는다. 대신 **1차 하나**를 비워서 만든다.
    //   차수는 필수값(N-01)이라 하나도 없으면 이슈를 못 올린다.
    await tx.round.create({
      data: { projectId: project.id, code: "R1", name: "1차", sortOrder: 10 },
    });

    return { project };
  });
}
