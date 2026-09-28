"use server";

/**
 * 이슈 상세의 서버 액션.
 *
 * ★★ **여기의 액션은 `redirect()` 로 끝내지 않는다. `revalidateIssue()` 로 끝낸다.**
 *   상세는 두 곳에서 그려진다 — 전체 페이지(`/p/{키}/issues/{번호}`)와
 *   목록 옆 **사이드 패널**(`/p/{키}/issues?peek={번호}`). 액션은 **지금 주소로**
 *   POST 되므로, 어느 쪽에서 눌렀든 그 경로의 RSC 가 다시 내려와 그대로 반영된다.
 *   여기서 상세 주소로 `redirect()` 를 걸면 패널에서 버튼 하나를 누를 때마다
 *   **목록이 사라진다** — 패널로 여는 의미가 통째로 없어진다.
 *   (새 이슈 등록처럼 "만들고 나면 갈 곳이 정해진" 액션은 이 파일에 두지 않는다)
 */

import type { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { findMentions, notifyOps, recipients, watchOps } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
// ★ 고를 수 있는 사람은 `lib/people` 한 곳에서만 만든다 — 복제하면 화면마다 목록이 갈라진다.
//   역할은 이제 세션이 들고 온다 (`user.role` — 소속 팀이 정한다, 2026-09-11)
import { changed, type HistoryField, historyRow, rows } from "@/lib/history";
import { people } from "@/lib/people";
import { revalidateIssue } from "@/lib/revalidate";
import { ALLOWED_TYPES, deleteFile, formatBytes, MAX_BYTES, pickFiles, saveFile } from "@/lib/storage";
import {
  CLOSE_NEEDS_NOTE, CLOSE_REASON_LABEL, CLOSE_REASONS, type CloseReason,
  REPRO_RATE_LABEL, type ReproRate, toReproRate,
} from "@/lib/ui";


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

export type CommentState = { error?: string; ok?: number };

/**
 * 코멘트 유형은 **작성자의 직군에서 자동 결정**한다 (FR-302).
 * 드롭다운을 고르게 하지 않는다 — 한 번 더 누르게 하는 만큼 등록이 느려지고,
 * 사람들은 결국 아무거나 고른다.
 *
 * ★ 직군은 이제 **소속 팀**이 준다 (`teams.role` · 2026-09-11 — 멤버 폐지).
 *   팀이 없으면 `QA` 로 떨어진다 — 지금까지 LEAD·VIEWER 가 그랬던 것과 같다.
 */
const ROLE_TO_TYPE: Record<string, "DEV" | "PLAN" | "QA"> = {
  DEV: "DEV",
  PLANNER: "PLAN",
  QA: "QA",
  LEAD: "QA",   // 과거 기록에만 남는 값 (`TeamRole` 주석 참조)
};

/**
 * 코멘트 고치기 (`D-100` · 2026-09-11 · 파일럿 제보).
 *
 * ★ **자기가 쓴 것만** 고친다. 남의 말을 고칠 수 있으면 기록이 기록이 아니게 된다.
 * ★ **고쳤다는 사실을 남긴다** (`is_edited`). 컬럼은 처음부터 있었는데
 *   고치는 길이 없어서 늘 `false` 였다 — *"코멘트 단거 왜 수정이 안돼?"*
 * ★ **지우지는 않는다.** 이슈·기능과 같은 원칙이다 (`10. 아직 없는 기능`).
 *
 * ⚠️ 이력에는 남기지 않는다 — 코멘트 자체가 이미 기록이다 (`D-62` 와 같은 이유).
 * ⚠️ 알림도 보내지 않는다. 오타를 고칠 때마다 관계자 전원에게 알림이 가면
 *   아무도 알림을 안 보게 된다.
 */
export async function editComment(_prev: CommentState, fd: FormData): Promise<CommentState> {
  const user = await requireUser();

  const id = Number(fd.get("commentId"));
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return { error: "내용을 입력하세요. (지우려면 관리자에게 문의하세요)" };
  if (body.length > 20000) return { error: "너무 깁니다 (2만자 이하)." };

  const project = await projectOf(fd);
  if (!project) return { error: "프로젝트를 찾을 수 없습니다." };

  // project_id 로 먼저 좁힌다 — 주소만 바꿔 남의 프로젝트 코멘트를 만지지 못하게
  const c = await prisma.comment.findFirst({
    where: { id, issue: { projectId: project.id } },
    select: {
      id: true, authorId: true, body: true,
      issue: { select: { id: true, seq: true } },
    },
  });
  if (!c) return { error: "코멘트를 찾을 수 없습니다." };
  if (c.authorId !== user.id) return { error: "자기가 쓴 코멘트만 고칠 수 있습니다." };
  if (c.body === body) return { ok: Date.now() };          // 안 바뀌었으면 `수정됨` 도 안 붙인다

  /**
   * ★★ **고치기 전 글을 이력에 남긴다** (2026-09-17 · 사용자 지시).
   *
   *   예전에는 `isEdited: true` 불리언 하나뿐이었다 — *"수정됨"* 이라고 말은 하는데
   *   **무엇을 어떻게 고쳤는지는 아무 데도 없었다.** 원문은 덮여서 사라졌다.
   * ⚠️ 코멘트도 **이슈에 일어난 일**이다. 그래서 별도 표가 아니라 이슈 이력에 넣는다 —
   *   상세 화면에서 한 줄기로 읽힌다.
   */
  await prisma.$transaction([
    prisma.comment.update({ where: { id }, data: { body, isEdited: true } }),
    prisma.issueHistory.create({
      data: historyRow(c.issue.id, "comment", c.body, body, user),
    }),
  ]);

  revalidateIssue(project.key, c.issue.seq);
  return { ok: Date.now() };
}

/**
 * 코멘트 지우기 (`D-102` · 2026-09-11 · 파일럿 제보).
 *
 * ⚠️⚠️ **하루 전 판단을 뒤집는다.** 어제 `D-100-3` 에 *"지우는 버튼은 없다 —
 *   이슈·기능과 같은 원칙"* 이라고 적었다. 조용히 고치지 않고 여기 근거를 남긴다.
 *
 *   **이슈·기능은 기록의 뼈대**라 지우면 이력이 끊긴다. **코멘트는 대화**다 —
 *   잘못 쓴 말은 쓴 사람이 거둘 수 있어야 한다. 게다가 어제 **수정**을 열어 준 이상
 *   *"본문을 통째로 지우고 다시 쓰기"* 가 이미 가능했다. 그럴 바엔 삭제를 정식으로
 *   두고 **무엇이 함께 사라지는지 말해 주는 쪽**이 정직하다.
 *
 * ★ **자기가 쓴 것만.** 수정(`editComment`)과 같은 기준이다.
 *
 * ⚠️ **답글은 DB 가 알아서 지운다** — `Comment.parent` 가 `onDelete: Cascade`
 *   (`schema.prisma`). 코드에서 답글을 따로 돌 필요가 없다.
 *
 * ⚠️⚠️ **그런데 디스크 파일은 안 지워진다.** `attachments` **행**은 Cascade 로
 *   사라지지만 실제 파일은 남아 고아가 된다. 그래서 **지우기 전에**
 *   `storedPath` 를 모아 두고, DB 를 지운 **뒤에** 파일을 지운다
 *   (`deleteAttachment` 와 같은 순서 — 반대로 하면 파일만 사라지고 기록이 남는다).
 *
 * ⚠️ **알림에는 남는다.** `notifications.title` 에 본문 미리보기가 문장으로 박제돼
 *   있고 `comment_id` 가 없다. 지운 코멘트의 일부가 알림 목록에 계속 보인다 —
 *   지금 구조에서는 고칠 수 없어 그대로 둔다 (`docs/11` D-102-3).
 */
export async function deleteComment(fd: FormData) {
  const user = await requireUser();

  const id = Number(fd.get("commentId"));
  const project = await projectOf(fd);
  if (!project) return;

  // project_id 로 먼저 좁힌다 — 주소만 바꿔 남의 프로젝트 코멘트를 지우지 못하게
  const c = await prisma.comment.findFirst({
    where: { id, issue: { projectId: project.id } },
    select: {
      id: true, authorId: true, body: true,
      issue: { select: { id: true, seq: true } },
      attachments: { select: { storedPath: true } },
      _count: { select: { replies: true } },
    },
  });
  if (!c) return;
  if (c.authorId !== user.id) return;          // 남의 말은 못 지운다

  // ★★ **답글이 달렸으면 못 지운다** (2026-09-16 제보).
  //   Cascade 가 답글을 같이 끌고 내려가므로, 지우는 순간 **남이 쓴 글을 내가
  //   지우는** 셈이 된다. 화면에서도 버튼이 안 나오지만 **여기서 다시 막는다** —
  //   화면만 감추면 액션 직접 호출로 뚫린다 (`C-09`).
  if (c._count.replies > 0) return;

  // 지우기 **전에** 파일 경로를 모은다. 지운 뒤에는 어디 있었는지 알 수 없다.
  // (답글이 없는 것이 확정이므로 본인 첨부만 본다)
  const paths = c.attachments.map((a) => a.storedPath);

  /**
   * ★★ **지우기 «전에» 이력을 남긴다** (2026-09-17 · 사용자 지시).
   *
   *   예전에는 흔적이 **0** 이었다 — 행을 통째로 지우므로 누가 무엇을 지웠는지
   *   아무 데도 없었다. 순서가 중요하다: **먼저 기록하고 그다음 지운다.**
   *   같은 트랜잭션이라 한쪽만 남는 순간이 없다.
   * ⚠️ `deleteFile` 은 트랜잭션 **밖**이다 — 파일 시스템은 되돌릴 수 없어서
   *   DB 가 확정된 뒤에 지운다 (원래 있던 순서 그대로).
   */
  await prisma.$transaction([
    prisma.issueHistory.create({
      data: historyRow(c.issue.id, "comment_deleted", c.body, null, user),
    }),
    prisma.comment.delete({ where: { id } }),       // 첨부 행은 Cascade
  ]);
  for (const path of paths) await deleteFile(path);

  revalidateIssue(project.key, c.issue.seq);
}

export async function addComment(_prev: CommentState, fd: FormData): Promise<CommentState> {
  const user = await requireUser();

  const seq = Number(fd.get("seq"));
  const body = String(fd.get("body") ?? "").trim();
  const parentRaw = String(fd.get("parentId") ?? "");
  const parentId = parentRaw ? Number(parentRaw) : null;

  const picked = pickFiles(fd);
  if ("error" in picked) return { error: picked.error };

  // 첨부만 있고 글이 없어도 괜찮다. "이렇게 나옵니다" 하고 이미지만 붙이는 경우가 많다.
  if (!body && picked.files.length === 0) return { error: "내용을 입력하거나 파일을 첨부하세요." };
  if (body.length > 20000) return { error: "너무 깁니다 (2만자 이하)." };

  const project = await projectOf(fd);
  if (!project) return { error: "프로젝트를 찾을 수 없습니다." };

  // project_id 로 먼저 좁힌다 (docs/03 6장)
  const issue = await prisma.issue.findUnique({
    where: { projectId_seq: { projectId: project.id, seq } },
    select: { id: true },
  });
  if (!issue) return { error: "이슈를 찾을 수 없습니다." };

  // 답글이라면, 그 부모가 정말 이 이슈의 최상위 코멘트인지 확인한다.
  // 확인하지 않으면 남의 이슈 코멘트에 답글을 붙일 수 있다.
  if (parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parentId },
      select: { issueId: true, parentId: true },
    });
    if (!parent || parent.issueId !== issue.id) return { error: "잘못된 답글 대상입니다." };
    if (parent.parentId) return { error: "답글에는 다시 답글을 달 수 없습니다." };
  }

  // ── 멘션 (요구사항서 05)
  //
  // ★ 이름으로 부른다 — `@아이디` 가 아니라 `@이름`.
  //   읽는 사람이 코멘트를 그대로 읽을 수 있어야 한다.
  // ★ 멘션된 사람은 **구독 여부와 무관하게** 받는다. 이름을 불렀는데 안 가면
  //   부른 사람이 "말했는데 왜 답이 없지" 를 하게 된다.
  // ★ 후보는 **활성 사용자 전원** — 담당자 드롭다운과 같은 목록이다 (`people()`).
  const candidates = await people();
  const mentioned = findMentions(body, candidates).filter((id) => id !== user.id);

  const who = parentId ? "답글" : "코멘트";
  const preview = body.replace(/\s+/g, " ").trim().slice(0, 60) || "(파일만)";

  // 수신자 두 갈래. 멘션은 따로 세어야 알림 제목이 달라진다.
  const [commentTo, mentionTo] = await Promise.all([
    recipients(issue.id, user.id).then((ids) => ids.filter((id) => !mentioned.includes(id))),
    Promise.resolve(mentioned),
  ]);

  // ★ addComment 만 트랜잭션이 없었다 — saveFile 이 디스크 I/O 라 배열에 못 들어간다.
  //   코멘트·구독·알림은 한 덩어리로 묶고, 파일은 그다음에 저장한다.
  //   파일이 실패하면 코멘트는 남는다. 반대(알림만 가고 코멘트가 없는 것)보다 낫다.
  const [comment] = await prisma.$transaction([
    prisma.comment.create({
      data: {
        issueId: issue.id,
        parentId,
        // 작성자와 작성 시각은 **자동으로** 기록된다.
        // 엑셀에서 '7/29 14:57 이름)' 을 손으로 치던 1,318건이 여기서 사라진다.
        authorId: user.id,
        type: ROLE_TO_TYPE[user.role ?? "QA"] ?? "QA",
        body,
      },
    }),
    // 코멘트를 단 사람과 이름이 불린 사람이 이 이슈를 지켜보게 된다 (요구서 05).
    ...watchOps(issue.id, [user.id, ...mentioned]),
    ...notifyOps({
      issueId: issue.id, actorId: user.id, kind: "COMMENT",
      title: `${who} — ${preview}`, to: commentTo,
    }),
    ...notifyOps({
      issueId: issue.id, actorId: user.id, kind: "MENTION",
      title: `${who}에서 이름을 불렀습니다 — ${preview}`, to: mentionTo,
    }),
  ]);

  // 코멘트에 붙는 첨부. 이력은 남기지 않는다 — 코멘트 자체가 이미 기록이다.
  for (const f of picked.files) {
    const storedPath = await saveFile(project.key, f);
    await prisma.attachment.create({
      data: {
        commentId: comment.id,
        fileName: f.name.slice(0, 255),
        storedPath,
        mimeType: f.type,
        sizeBytes: f.size,
        uploadedById: user.id,
      },
    });
  }

  revalidateIssue(project.key, seq);
  // 값이 매번 달라져야 화면에서 '방금 성공했다'를 알 수 있다(입력칸 비우기용)
  return { ok: Date.now() };
}

