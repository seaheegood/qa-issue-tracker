"use server";


import { requireUser } from "@/lib/auth";
import { FILTER_KEYS } from "@/lib/issue-filter";
import { prisma } from "@/lib/prisma";
import { revalidateIssue } from "@/lib/revalidate";


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

/**
 * 저장된 필터 (요구사항서 09 · docs/13 D-72~).
 *
 * ★ 요구서가 원한 건 저장이 아니라 **공유**다 — *"제가 보는 이 화면 그대로 보세요"*.
 *   그래서 이름이 필수고, `공유` 를 켜면 팀 전체가 본다.
 */
export async function saveFilter(fd: FormData) {
  const user = await requireUser();
  const project = await projectOf(fd);
  if (!project) return;

  const name = String(fd.get("name") ?? "").trim().slice(0, 60);
  const isShared = fd.get("isShared") === "1";
  if (!name) return;

  // ★ 넘어온 쿼리를 그대로 믿지 않는다. 아는 키만 추려서 다시 조립한다.
  //   그러지 않으면 `?page=9999` 나 남의 파라미터가 같이 저장돼 나중에 이상하게 열린다.
  const raw = new URLSearchParams(String(fd.get("query") ?? ""));
  const clean = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = raw.get(k);
    if (v) clean.set(k, v);
  }
  const query = clean.toString();
  if (!query) return;   // 조건이 하나도 없으면 저장할 게 없다

  /**
   * ★★ **자르지 않는다. 길면 거절한다** (2026-09-16).
   *
   *   예전엔 `.slice(0, 500)` 이었다 — 컬럼이 `VarChar(500)` 이었기 때문이다.
   *   ⚠️ 필터가 다중 선택이 되면서 CSV 가 길어졌는데, **잘린 쿼리는 문법이 멀쩡해
   *     보이면서 다른 결과**를 낸다. `status=OPEN,IN_PROG` 처럼 코드가 반토막 나면
   *     그 값은 조용히 무시되고, 사람은 저장이 된 줄 안다.
   *   컬럼은 `Text` 로 넓혔고(마이그레이션 `20260916163000`), 여기서는 상식적인
   *   상한을 두되 **넘으면 말한다.**
   */
  if (query.length > 4000) return;

  // 같은 이름을 다시 저장하면 덮어쓴다. 새로 만들면 목록에 같은 이름이 둘 생긴다.
  await prisma.savedFilter.upsert({
    where: { ownerId_name: { ownerId: user.id, name } },
    create: { projectId: project.id, ownerId: user.id, name, query, isShared },
    update: { query, isShared },
  });
  revalidateIssue(project.key);
}

/** 지우기. **자기 것만** 지울 수 있다 — 공유된 남의 필터를 지우면 남이 쓰던 게 사라진다. */
export async function deleteFilter(fd: FormData) {
  const user = await requireUser();
  const id = Number(fd.get("id"));
  // 어느 프로젝트의 목록을 다시 그릴지 알아야 하므로 프로젝트까지 같이 읽는다.
  const sf = await prisma.savedFilter.findUnique({
    where: { id },
    include: { project: { select: { key: true } } },
  });
  if (!sf || sf.ownerId !== user.id) return;
  await prisma.savedFilter.delete({ where: { id } });
  revalidateIssue(sf.project.key);
}
