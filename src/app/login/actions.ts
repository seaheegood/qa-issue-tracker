"use server";

import { headers } from "next/headers";
import { firstProjectKey } from "@/lib/project";
import { redirect } from "next/navigation";

import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const loginId = String(formData.get("loginId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/issues");

  if (!loginId || !password) {
    return { error: "아이디와 비밀번호를 입력하세요." };
  }

  const user = await prisma.user.findUnique({ where: { loginId } });

  // ⚠️ 실패 사유를 구분해서 알려주지 않는다.
  //    "그런 아이디 없음" 과 "비밀번호 틀림" 을 구분해 주면
  //    어떤 아이디가 존재하는지 밖에서 확인할 수 있게 된다(계정 열거 공격).
  const ok =
    user?.isActive && user.passwordHash
      ? await verifyPassword(password, user.passwordHash)
      : false;

  if (!ok || !user) {
    return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  const ua = (await headers()).get("user-agent");
  await createSession(user.id, ua);

  // 열린 리다이렉트 방지: 우리 사이트 안의 경로만 허용한다.
  // ★ 프로젝트가 주소에 들어가므로 `/issues` 로 바로 못 보낸다.
  //   `next` 가 있으면 그리로, 없으면 내가 속한 프로젝트의 목록으로.
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "";
  if (safe) redirect(safe);
  const key = await firstProjectKey();
  redirect(key ? `/p/${key}/issues` : "/admin/teams");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