// ═══════════════════════════════════════════════════════════
// 이슈 수정 · 상태 변경
//
// ★ 전이 규칙(status_transitions)이 있다. 정해진 경로로만 갈 수 있다.
//   한 번 "만들지 않겠다"고 정했다가 현업 요구로 뒤집었다 (docs/03 v6 → v8) —
//   "자유롭게 아무 값이나 고를 수 있으면 지금 시트와 다를 게 없습니다."
//
//   대신 '종결'로 가는 길은 모든 상태에 열려 있다. QA 가 스스로 취소하고
//   개발이 보류하는 흐름을 막으면 사람들이 엑셀로 돌아간다 (R1).
//   막는 것은 처리 경로뿐이고, 빠져나가는 문은 어디서든 열려 있다.
//
// ★ 이력은 항상 액션 안에서 같은 트랜잭션으로 쓴다. 화면이 따로 부르지 않는다.
//   호출을 빠뜨리면 이력이 비고, 그러면 대시보드가 성립하지 않는다.
// ═══════════════════════════════════════════════════════════

export type EditState = { error?: string; ok?: number };

/** 이슈 하나 + 그 프로젝트. **폼이 실어 보낸 프로젝트 안에서만** 찾는다. */
async function loadIssue(fd: FormData, seq: number) {
  const project = await projectOf(fd);
  if (!project) return null;
  const issue = await prisma.issue.findUnique({
    where: { projectId_seq: { projectId: project.id, seq } },
  });
  return issue ? { project, issue } : null;
}

