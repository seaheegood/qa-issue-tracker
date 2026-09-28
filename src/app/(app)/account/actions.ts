"use server";

import { redirect } from "next/navigation";

import { endOtherSessions, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { envOn, appEnv } from "@/lib/db-url";
import { passwordProblem } from "@/lib/password-rule";
import { prisma } from "@/lib/prisma";

export type PasswordState = { error?: string };

/**
 * 내 비밀번호 바꾸기 (`docs/11` `L-10`~`L-19`).
 *
 * ★ **현재 비밀번호를 다시 받는다.** 로그인한 채 자리를 비운 사이에 옆 사람이
 *   비밀번호를 바꿔 계정을 가져가는 걸 막는다. 세션만 믿으면 안 되는 몇 안 되는 자리다.
 * ★ 성공하면 **다른 기기의 로그인을 전부 끊고** 지금 화면만 남긴다 (`endOtherSessions`).
 * ★ 성공은 `?changed=1` 로 **주소를 바꿔서** 알린다. 상태값으로만 알리면 새로고침할 때
 *   폼이 다시 제출되고, JS 없이 제출한 경우엔 알릴 길이 없다.
 */
export async function changePassword(_prev: PasswordState, fd: FormData): Promise<PasswordState> {
  const me = await requireUser("/account");

  // ⚠️ 공개 데모는 모두가 같은 계정(`demo`)을 쓴다. 한 명이 바꾸면 **나머지가 전부 잠긴다**
  if (envOn(appEnv("DEMO"))) {
    return { error: "체험용 데모에서는 비밀번호를 바꿀 수 없습니다." };
  }

  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  const confirm = String(fd.get("confirm") ?? "");

  if (!current || !next || !confirm) return { error: "세 칸을 모두 입력하세요." };
  if (next !== confirm) return { error: "새 비밀번호 두 칸이 서로 다릅니다." };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  if (next === current) return { error: "지금과 다른 비밀번호를 입력하세요." };

  const row = await prisma.user.findUnique({ where: { id: me.id }, select: { passwordHash: true } });
  if (!row?.passwordHash || !(await verifyPassword(current, row.passwordHash))) {
    return { error: "현재 비밀번호가 올바르지 않습니다." };
  }

  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(next) } });
  const ended = await endOtherSessions(me.id);

  redirect(`/account?changed=1&ended=${ended}`);
}
