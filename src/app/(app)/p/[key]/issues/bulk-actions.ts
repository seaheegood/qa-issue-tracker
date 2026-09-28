"use server";


import { requireUser } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { notifyBulkOps, recipients, watchOps } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { revalidateIssue } from "@/lib/revalidate";
import { notDeleted } from "@/lib/issue-filter";


/**
 * 폼이 실어 보낸 프로젝트.
 *
 * ★ 서버 액션은 라우트의 `[key]` 를 못 본다. 폼마다 `projectKey` 를 숨겨 보낸다.
 * ★ **기본값을 두지 않는다.** `"SP"` 로 기본값을 두면 폼 하나를 빠뜨렸을 때
 *   **엉뚱한 프로젝트에 이슈가 생기고, 그건 아무도 못 알아챈다.**
 */
async function projectOf(fd: FormData) {
  const key = String(fd.get("projectKey") ?? "").toUpperCase();
  if (!key) return null;
  return prisma.project.findUnique({ where: { key } });
}

/** 한 번에 바꿀 수 있는 최대 건수 = 한 페이지. 실수로 1,704건을 바꾸는 사고를 막는다. */
const MAX = 50;

export type BulkState = { error?: string; done?: string };

/**
 * 여러 건 한꺼번에 바꾸기 (요구사항서 09 · 주말 7번).
 *
 * ★ **상태는 여기 없다** (`docs/05` §16.6, 2026-08-23 재확인).
 *   담당자·차수·우선순위·플랫폼 넷은 전이 규칙도 Reason 도 반영 버전도 안 걸려서
 *   10건이든 100건이든 똑같이 동작한다. 상태를 넣는 순간 고른 것들이 서로 다른
 *   상태라 "8건은 되고 4건은 막힘" 이 필연이 되고, 전이마다 다른 Reason 을 받아야 한다.
 *   **상태는 한 건씩 바꿔야 할 이유가 있어서 그렇게 만든 것이다.**
 *
 * ★ 일괄이라고 이력을 아끼지 않는다. 이슈마다 한 줄씩 남긴다 —
 *   "누가 언제 무엇을" 이 이 프로젝트의 근간이다 (P6).
 *
 * ★ 안 바뀌는 건 건너뛴다. 이미 그 담당자면 이력도 알림도 안 남긴다 (`setField` 와 같은 규칙).
 */