// ═══════════════════════════════════════════════════════════
// 이슈 숨기기 / 되살리기  ★ 2026-09-17 (사용자 지시)
// ═══════════════════════════════════════════════════════════

/**
 * **지우지 않고 숨긴다.**
 *
 * ★ `docs/02` FR-108 과 `docs/11` 은 *"이슈를 물리 삭제하지 않는다 — 의도적"* 이었다.
 *   그 판단을 뒤집되 **지우지는 않는다** — `deleted_at` 만 찍는다.
 *   코멘트·첨부·이력·알림이 전부 딸려 있어 진짜 지우면 **되돌릴 수 없다.**
 *
 * ★ **누가** — 작성자 본인과 관리자. 코멘트 삭제와 같은 기준이다(자기 글).
 * ⚠️ 화면에 버튼이 없어도 **요청은 보낼 수 있다.** 그래서 여기서 다시 확인한다
 *   (`C-44` 가 담당자에 대해 이미 정한 규칙).
 *
 * ⚠️ 이슈번호는 **되돌아오지 않는다.** 숨겨도 그 번호는 영영 그 이슈 것이다 —
 *   되살릴 수 있어야 하므로 재활용하면 안 된다.
 */
export async function hideIssue(fd: FormData) {
  const user = await requireUser();
  const seq = Number(fd.get("seq"));
  const found = await loadIssue(fd, seq);
  if (!found) return;
  const { project, issue } = found;

  if (issue.deletedAt) return;                      // 이미 숨겨져 있다
  const mine = issue.reporterId === user.id;
  if (!mine && user.systemRole !== "ADMIN") return; // 남의 이슈는 관리자만

  await prisma.$transaction([
    prisma.issue.update({
      where: { id: issue.id },
      data: { deletedAt: new Date(), deletedById: user.id },
    }),
    prisma.issueHistory.create({
      data: historyRow(issue.id, "deleted", null, issue.title.slice(0, 200), user),
    }),
  ]);

  /**
   * ⚠️ **`redirect()` 를 쓰지 않는다** (이 파일 머리 규칙).
   *   사이드 패널에서 숨기기를 누르면 **목록이 통째로 사라진다** — 패널로 여는
   *   의미가 없어진다. 대신 다시 그리게만 하고, 화면이 «숨긴 이슈» 띠로 말한다.
   */
  revalidateIssue(project.key, seq);
}

