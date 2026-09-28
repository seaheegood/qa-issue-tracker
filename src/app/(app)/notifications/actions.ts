"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * 알림 읽음 처리.
 *
 * ★ **폼 버튼이지 링크가 아니다.**
 *   `<a>` 로 두고 이슈 화면에서 읽음 처리하면 **GET 이 데이터를 바꾸는** 모양이 된다.
 *   새로고침·프리페치·크롤러가 전부 읽음 처리를 일으킨다.
 *   대신 새 탭으로 여는 건 안 된다 — 알림은 한 번 보고 지나가는 것이라 감수한다.
 */
export async function openNotification(fd: FormData) {
  const user = await requireUser();
  const id = Number(fd.get("id"));
  const n = await prisma.notification.findUnique({
    where: { id },
    include: { issue: { select: { seq: true, project: { select: { key: true } } } } },
  });
  // 남의 알림은 못 연다. id 를 바꿔 넣어도 여기서 막힌다.
  if (!n || n.userId !== user.id) redirect("/notifications");

  if (!n.readAt) {
    await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }
  revalidatePath("/notifications");
  // ★ 일괄 편집 알림은 이슈 하나가 아니라 **그 N건의 목록**을 가리킨다.
  //   href 는 우리가 만든 값이라 열린 리다이렉트 걱정이 없지만, 그래도 앱 안 경로만 허용한다.
  const to = n.href && n.href.startsWith("/") && !n.href.startsWith("//")
    ? n.href
    : `/p/${n.issue.project.key}/issues/${n.issue.seq}`;
  redirect(to);
}

/** 전부 읽음. 배지를 0으로 만드는 유일한 방법이 하나하나 누르는 것이면 아무도 안 쓴다. */
export async function readAllNotifications() {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

/**
 * 구독 켜고 끄기 (요구사항서 05).
 *
 * ★ 끌 때 **행을 지우지 않는다.** `muted = true` 로 남긴다.
 *   지우면 다음 코멘트에서 자동 규칙이 다시 붙여서 **해제 버튼이 거짓말**이 된다.
 *   요구서가 못박은 지점이다 — *"해제가 쉬워야 합니다. 안 그러면 알림이 소음이 됩니다."*
 */
export async function toggleWatch(fd: FormData) {
  const user = await requireUser();
  const seq = Number(fd.get("seq"));
  // ★ `seq` 는 **프로젝트별**이다. 프로젝트를 안 보고 findFirst 하면
  //   다른 프로젝트의 같은 번호를 건드린다.
  const key = String(fd.get("projectKey") ?? "").toUpperCase();
  const issue = key
    ? await prisma.issue.findFirst({
        where: { seq, project: { key } }, select: { id: true, project: { select: { key: true } } },
      })
    : null;
  if (!issue) return;

  const cur = await prisma.issueWatcher.findUnique({
    where: { issueId_userId: { issueId: issue.id, userId: user.id } },
  });
  await prisma.issueWatcher.upsert({
    where: { issueId_userId: { issueId: issue.id, userId: user.id } },
    create: { issueId: issue.id, userId: user.id },
    update: { muted: !cur?.muted },
  });
  revalidatePath(`/p/${issue.project.key}/issues/${seq}`);
}
