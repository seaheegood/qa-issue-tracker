import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

/**
 * 지금 보고 있는 프로젝트 (P-1).
 *
 * ★ 예전엔 파일 16곳에 `const PROJECT_KEY = "SP"` 가 박혀 있었다.
 *   프로젝트가 하나일 때는 아무 문제가 없었지만, 둘이 되는 순간
 *   **모든 화면이 첫 프로젝트만 보여준다.**
 *
 * ★ 주소에서 읽는다 — `/p/SP/issues`.
 *   쿠키나 세션에 담지 않은 이유: **이슈 번호가 프로젝트별**이라
 *   `/issues/1702` 가 사람마다 다른 이슈를 가리키게 된다.
 *   링크를 복사해 공유하는 게 이 앱이 파는 기능이다 (I-23 · X-15).
 */
export type ProjectRef = {
  id: number; key: string; name: string; issuePrefix: string | null; issueSeq: number;
};

/** 라우트의 `[key]` 로 프로젝트를 찾는다. 없으면 404. */
export async function requireProject(params: Promise<{ key: string }>): Promise<ProjectRef> {
  const { key } = await params;
  const project = await prisma.project.findUnique({
    where: { key: decodeURIComponent(key).toUpperCase() },
    select: { id: true, key: true, name: true, issuePrefix: true, issueSeq: true },
  });
  if (!project) notFound();
  return project;
}

/**
 * 서버 액션용. 액션은 `params` 를 못 받으므로 **폼이 실어 보낸 key** 로 찾는다.
 *
 * ★ 폼에서 온 값이라 그대로 믿지 않는다 — 존재하는 프로젝트인지 반드시 확인한다.
 *   확인 없이 쓰면 남의 프로젝트에 이슈를 만들 수 있다.
 */
export async function projectFromForm(fd: FormData): Promise<ProjectRef | null> {
  const key = String(fd.get("projectKey") ?? "").toUpperCase();
  if (!key) return null;
  return prisma.project.findUnique({
    where: { key },
    select: { id: true, key: true, name: true, issuePrefix: true, issueSeq: true },
  });
}

/**
 * ★ **`roleOf()` 는 없앴다** (2026-09-11 — 멤버 폐지).
 *
 *   역할은 이제 **소속 팀**이 정하고(`teams.role`), 세션이 들고 다닌다 —
 *   `requireUser()` 가 주는 `user.role` 을 그대로 쓰면 된다.
 *   프로젝트마다 조회하던 한 번이 통째로 사라졌다.
 *
 * ⚠️ 변경 이력에는 **그때의 값을 박아둔다.** 나중에 팀이 바뀌어도
 *   *"당시 QA 였던 사람이 완료 처리했다"* 가 보존되어야 한다 (이건 그대로다).
 */

/** 프로젝트 안의 주소를 만든다. `p("SP", "/issues?open=1")` → `/p/SP/issues?open=1` */
export const p = (key: string, path = "") => `/p/${key}${path}`;

/** 로그인 직후처럼 프로젝트가 안 정해졌을 때 갈 곳. */
export async function firstProjectKey(): Promise<string | null> {
  // ★ 예전엔 **내가 속한 프로젝트**를 먼저 봤다. 멤버를 없애면서 그 기준이 사라졌다 —
  //   이제 누구나 모든 프로젝트를 보므로 '내 것'과 '남의 것'의 구분이 없다.
  //   그래서 맨 앞 프로젝트로 떨어뜨린다. 옮겨 가면 주소가 기억한다 (`/p/{키}/…`).
  const any = await prisma.project.findFirst({
    where: { status: "ACTIVE" }, select: { key: true }, orderBy: { id: "asc" },
  });
  return any?.key ?? null;
}

/**
 * **프로젝트 밖 화면**(설정 › 팀·사용자·프로젝트 · 알림)이 어느 프로젝트를 걸치고
 * 있는지 정한다 — 주소의 `?from=` 이 정하고, 없으면 맨 앞 프로젝트로 떨어진다.
 *
 * ★ **왜 주소인가.** 쿠키로 하면 같은 `/admin/teams` 가 사람마다 다른 프로젝트를
 *   걸치게 되어 링크 공유가 깨진다 — `issues.seq` 때문에 멀티 프로젝트를 주소로
 *   정한 것과 같은 이유다 (`CLAUDE.md` ⑤ · `P-1`).
 *
 * ★ **왜 필요한가.** `/admin/teams` 와 `/notifications` 는 `[key]` 가 없는 주소라
 *   `firstProjectKey()` 로 떨어지고 있었다. 그래서 **WEB 설정에서 `팀 · 사용자 ·
 *   프로젝트 →` 를 누르면 첫 프로젝트로 넘어갔다** — 사이드바 건수도, 되돌아가는
 *   링크도 전부 첫 프로젝트 것이 됐다 (2026-09-11 제보). 로고가 늘 첫 프로젝트로
 *   가던 것(`I-24`)과 **같은 고장**이다.
 *
 * 온 값은 그대로 믿지 않는다 — **있는(ACTIVE) 프로젝트일 때만** 쓴다.
 */
export async function contextProjectKey(from: unknown): Promise<string | null> {
  const key = typeof from === "string" ? from.trim().toUpperCase() : "";
  if (key) {
    const p = await prisma.project.findFirst({
      where: { key, status: "ACTIVE" },
      select: { key: true },
    });
    if (p) return p.key;
  }
  return firstProjectKey();
}