/** 숨긴 것을 되살린다. 숨길 수 있는 사람이 되살릴 수도 있다. */
export async function restoreIssue(fd: FormData) {
  const user = await requireUser();
  const seq = Number(fd.get("seq"));
  const found = await loadIssue(fd, seq);
  if (!found) return;
  const { project, issue } = found;

  if (!issue.deletedAt) return;                     // 숨겨져 있지 않다
  const mine = issue.reporterId === user.id;
  if (!mine && user.systemRole !== "ADMIN") return;

  await prisma.$transaction([
    prisma.issue.update({
      where: { id: issue.id },
      data: { deletedAt: null, deletedById: null },
    }),
    prisma.issueHistory.create({
      data: historyRow(issue.id, "restored", null, issue.title.slice(0, 200), user),
    }),
  ]);
  revalidateIssue(project.key, seq);
}

/** 상태 변경. 드롭다운을 바꾸면 바로 호출된다. */
export async function changeStatus(_p: EditState, fd: FormData): Promise<EditState> {
  const user = await requireUser();
  const seq = Number(fd.get("seq"));
  const statusId = Number(fd.get("statusId"));
  const note = String(fd.get("note") ?? "").trim();
  const closeReason = String(fd.get("closeReason") ?? "").trim();
  const dupOf = Number(fd.get("dupOf") ?? 0) || 0;   // 중복일 때 가리킬 원본 이슈 번호
  const fixedVersion = String(fd.get("fixedVersion") ?? "").trim().slice(0, 50);

  const loaded = await loadIssue(fd, seq);
  if (!loaded) return { error: "이슈를 찾을 수 없습니다." };
  const { project, issue } = loaded;

  if (issue.statusId === statusId) return { ok: Date.now() }; // 같은 값이면 아무것도 안 한다

  const [from, to] = await Promise.all([
    prisma.issueStatus.findUnique({ where: { id: issue.statusId } }),
    prisma.issueStatus.findUnique({ where: { id: statusId } }),
  ]);
  if (!to || to.projectId !== project.id) return { error: "잘못된 상태입니다." };
  if (!to.isActive) return { error: `'${to.name}' 는 더 이상 쓰지 않는 상태입니다.` };

  // ── 전이 규칙 (docs/13 D-01)
  // 화면에서도 막지만 서버에서 한 번 더 본다. 화면만 믿으면 안 된다.
  const allowed = await prisma.statusTransition.findUnique({
    where: {
      projectId_fromStatusId_toStatusId: {
        projectId: project.id,
        fromStatusId: issue.statusId,
        toStatusId: statusId,
      },
    },
    select: { isActive: true, requireNote: true, noteLabel: true },
  });
  if (!allowed?.isActive) {
    return { error: `'${from?.name ?? "현재 상태"}' 에서 '${to.name}' 로는 바꿀 수 없습니다.` };
  }

  // ── 반영 버전 (docs/13 §5 · 요구사항서 03 "Fixed — 반영 버전 필수")
  //
  // 이 칸이 없어서 재현 확인할 때마다 "이거 배포된 거 맞나요?"를 메신저로 물었다.
  // 여기서 받으면 그 왕복이 사라진다.
  let nextFixedVersion: string | null | undefined = undefined;
  if (to.category === "RESOLVED" && to.code === "FIXED") {
    const already = issue.fixedVersion ?? "";
    if (!fixedVersion && !already) {
      return { error: "어느 버전에 반영됐는지 적어주세요." };
    }
    if (fixedVersion) nextFixedVersion = fixedVersion;
  }

  // ── 종결 사유 (docs/13 §4)
  // 상태를 8종으로 줄이면서 '취소'·'보류'가 상태에서 빠지고 사유가 됐다.
  // 그때 사유 필수가 같이 사라지지 않게 여기서 받는다.
  let close: CloseReason | null = null;
  let dupOriginId: number | null = null;
  if (to.category === "CLOSED") {
    if (!(CLOSE_REASONS as readonly string[]).includes(closeReason)) {
      return { error: "종결 사유를 골라주세요." };
    }
    close = closeReason as CloseReason;

    // ★ 중복이면 원본을 **번호가 아니라 링크로** 가리킨다.
    //   코멘트에 '#2358로 해소' 라고 적던 것을 대신한다. 텍스트로 적으면 틀린 번호를
    //   아무도 못 잡는다 — 8/14 보고서 검증에서 실제로 14건 나왔다.
    if (close === "DUPLICATE") {
      if (!dupOf) return { error: "중복이라면 원본 이슈 번호를 적어주세요." };
      if (dupOf === seq) return { error: "자기 자신을 원본으로 지정할 수 없습니다." };
      const origin = await prisma.issue.findUnique({
        where: { projectId_seq: { projectId: project.id, seq: dupOf } },
        select: { id: true },
      });
      if (!origin) return { error: `${dupOf}번 이슈가 없습니다.` };
      dupOriginId = origin.id;
    }
    // 이슈 아님·중복·보류는 "왜"가 남아야 한다 — 예전 취소·보류와 같은 취급이다.
    if (CLOSE_NEEDS_NOTE[close] && !note) {
      return { error: `'${CLOSE_REASON_LABEL[close]}' 로 닫으려면 사유가 필요합니다.` };
    }
  }

  // ── Reason 5종 (docs/13 §5 · D-06)
  //
  // ★ **정정 (2026-08-22)** — 예전엔 도착 상태(`issue_statuses.require_note`)를 봤다.
  //   그러면 `Fixed` 하나에 원인·조치와 확인한 케이스를 동시에 요구할 수 없다.
  //   출발지가 달라야 적을 것이 갈리므로 **전이**로 옮겼다.
  //
  // ★ 이와 함께 D-49(*"QA확인완료는 글 없이 닫힌다"*)를 **뒤집었다.**
  //   Fixed → Closed 는 이제 QA Reason 이 필수다 — 요구사항서 04 가 요구한
  //   *"확인한 환경·버전 · 확인한 케이스"* 가 없으면 "확인했다"는 말만 남는다.
  //   이관된 1,287건은 이미 닫혀 있어 영향받지 않는다.
  if (allowed.requireNote && !note) {
    return {
      error: `'${from?.name ?? "현재 상태"}' → '${to.name}' 은 ${allowed.noteLabel ?? "사유"} 가 필요합니다.`,
    };
  }

  const now = new Date();

  // ── 알림 (요구사항서 05·07)
  //
  // ★ 여기까지 왔다는 건 **정말 바뀐다**는 뜻이다. 위의 조기 반환들
  //   (같은 상태 · 막힌 전이 · 사유 없음)보다 반드시 뒤에 있어야 한다.
  //   안 바뀌었는데 알림만 나가면 요구서가 경계한 "알림이 소음이 된다" 가 된다.
  const title = close
    ? `${to.name} (${CLOSE_REASON_LABEL[close]})`
    : `${from?.name ?? "?"} → ${to.name}`;
  const notifs = notifyOps({
    issueId: issue.id,
    actorId: user.id,
    kind: to.category === "CLOSED" ? "CLOSED" : "STATUS",
    title,
    to: await recipients(issue.id, user.id),
  });

  // 중복 지정은 상태 변경과 **같은 트랜잭션**에 넣는다.
  // 따로 쓰면 "중복으로 닫혔는데 원본이 없는" 상태가 생길 수 있다.
  const dupOps = dupOriginId
    ? [
        prisma.issueRelation.upsert({
          where: {
            fromIssueId_toIssueId_type: {
              fromIssueId: issue.id, toIssueId: dupOriginId, type: "DUPLICATE" as const,
            },
          },
          create: {
            fromIssueId: issue.id, toIssueId: dupOriginId,
            type: "DUPLICATE" as const, createdById: user.id,
          },
          update: {},
        }),
        prisma.issueHistory.create({
          data: {
            issueId: issue.id, field: "relation",
            oldValue: null, newValue: `${dupOf}번의 중복`,
            changedById: user.id, changedByRole: user.role,
          },
        }),
      ]
    : [];

  await prisma.$transaction([
    ...dupOps,
    ...notifs,
    // 상태를 바꾼 사람도 이 이슈를 지켜보게 된다. 껐던 사람은 그대로 꺼져 있다.
    ...watchOps(issue.id, [user.id]),
    prisma.issue.update({
      where: { id: issue.id },
      data: {
        statusId,
        statusChangedAt: now,
        // 종결에서 빠져나오면 사유를 비운다. 남겨두면 다음에 왜 닫혔는지가 헷갈린다.
        closeReason: to.category === "CLOSED" ? close : null,
        ...(nextFixedVersion !== undefined ? { fixedVersion: nextFixedVersion } : {}),
        // 처리됨으로 처음 넘어간 시점을 개발작업일로 잡는다 (엑셀의 O열)
        ...(to.category === "RESOLVED" && !issue.resolvedAt ? { resolvedAt: now } : {}),
        // Answered 는 '누가 답했는지'를 자동으로 찍는다 (FR-208).
        // 상태를 '개발답변완료/기획답변완료'로 쪼개지 않기 위한 장치다.
        ...(to.code === "ANSWERED"
          ? { answeredById: user.id, answeredByRole: user.role, answeredAt: now }
          : {}),
      },
    }),
    prisma.issueHistory.create({
      data: {
        issueId: issue.id,
        field: "status",
        oldValue: from?.name ?? null,
        newValue: close ? `${to.name} (${CLOSE_REASON_LABEL[close]})` : to.name,
        changedById: user.id,
        changedByRole: user.role,
        note: note || null,
        changedAt: now,
      },
    }),
  ]);

  revalidateIssue(project.key, seq);
  return { ok: Date.now() };
}

