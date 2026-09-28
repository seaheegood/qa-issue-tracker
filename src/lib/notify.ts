import type { NotificationKind, Prisma } from "@prisma/client";

import { scanMentions } from "@/lib/mention";
import { prisma } from "@/lib/prisma";

/**
 * 와쳐와 알림 (요구사항서 05·07 · docs/13 D-10·D-11).
 *
 * ★ **메일은 만들지 않는다.** 서버가 개인 맥이라 꺼져 있는 동안의 알림이 사라진다.
 *   반쪽 알림은 한 번 놓치면 아무도 다시 믿지 않는다.
 *   대신 **수신자 계산을 여기서 전부 끝낸다** — 사내 서버에 올라가면 발송만 붙이면 된다.
 *
 * ★ **op 배열을 돌려주는 모양**인 이유.
 *   이슈 액션들이 이미 `$transaction([...])` 배열이다. 알림을 별도 쿼리로 쏘면
 *   *"상태는 바뀌었는데 알림은 안 갔다"* 가 생긴다. 같은 트랜잭션에 끼운다.
 *
 * ★ **행위자 제외는 여기 한 곳에서** 한다.
 *   액션마다 빼면 반드시 하나를 빠뜨리고, 그러면 자기가 바꾼 걸 자기가 알림으로 받는다.
 */

/** 이 이슈의 알림을 받을 사람. 행위자는 빠진다. */
export async function recipients(
  issueId: number,
  actorId: number,
  extra: number[] = [],
): Promise<number[]> {
  const rows = await prisma.issueWatcher.findMany({
    // ★ muted 는 "내가 직접 껐다" 는 뜻이다. 여기서 빼지 않으면 해제가 무의미해진다.
    where: { issueId, muted: false },
    select: { userId: true },
  });
  const ids = new Set([...rows.map((r) => r.userId), ...extra]);
  ids.delete(actorId);
  return [...ids];
}

/**
 * 자동 구독 op.
 *
 * ★ `update: {}` 가 이 함수의 전부다.
 *   이미 행이 있으면 **아무것도 건드리지 않는다.** muted=true 인 사람을 자동으로
 *   되살리면 해제 버튼이 거짓말이 된다 (`docs/13` 미결 4).
 */
export function watchOps(issueId: number, userIds: (number | null | undefined)[]) {
  const ids = [...new Set(userIds.filter((v): v is number => typeof v === "number"))];
  return ids.map((userId) =>
    prisma.issueWatcher.upsert({
      where: { issueId_userId: { issueId, userId } },
      create: { issueId, userId },
      update: {},
    }),
  );
}

/** 알림 생성 op. 수신자가 없으면 빈 배열이라 트랜잭션에 그냥 펼쳐 넣으면 된다. */
export function notifyOps(args: {
  issueId: number;
  actorId: number;
  kind: NotificationKind;
  /** ★ 완성된 한 줄. 나중에 이름이 바뀌어도 그때 본 그대로 남는다 */
  title: string;
  to: number[];
}): Prisma.PrismaPromise<unknown>[] {
  const { issueId, actorId, kind, title, to } = args;
  return to.map((userId) =>
    prisma.notification.create({
      data: { userId, actorId, issueId, kind, title: title.slice(0, 255) },
    }),
  );
}

/**
 * 코멘트 본문에서 불린 이름을 찾는다.
 *
 * ★ `@아이디` 가 아니라 `@이름` 이다. 서로 이름으로 부르는 팀이고,
 *   읽는 사람이 코멘트를 **그대로 읽을 수 있어야** 한다.
 *
 * ★ **규칙은 `lib/mention.ts` 한 곳에 있다** (2026-09-11). 긴 이름 우선 · `@` 앞은
 *   줄 처음·공백·`(` 만. 예전엔 여기서 `includes` 로 따로 판단해서
 *   **본문 강조·입력 팝업과 규칙이 갈라져 있었다.**
 * ★ 동명이인이면 **전원**에게 간다. 지금 13명 중 이름 중복은 0건이지만,
 *   사람이 늘면 생긴다. 한 명을 찍어서 틀리는 것보다 둘 다 받는 편이 낫다.
 */
export function findMentions(
  body: string,
  people: { id: number; name: string }[],
): number[] {
  // ★ 찾는 일 자체는 `lib/mention` 이 한다 — **본문 강조와 같은 함수**여야
  //   화면에 파랗게 칠해진 것과 알림이 간 사람이 어긋나지 않는다.
  const byName = new Map<string, number[]>();
  for (const p of people) {
    if (!p.name) continue;
    byName.set(p.name, [...(byName.get(p.name) ?? []), p.id]);
  }
  const hit = new Set<number>();
  for (const m of scanMentions(body, [...byName.keys()])) {
    // 동명이인이면 **전원**에게 간다. 한 명을 찍어서 틀리는 것보다 낫다.
    for (const id of byName.get(m.name) ?? []) hit.add(id);
  }
  return [...hit];
}

/**
 * 여러 건을 한꺼번에 바꿨을 때의 알림 — **받는 사람마다 한 통**.
 *
 * ★ 12건을 바꿨다고 12통을 보내면, 알림을 5종으로 좁혀 막아둔 소음이 여기서 그대로 터진다.
 *   벨을 열었을 때 같은 말이 12줄이면 그때부터 아무도 안 읽는다.
 *
 * ★ 대신 **놓치지는 않게** 한다. 한 통을 누르면 `?seq=…` 로 **정확히 그 N건**이 뜬다.
 *   담당자 코드 같은 걸로 링크하면 그 사람의 전부가 나와서 방금 바뀐 12건이 묻힌다.
 */
export function notifyBulkOps(args: {
  /** 대표 이슈 — 목록으로 보내지만 FK 는 있어야 한다 */
  issueId: number;
  actorId: number;
  kind: NotificationKind;
  title: string;
  /** 방금 바뀐 번호들 */
  seqs: number[];
  /** ★ 알림 링크에도 프로젝트가 들어가야 한다. 없으면 다른 프로젝트의 그 번호로 간다 */
  projectKey: string;
  to: number[];
}): Prisma.PrismaPromise<unknown>[] {
  const { issueId, actorId, kind, title, seqs, to, projectKey } = args;
  /**
   * ⚠️ **번호 CSV 는 자르면 안 된다** (2026-09-16 정정).
   *   예전엔 통째로 `.slice(0, 500)` 이었다. 마지막 번호가 반토막 나면
   *   (`…,1234` → `…,12`) **엉뚱한 이슈를 가리키는 링크**가 된다.
   *   길면 뒤를 버리되 **번호 단위로** 버린다.
   */
  const base = `/p/${projectKey}/issues?seq=`;
  const fit: number[] = [];
  for (const n of seqs) {
    if (base.length + [...fit, n].join(",").length > 500) break;
    fit.push(n);
  }
  const href = `${base}${fit.join(",")}`;
  return to.map((userId) =>
    prisma.notification.create({
      data: { userId, actorId, issueId, kind, title: title.slice(0, 255), href },
    }),
  );
}

/** 알림 한 줄에 붙는 아이콘 겸 분류 이름. 화면 세 곳(벨·목록·본문)이 같이 쓴다. */
export const KIND_LABEL: Record<NotificationKind, string> = {
  STATUS: "상태 변경",
  CLOSED: "종결",
  COMMENT: "코멘트",
  ASSIGNED: "담당 배정",
  MENTION: "멘션",
};
