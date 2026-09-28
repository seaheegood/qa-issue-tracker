"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { createProject, KEY_RE, PREFIX_RE } from "@/lib/create-project";
import { prisma } from "@/lib/prisma";

export type NewProjectState = { error?: string };

/**
 * 새 프로젝트 만들기 (P-1 · P-2).
 *
 * 검사를 화면과 서버 **양쪽에서** 한다. 화면만 믿으면 직접 POST 로 들어온다.
 */
export async function addProject(_p: NewProjectState, fd: FormData): Promise<NewProjectState> {
  await requireAdmin();

  const key = String(fd.get("key") ?? "").trim().toUpperCase();
  const name = String(fd.get("name") ?? "").trim().slice(0, 100);
  const prefixRaw = String(fd.get("issuePrefix") ?? "").trim().toUpperCase();
  const copyFromId = Number(fd.get("copyFrom")) || 0;

  if (!name) return { error: "프로젝트 이름을 입력하세요." };
  if (!KEY_RE.test(key)) {
    return { error: "식별자는 영문 대문자로 시작하는 2~10자여야 합니다 (예: MALL)." };
  }
  if (prefixRaw && !PREFIX_RE.test(prefixRaw)) {
    return { error: "약자는 영문 대문자로 시작하는 1~10자여야 합니다. 비우면 숫자만 보입니다." };
  }
  if (await prisma.project.findUnique({ where: { key } })) {
    return { error: `식별자 '${key}' 는 이미 있습니다.` };
  }
  if (!copyFromId) return { error: "설정을 복제할 프로젝트를 고르세요." };

  // ★ 만들기와 마스터 복제는 한 트랜잭션이다. 상태만 서고 전이가 안 서면
  //   **드롭다운이 텅 빈 프로젝트**가 남는다 — 만들다 만 것보다 나쁘다.
  const made = await createProject({
    key, name, issuePrefix: prefixRaw || null, copyFromId,
  });
  if ("error" in made) return made;

  revalidatePath("/admin/projects");
  redirect(`/p/${made.project.key}/issues`);
}