/** 담당자·우선순위·환경·시스템. 드롭다운을 바꾸면 바로 호출된다. */
/**
 * 드롭다운 한 칸을 바꾼다. 고르는 즉시 호출된다.
 *
 * ★ 예전에는 아무것도 돌려주지 않았다(`Promise<void>`). 그래서 저장이 조용히
 *   실패해도 **화면은 아무 말도 하지 않았고**, 성공했는지도 알 수 없었다.
 *   `useActionState` 가 받을 수 있게 `EditState` 를 돌려준다 — 실패는 그 자리에 뜨고,
 *   성공은 `ok` 가 매번 달라져서 화면이 "방금 됐다"를 알 수 있다.
 */
export async function setField(_p: EditState, fd: FormData): Promise<EditState> {
  const user = await requireUser();
  const seq = Number(fd.get("seq"));
  const field = String(fd.get("field"));
  const raw = String(fd.get("value") ?? "");

  const loaded = await loadIssue(fd, seq);
  if (!loaded) return { error: "이슈를 찾을 수 없습니다." };
  const { project, issue } = loaded;

  /**
   * 필드마다 "폼 값을 어떻게 읽고 · 어느 컬럼에 넣고 · 이력에 뭐라고 적을지" 를 묶어둔다.
   *
   * ★ **화이트리스트다.** 여기 없는 이름은 거부된다. 폼에서 오는 `field` 를 그대로
   *   컬럼 이름으로 쓰면 아무 칸이나 고칠 수 있게 된다.
   *
   * ★ 값이 전부 FK(숫자)라는 전제가 **재현율에서 깨졌다** (FB-008). 재현율은 enum 이라
   *   문자열이다. 그래서 `Number(raw)` 를 밖에서 한 번 하던 것을 **필드마다** 하게 바꿨다.
   *   액션을 하나 더 만들지 않은 이유는 뒤따르는 것(이력·알림·트랜잭션)이 전부 같기 때문이다 —
   *   복제하면 "재현율만 이력이 안 남는" 종류의 버그가 생긴다.
   */
  type Value = number | string | null;
  type FieldSpec = {
    current: Value;
    /** 폼 값 → 저장할 값. **아는 값이 아니면 `undefined`** 를 돌려 거부한다 */
    parse: (raw: string) => Value | undefined;
    /** 비울 수 있는가 */
    nullable: boolean;
    data: (v: Value) => Prisma.IssueUncheckedUpdateInput;
    /** 이력에 남길 사람이 읽는 이름 */
    name: (v: Value) => Promise<string | null>;
  };

  /** FK 는 전부 같은 방식으로 읽는다. 빈 값은 null, 숫자가 아니면 거부. */
  const fk = (r: string): Value | undefined => {
    if (r === "") return null;
    const n = Number(r);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };

  const specs: Record<string, FieldSpec> = {
    assignee: {
      current: issue.assigneeId,
      parse: fk,
      nullable: true,
      data: (v) => ({ assigneeId: v as number | null }),
      // ★ **활성 계정만.** 이름을 못 찾으면 아래에서 거부한다 —
      //   멤버 표가 없어진 뒤로 폼 값을 걸러내는 자리가 여기다 (2026-09-11).
      name: async (v) =>
        v
          ? (await prisma.user.findFirst({ where: { id: v as number, isActive: true } }))?.name ?? null
          : "미지정",
    },
    priority: {
      current: issue.priorityId,
      parse: fk,
      nullable: false,
      data: (v) => ({ priorityId: v as number }),
      name: async (v) =>
        v ? (await prisma.priority.findUnique({ where: { id: v as number } }))?.name ?? null : null,
    },
    environment: {
      current: issue.environmentId,
      parse: fk,
      nullable: false,
      data: (v) => ({ environmentId: v as number }),
      name: async (v) =>
        v ? (await prisma.environment.findUnique({ where: { id: v as number } }))?.name ?? null : null,
    },
    system: {
      current: issue.systemId,
      parse: fk,
      nullable: false,
      data: (v) => ({ systemId: v as number }),
      name: async (v) =>
        v ? (await prisma.system.findUnique({ where: { id: v as number } }))?.name ?? null : null,
    },
    round: {
      // 이관한 1,704건이 NULL 이라 "미분류"로 되돌릴 길이 있어야 한다
      current: issue.roundId,
      parse: fk,
      nullable: true,
      data: (v) => ({ roundId: v as number | null }),
      name: async (v) =>
        v ? (await prisma.round.findUnique({ where: { id: v as number } }))?.name ?? null : "미분류",
    },
    /**
     * 재현율 (FB-008).
     *
     * ★ **비울 수 없다.** 이관분은 NULL 로 시작하지만, 한 번 적은 값을 다시 지우는 건
     *   되돌리기가 아니라 정보를 없애는 일이다. 잘못 골랐으면 **다른 값으로** 바꾸면 된다.
     *   그래서 화면도 `— 안 적힘` 을 **아직 안 적은 이슈에서만** 보여준다.
     */
    repro: {
      current: issue.reproRate,
      parse: (r) => toReproRate(r),
      nullable: false,
      data: (v) => ({ reproRate: v as ReproRate }),
      name: async (v) => (v ? REPRO_RATE_LABEL[v as ReproRate] : null),
    },
  };

  const spec = specs[field];
  if (!spec) return { error: "고칠 수 없는 항목입니다." };

  const id = spec.parse(raw);
  if (id === undefined) return { error: "고른 값을 알아볼 수 없습니다. 다시 골라주세요." };
  if (spec.current === id) return { ok: Date.now() };  // 같은 값이면 이력을 남기지 않는다
  if (!spec.nullable && id === null) {
    return { error: "이 항목은 비울 수 없습니다." };
  }

  const [oldName, newName] = await Promise.all([spec.name(spec.current), spec.name(id)]);
  // ★ 새 값의 이름을 못 찾았다 = 그런 행이 없거나 쓸 수 없는 계정이다. **넣지 않는다.**
  //   (예전 값은 지워졌을 수 있으므로 `oldName` 은 비어도 그냥 둔다)
  if (id !== null && newName === null) {
    return { error: "고른 값을 찾을 수 없습니다. 다시 골라주세요." };
  }

  // ── 담당 배정만 알림을 만든다 (2026-08-23 결정 — 5종).
  //   우선순위·환경·시스템·차수는 알림이 없다. 이슈를 열면 이력에 다 보인다.
  //   ★ 새 담당자에게는 **구독 여부와 무관하게** 간다 — 자기 일이 됐다는 소식이다.
  // ★ 담당자만 숫자다. `id` 가 숫자·문자열·null 을 다 받을 수 있게 넓어진 뒤로는
  //   여기서 한 번 좁혀 준다 — 아래 두 곳이 사람 id 를 기대하기 때문이다.
  const newAssigneeId = field === "assignee" && typeof id === "number" ? id : null;

  const assignNotifs =
    newAssigneeId !== null
      ? notifyOps({
          issueId: issue.id,
          actorId: user.id,
          kind: "ASSIGNED",
          title: `담당자 ${newName ?? "?"}`,
          to: await recipients(issue.id, user.id, [newAssigneeId]),
        })
      : [];

  await prisma.$transaction([
    ...assignNotifs,
    ...(field === "assignee" ? watchOps(issue.id, [newAssigneeId]) : []),
    prisma.issue.update({ where: { id: issue.id }, data: spec.data(id) }),
    prisma.issueHistory.create({
      data: {
        issueId: issue.id,
        field,
        oldValue: oldName,
        newValue: newName,
        changedById: user.id,
        changedByRole: user.role,
      },
    }),
  ]);

  revalidateIssue(project.key, seq);
  return { ok: Date.now() };
}