export async function bulkEdit(_p: BulkState, fd: FormData): Promise<BulkState> {
  const user = await requireUser();
  const project = await projectOf(fd);
  if (!project) return { error: "프로젝트를 찾을 수 없습니다." };

  const seqs = [...new Set(
    fd.getAll("seq").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0),
  )];
  if (seqs.length === 0) return { error: "먼저 이슈를 고르세요." };
  if (seqs.length > MAX) return { error: `한 번에 ${MAX}건까지 바꿀 수 있습니다.` };

  const field = String(fd.get("field") ?? "");
  const raw = String(fd.get("value") ?? "");

  // ★ 넘어온 번호를 그대로 믿지 않는다. 이 프로젝트의 이슈로 한 번 더 좁힌다.
  //   화면에 없던 번호를 끼워 넣어도 여기서 걸러진다.
  const issues = await prisma.issue.findMany({
    // ⚠️ 숨긴 이슈는 일괄 편집에서도 빠진다 — 화면에 안 보이는 것을 고치면 안 된다
    where: { projectId: project.id, seq: { in: seqs }, ...notDeleted },
    select: {
      id: true, seq: true, assigneeId: true, roundId: true, priorityId: true,
      platforms: { select: { platform: { select: { code: true } } } },
    },
  });
  if (issues.length === 0) return { error: "고른 이슈를 찾을 수 없습니다." };

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const changed: { id: number; seq: number }[] = [];
  let label = "";
  let kind: "ASSIGNED" | "STATUS" = "STATUS";
  let extra: number[] = [];

  if (field === "platform") {
    // 플랫폼만 여러 값이다. 고른 것으로 **통째로 갈아끼운다** — 더하기가 아니다.
    const codes = [...new Set(fd.getAll("platform").map(String).filter(Boolean))];
    if (codes.length === 0) return { error: "플랫폼을 하나 이상 고르세요." };
    const master = await prisma.platform.findMany({
      where: { projectId: project.id, code: { in: codes }, isActive: true },
    });
    if (master.length !== codes.length) return { error: "플랫폼을 확인하세요." };
    const names = master.map((m) => m.name).join(" · ");
    label = `플랫폼 ${names}`;

    for (const i of issues) {
      const before = i.platforms.map((x) => x.platform.code).sort().join(",");
      if (before === [...codes].sort().join(",")) continue;   // 안 바뀌면 건너뛴다
      changed.push({ id: i.id, seq: i.seq });
      ops.push(
        prisma.issuePlatform.deleteMany({ where: { issueId: i.id } }),
        prisma.issuePlatform.createMany({
          data: master.map((m) => ({ issueId: i.id, platformId: m.id })),
        }),
        prisma.issueHistory.create({
          data: {
            issueId: i.id, field: "platform",
            oldValue: i.platforms.map((x) => x.platform.code).join(" · ") || null,
            newValue: names, changedById: user.id, changedByRole: user.role,
          },
        }),
      );
    }
  } else {
    // 담당자·차수·우선순위 — 한 컬럼짜리. setField 와 같은 표를 쓴다.
    const specs = {
      assignee: { column: "assigneeId", cur: (i: (typeof issues)[number]) => i.assigneeId, nullable: true },
      round:    { column: "roundId",    cur: (i: (typeof issues)[number]) => i.roundId,    nullable: true },
      priority: { column: "priorityId", cur: (i: (typeof issues)[number]) => i.priorityId, nullable: false },
    } as const;
    const spec = specs[field as keyof typeof specs];
    if (!spec) return { error: "바꿀 항목을 고르세요." };

    // ★ 빈 문자열은 "아직 안 골랐다" 이고, `__none` 이 "일부러 비운다" 이다.
    //   둘을 같은 값으로 두면 아무것도 안 고르고 누른 사람이 12건을 통째로 비운다.
    if (raw === "") return { error: "바꿀 값을 고르세요." };
    const id = raw === "__none" ? null : Number(raw);
    if (id === null && !spec.nullable) return { error: "이 항목은 비울 수 없습니다." };
    if (id !== null && !Number.isInteger(id)) return { error: "값을 확인하세요." };

    // 표시용 이름. 이력에는 id 가 아니라 이름을 남긴다 (마스터가 바뀌어도 읽히게).
    let name: string | null = "미지정";
    if (id !== null) {
      if (field === "assignee") {
        // ★ **활성 계정만** 담당자가 된다 (2026-09-11 — 멤버 폐지).
        //   예전엔 멤버인지로 걸렀는데 그 표가 없어졌다. 퇴사자·봇 계정이
        //   폼으로 들어오는 것을 여기서 막는다.
        name = (await prisma.user.findFirst({ where: { id, isActive: true } }))?.name ?? null;
        kind = "ASSIGNED";
        extra = [id];
      } else if (field === "round") {
        name = (await prisma.round.findUnique({ where: { id } }))?.name ?? null;
      } else {
        name = (await prisma.priority.findUnique({ where: { id } }))?.name ?? null;
      }
      if (!name) return { error: "고른 값을 찾을 수 없습니다." };
    } else if (field === "round") {
      name = "미분류";
    }
    const FIELD_LABEL: Record<string, string> = {
      assignee: "담당자", round: "차수", priority: "우선순위",
    };
    label = `${FIELD_LABEL[field]} ${name}`;

    for (const i of issues) {
      if (spec.cur(i) === id) continue;                      // 안 바뀌면 건너뛴다
      changed.push({ id: i.id, seq: i.seq });
      ops.push(
        prisma.issue.update({ where: { id: i.id }, data: { [spec.column]: id } }),
        prisma.issueHistory.create({
          data: {
            issueId: i.id, field,
            oldValue: null,          // 일괄에서는 '무엇이 되었나' 만 남긴다
            newValue: name,
            changedById: user.id, changedByRole: user.role,
          },
        }),
      );
      // 담당이 된 사람은 그 이슈를 지켜보게 된다 (5번과 같은 규칙)
      if (field === "assignee" && id !== null) ops.push(...watchOps(i.id, [id]));
    }
  }

  if (changed.length === 0) {
    return { done: "이미 그 값이라 바뀐 게 없습니다." };
  }

  // ── ★ 알림은 **받는 사람마다 한 통**으로 묶는다.
  //   건마다 보내면 벨에 같은 말이 12줄로 쌓이고, 그때부터 아무도 안 읽는다.
  const to = [...new Set(
    (await Promise.all(changed.map((c) => recipients(c.id, user.id, extra)))).flat(),
  )];
  ops.push(
    ...notifyBulkOps({
      issueId: changed[0].id,
      actorId: user.id,
      kind,
      title: `${label} — ${changed.length}건 일괄 변경`,
      seqs: changed.map((c) => c.seq),
      projectKey: project.key,
      to,
    }),
  );

  // 절반만 바뀌는 상태를 만들지 않는다.
  await prisma.$transaction(ops);

  revalidateIssue(project.key);
  for (const c of changed) revalidateIssue(project.key, c.seq);
  const skipped = issues.length - changed.length;
  return {
    done: `${changed.length}건을 바꿨습니다.` + (skipped > 0 ? ` (${skipped}건은 이미 같은 값)` : ""),
  };
}
