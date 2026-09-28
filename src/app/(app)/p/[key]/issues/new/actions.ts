"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { notifyOps, watchOps } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { pickFiles, saveFile } from "@/lib/storage";
import { toReproRate } from "@/lib/ui";


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
 * 등록 실패 시 **적었던 값을 돌려준다.**
 *
 * ★ 이게 없으면 서버 검증에 걸릴 때마다 폼이 비워진다.
 *   React 19 는 `<form action={서버액션}>` 이 끝나면 폼을 초기화하는데,
 *   그동안 서버 오류가 `content` 하나뿐이었고 그건 브라우저 `required` 가 먼저 막아서
 *   이 경로를 탈 일이 없었다. 필수값을 9개로 늘리면서 드러났다.
 *
 *   길게 적은 재현 경로를 다시 치게 하면 아무도 이슈를 안 올린다 (P-3).
 */
export type NewIssueValues = {
  title: string; content: string; testPath: string; expected: string; foundVersion: string;
  screen: string; externalRef: string; repro: string;
  round: string; priority: string; environment: string; system: string; assignee: string;
  platforms: string[];
};

export type NewIssueState = { error?: string; values?: NewIssueValues };

const str = (fd: FormData, k: string, max: number) =>
  String(fd.get(k) ?? "").trim().slice(0, max) || null;