/**
 * 플랫폼 (N:M).
 *
 * `setField` 는 "이슈의 어느 **컬럼**인가"를 전제로 만들어져 있어 여기에 못 쓴다.
 * 플랫폼은 컬럼이 아니라 별도 테이블의 행 여러 개다.
 *
 * 이력은 **스냅샷**으로 남긴다 — `PC` → `PC · 모바일` 한 줄.
 * 첨부처럼 추가/삭제를 한 줄씩 남길 수도 있지만, 플랫폼은 "지금 무엇에서 나는가"가
 * 한 덩어리로 읽혀야 의미가 있다.
 */
export async function setPlatforms(_p: EditState, fd: FormData): Promise<EditState> {
  const user = await requireUser();
  const seq = Number(fd.get("seq"));

  const loaded = await loadIssue(fd, seq);
  if (!loaded) return { error: "이슈를 찾을 수 없습니다." };
  const { project, issue } = loaded;

  const codes = fd.getAll("platform").map(String).filter(Boolean);
  // ★ 화면과 같은 조건으로 받는다 (A-73) — 켜진 것 + **이 이슈가 이미 물고 있는 것**.
  //   `isActive: true` 만 두면 꺼진 플랫폼을 물고 있던 이슈에서 저장이 통째로 거부되고
  //   (`picked.length !== codes.length`), 화면에서 그 칸을 지워버리면 아래 deleteMany 가
  //   손댄 적 없는 연결까지 지운다. 두 경우 모두 사람이 한 적 없는 일이 일어난다.
  const all = await prisma.platform.findMany({
    where: {
      projectId: project.id,
      OR: [{ isActive: true }, { issues: { some: { issueId: issue.id } } }],
    },
    orderBy: { sortOrder: "asc" },
  });
  const picked = all.filter((p) => codes.includes(p.code));
  if (picked.length !== codes.length) return { error: "플랫폼을 확인하세요." };

  const before = await prisma.issuePlatform.findMany({
    where: { issueId: issue.id },
    include: { platform: true },
  });
  const label = (rows: { name: string; sortOrder: number }[]) =>
    rows.length ? [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.name).join(" · ") : "없음";

  const oldLabel = label(before.map((b) => b.platform));
  const newLabel = label(picked);
  if (oldLabel === newLabel) return { ok: Date.now() };   // 안 바뀌면 이력을 남기지 않는다

  await prisma.$transaction([
    prisma.issuePlatform.deleteMany({ where: { issueId: issue.id } }),
    prisma.issuePlatform.createMany({
      data: picked.map((p) => ({ issueId: issue.id, platformId: p.id })),
    }),
    prisma.issueHistory.create({
      data: {
        issueId: issue.id, field: "platform",
        oldValue: oldLabel, newValue: newLabel,
        changedById: user.id, changedByRole: user.role,
      },
    }),
  ]);

  revalidateIssue(project.key, seq);
  return { ok: Date.now() };
}

/** 긴 글과 화면명·QAI#. 저장 버튼을 눌러야 반영된다. */
export async function updateIssueText(_p: EditState, fd: FormData): Promise<EditState> {
  const user = await requireUser();
  const seq = Number(fd.get("seq"));

  const loaded = await loadIssue(fd, seq);
  if (!loaded) return { error: "이슈를 찾을 수 없습니다." };
  const { project, issue } = loaded;

  const next = {
    title: String(fd.get("title") ?? "").trim().slice(0, 200),
    content: String(fd.get("content") ?? "").trim().slice(0, 5000) || null,
    testPath: String(fd.get("testPath") ?? "").trim().slice(0, 2000) || null,
    expected: String(fd.get("expected") ?? "").trim().slice(0, 3000) || null,
    legacyScreenName: String(fd.get("screen") ?? "").trim().slice(0, 200) || null,
    externalRef: String(fd.get("externalRef") ?? "").trim().slice(0, 50) || null,
    foundVersion: String(fd.get("foundVersion") ?? "").trim().slice(0, 50) || null,
    fixedVersion: String(fd.get("fixedVersion") ?? "").trim().slice(0, 50) || null,
  };
  // ★ 제목은 비울 수 없다. 비면 목록에서 그 이슈를 **부를 이름이 없어진다**.
  //   본문(content)은 반대로 비워도 된다 — 2026-09-16 에 제목이 그 역할을 넘겨받았다.
  if (!next.title) return { error: "이슈타이틀은 비울 수 없습니다." };

  // field 에는 **영문 키만** 넣는다. 표시 이름은 화면(HistoryList)이 맡는다.
  // 한글을 섞어 저장하면 나중에 이름을 바꿀 때 과거 이력을 못 읽는다.
  const FIELD_KEY: Record<string, string> = {
    title: "title", content: "content", testPath: "test_path", expected: "expected",
    legacyScreenName: "screen", externalRef: "external_ref",
    foundVersion: "found_version", fixedVersion: "fixed_version",
  };
  /**
   * ★★ **긴 글도 전문을 남긴다** (2026-09-17 · 사용자 지시).
   *
   *   원래 여기 `LONG = new Set(["content","testPath","expected"])` 가 있었고
   *   그 셋은 old/new 를 **둘 다 NULL** 로 뒀다. 그래서 화면에는
   *   *"이슈 내용 — 수정함"* 한 줄만 뜨고 **무엇이 어떻게 바뀌었는지는 없었다.**
   *
   * ⚠️ 곁가지로 두 가지가 틀려 있었다:
   *   ① `LONG` 은 **카멜 키**(`testPath`)로 판정하는데 `field` 는 스네이크(`test_path`)로
   *      저장한다 — 두 이름이 섞여 있었다
   *   ② 빈 값을 문자열 **`"—"`** 로 저장해서 **진짜 NULL 과 구분이 안 됐다.**
   *      이제 `null` 을 그대로 넣고, 화면이 `—` 로 그린다
   */
  const histRows = rows((Object.keys(next) as (keyof typeof next)[]).map((k) =>
    changed(issue.id, (FIELD_KEY[k] ?? k) as HistoryField,
            issue[k] as string | null, next[k], user),
  ));

  if (histRows.length === 0) return { ok: Date.now() };

  await prisma.$transaction([
    prisma.issue.update({ where: { id: issue.id }, data: next }),
    prisma.issueHistory.createMany({ data: histRows }),
  ]);

  revalidateIssue(project.key, seq);
  return { ok: Date.now() };
}