export async function createIssue(_p: NewIssueState, fd: FormData): Promise<NewIssueState> {
  const user = await requireUser();

  /**
   * 필수값 9개 (요구사항서 02 · docs/05 §16.1).
   *
   * 화면에서도 `required` 로 막지만 **서버에서 한 번 더** 본다.
   * 화면만 믿으면 JS 를 끈 브라우저나 직접 POST 로 빈 값이 들어온다.
   *
   * 왜 강제하나: 지금까지 전부 자유 입력이라 "뒤에서 취합할 때 비는 칸을 채우러
   * 다시 물어보는" 일이 생겼다. 시트에는 상태 미입력만 58건 있었다.
   */
  // 오류로 돌려보낼 때 함께 실어 보낼 값. 어디서 걸리든 같은 것을 돌려준다.
  const keep = (): NewIssueValues => ({
    title: String(fd.get("title") ?? ""),
    content: String(fd.get("content") ?? ""),
    testPath: String(fd.get("testPath") ?? ""),
    expected: String(fd.get("expected") ?? ""),
    foundVersion: String(fd.get("foundVersion") ?? ""),
    screen: String(fd.get("screen") ?? ""),
    externalRef: String(fd.get("externalRef") ?? ""),
    repro: String(fd.get("repro") ?? ""),
    round: String(fd.get("round") ?? ""),
    priority: String(fd.get("priority") ?? ""),
    environment: String(fd.get("environment") ?? ""),
    system: String(fd.get("system") ?? ""),
    assignee: String(fd.get("assignee") ?? ""),
    platforms: fd.getAll("platform").map(String),
  });
  const fail = (error: string): NewIssueState => ({ error, values: keep() });

  // ★ **제목이 1번이다** (2026-09-16). 목록·알림·엑셀이 이 한 줄로 이슈를 부른다.
  const title = str(fd, "title", 200);
  if (!title) return fail("이슈타이틀을 입력하세요. 목록에서 이 이슈를 부르는 이름입니다.");

  const content = str(fd, "content", 5000);
  if (!content) return fail("이슈 내용을 입력하세요.");

  const testPath = str(fd, "testPath", 2000);
  if (!testPath) return fail("재현 경로를 적어주세요. 메뉴 진입부터 적으면 개발이 그대로 따라할 수 있습니다.");

  const expected = str(fd, "expected", 3000);
  if (!expected) return fail("기대 결과를 적어주세요.");

  const foundVersion = str(fd, "foundVersion", 50);
  if (!foundVersion) return fail("검출 버전을 적어주세요. (예: v0.7)");

  /**
   * 재현율 — **10번째 필수값** (FB-008 · N-59).
   *
   * ★ 기본값을 두지 않는다. `항상` 이 미리 골라져 있으면 **안 고르고 넘긴 건**과
   *   **정말 항상 재현되는 건**이 같은 값이 되고, 그 순간 이 칸으로는 아무것도 못 거른다.
   *   일괄 편집에서 배운 것과 같다 (U-05).
   *
   * ★ 이관한 1,704건은 NULL 이다. 필수는 **지금부터 쌓이는 것**에만 건다.
   */
  const reproRate = toReproRate(String(fd.get("repro") ?? ""));
  if (!reproRate) return fail("재현율을 골라주세요. 개발이 재현을 몇 번 시도해야 하는지가 여기서 갈립니다.");

  const project = await projectOf(fd);
  if (!project) return fail("프로젝트를 찾을 수 없습니다.");

  const roundCode = String(fd.get("round") ?? "");
  // ★ `사용`을 끈 값으로는 **새 이슈를 만들 수 없다** (A-70). 화면과 서버 양쪽에서 막는다 —
  //   화면만 막으면 오래 열어둔 탭이나 직접 만든 요청이 그대로 통과한다.
  //   상세의 `setField` 는 반대로 막지 않는다: 이미 그 값인 이슈를 저장하는 길까지
  //   막히면 안 되기 때문이다 (A-71). 그래서 findUnique 가 아니라 findFirst 를 쓴다.
  const [priority, environment, system, initialStatus, round] = await Promise.all([
    prisma.priority.findFirst({
      where: { projectId: project.id, code: String(fd.get("priority")), isActive: true },
    }),
    prisma.environment.findFirst({
      where: { projectId: project.id, code: String(fd.get("environment")), isActive: true },
    }),
    prisma.system.findFirst({
      where: { projectId: project.id, code: String(fd.get("system")), isActive: true },
    }),
    prisma.issueStatus.findFirst({ where: { projectId: project.id, isInitial: true } }),
    roundCode
      ? prisma.round.findFirst({ where: { projectId: project.id, code: roundCode, isActive: true } })
      : Promise.resolve(null),
  ]);

  if (!priority || !environment || !system) return fail("우선순위·환경·시스템을 확인하세요.");
  if (!initialStatus) return fail("초기 상태가 설정되어 있지 않습니다.");
  if (!round) return fail("차수를 골라주세요.");

  // 체크박스는 고른 개수만큼 같은 이름으로 온다. 하나도 안 고르면 빈 배열이다.
  const platformCodes = fd.getAll("platform").map(String).filter(Boolean);
  const platforms = platformCodes.length
    ? await prisma.platform.findMany({
        where: { projectId: project.id, code: { in: platformCodes }, isActive: true },
        select: { id: true },
      })
    : [];
  if (platformCodes.length !== platforms.length) return fail("플랫폼을 확인하세요.");
  // 체크박스는 `required` 로 "하나 이상"을 표현할 수 없다 (전부 체크하라는 뜻이 된다).
  // 그래서 이건 서버에서만 막는다.
  if (platforms.length === 0) return fail("재현된 플랫폼을 최소 하나 골라주세요.");

  // 파일은 이슈를 만들기 **전에** 검사한다.
  // 이슈를 만들고 나서 파일이 거부되면, 반쪽짜리 이슈가 남는다.
  const picked = pickFiles(fd);
  if ("error" in picked) return fail(picked.error ?? "첨부를 확인하세요.");

  /**
   * 담당자 — **선택**이다. 비워도 등록된다.
   *
   * ★ 폼에서 온 값은 그대로 믿지 않는다. **활성 계정인지 확인한다**
   *   (2026-09-11 — 멤버 폐지. 예전엔 프로젝트 멤버인지로 걸렀다).
   *   확인 없이 넣으면 퇴사자나 봇 계정이 담당자가 되고, 알림은 아무 데도 안 간다.
   */
  const assigneeRaw = String(fd.get("assignee") ?? "");
  const assigneeId = assigneeRaw ? Number(assigneeRaw) : null;
  if (assigneeId !== null) {
    const ok = await prisma.user.findFirst({
      where: { id: assigneeId, isActive: true }, select: { id: true },
    });
    if (!ok) return fail("담당자를 다시 골라주세요.");
  }

  const now = new Date();

  /**
   * 채번 (docs/03 5장).
   *
   * MAX(seq)+1 을 쓰지 않는다. 두 사람이 동시에 등록하면 같은 번호가 나온다.
   * 트랜잭션 안에서 projects 행을 잠그고 issue_seq 를 올린다.
   * 하루 77건 수준에서는 이 잠금이 병목이 되지 않는다.
   */
  const created = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ next: bigint | number }[]>`
      SELECT issue_seq + 1 AS next FROM projects WHERE id = ${project.id} FOR UPDATE
    `;
    // MySQL 은 정수 연산 결과를 BIGINT 로 돌려준다. Prisma 의 Int 필드에 그대로 넣으면 거부당한다.
    const next = Number(rows[0].next);

    await tx.project.update({ where: { id: project.id }, data: { issueSeq: next } });

    return tx.issue.create({
      data: {
        projectId: project.id,
        seq: next,
        priorityId: priority.id,
        environmentId: environment.id,
        systemId: system.id,
        legacyScreenName: str(fd, "screen", 200),
        title,
        testPath,
        content,
        expected,
        externalRef: str(fd, "externalRef", 50),
        reproRate,
        roundId: round?.id ?? null,
        foundVersion,
        // ★ 플랫폼은 **같은 트랜잭션 안에서** 만든다.
        //   첨부처럼 밖으로 빼면 실패했을 때 플랫폼 없는 반쪽 이슈가 남는다.
        platforms: { create: platforms.map((pf) => ({ platformId: pf.id })) },
        // 작성자·발생일·상태는 자동이다. 사람이 입력할 게 아니다 (FR-103)
        reporterId: user.id,
        reportedAt: now,
        statusId: initialStatus.id,
        assigneeId,
        statusChangedAt: now,
      },
      select: { id: true, seq: true },
    });
  });

  // ── 구독과 알림 (요구사항서 05)
  //
  // 작성자는 자기가 올린 이슈를 지켜본다. 담당자를 지정해서 올렸으면 그 사람도.
  // ★ 작성자에게는 알림이 가지 않는다 — 방금 자기가 만든 것이다 (lib/notify 가 거른다).
  await prisma.$transaction([
    ...watchOps(created.id, [user.id, assigneeId]),
    ...notifyOps({
      issueId: created.id,
      actorId: user.id,
      kind: "ASSIGNED",
      title: "새 이슈의 담당자가 되었습니다",
      to: assigneeId && assigneeId !== user.id ? [assigneeId] : [],
    }),
  ]);

  // 등록과 함께 올린 첨부.
  // ⚠️ 여기서는 변경 이력을 남기지 않는다. 이슈가 방금 생긴 것이므로
  //    "무엇이 바뀌었나"가 아니라 "처음부터 있던 것"이다.
  //    나중에 상세 화면에서 붙이거나 지우는 건 변경이므로 이력에 남는다.
  for (const f of picked.files) {
    const storedPath = await saveFile(project.key, f);
    await prisma.attachment.create({
      data: {
        issueId: created.id,
        fileName: f.name.slice(0, 255),
        storedPath,
        mimeType: f.type,
        sizeBytes: f.size,
        uploadedById: user.id,
      },
    });
  }

  revalidatePath(`/p/${project.key}/issues`);
  redirect(`/p/${project.key}/issues/${created.seq}`);
}