// ═══════════════════════════════════════════════════════════
// 첨부파일
// ═══════════════════════════════════════════════════════════

export type UploadState = { error?: string; ok?: number };

export async function uploadAttachments(_p: UploadState, fd: FormData): Promise<UploadState> {
  const user = await requireUser();
  const seq = Number(fd.get("seq"));

  const loaded = await loadIssue(fd, seq);
  if (!loaded) return { error: "이슈를 찾을 수 없습니다." };
  const { project, issue } = loaded;

  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "파일을 선택하세요." };

  for (const f of files) {
    if (f.size > MAX_BYTES) {
      return { error: `${f.name} — 파일이 너무 큽니다 (최대 ${formatBytes(MAX_BYTES)})` };
    }
    if (!ALLOWED_TYPES.has(f.type)) {
      return { error: `${f.name} — 올릴 수 없는 형식입니다 (${f.type || "알 수 없음"})` };
    }
  }


  for (const f of files) {
    const storedPath = await saveFile(project.key, f);
    await prisma.$transaction([
      prisma.attachment.create({
        data: {
          issueId: issue.id,
          fileName: f.name.slice(0, 255),
          storedPath,
          mimeType: f.type,
          sizeBytes: f.size,
          uploadedById: user.id,
        },
      }),
      // 첨부도 이슈의 변경이다. 누가 언제 올렸는지 이력에 남긴다.
      prisma.issueHistory.create({
        data: {
          issueId: issue.id,
          field: "attachment",
          oldValue: null,
          newValue: f.name.slice(0, 255),
          changedById: user.id,
          changedByRole: user.role,
        },
      }),
    ]);
  }

  revalidateIssue(project.key, seq);
  return { ok: Date.now() };
}

export async function deleteAttachment(fd: FormData) {
  const user = await requireUser();
  const seq = Number(fd.get("seq"));
  const id = Number(fd.get("id"));

  const loaded = await loadIssue(fd, seq);
  if (!loaded) return;
  const { project, issue } = loaded;

  const att = await prisma.attachment.findUnique({ where: { id } });
  // 다른 이슈의 첨부를 지우지 못하게 한다. id 만 믿으면 안 된다.
  if (!att || att.issueId !== issue.id) return;

  await prisma.$transaction([
    prisma.attachment.delete({ where: { id } }),
    prisma.issueHistory.create({
      data: {
        issueId: issue.id,
        field: "attachment",
        oldValue: att.fileName,
        newValue: null,
        changedById: user.id,
        changedByRole: user.role,
      },
    }),
  ]);

  // DB 를 먼저 지우고 파일을 지운다. 순서가 반대면 파일만 사라지고 기록이 남는다.
  await deleteFile(att.storedPath);

  revalidateIssue(project.key, seq);
}
