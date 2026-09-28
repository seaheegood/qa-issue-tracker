import type { Prisma, TeamRole } from "@prisma/client";

/**
 * 변경 이력을 쓰는 **한 곳**.
 *
 * ★ 왜 모았나.
 *   쓰는 자리가 **아홉 군데**였다 — 상태 변경 · 속성 편집 · 플랫폼 · 본문 ·
 *   첨부 올리기/지우기 · 중복 지정 · 일괄 편집 둘. 규칙도 같이 아홉 벌이었다:
 *
 *     · 값이 안 바뀌면 안 남긴다
 *     · 이슈 update 와 이력 create 는 **같은 트랜잭션**
 *     · `field` 는 영문 키만 (한글을 넣으면 나중에 이름을 바꿀 때 과거를 못 읽는다)
 *     · 값은 id 가 아니라 **표시용 이름** (마스터가 바뀌어도 읽혀야 한다)
 *
 *   2026-09-17 에 코멘트 수정·삭제를 이력에 넣으면서 **열 번째 복제**가 생길 참이었다.
 *   `buildWhere` 를 한 곳에 둔 것과 같은 이유로 여기 모은다.
 *
 * ⚠️ **append-only.** 이력은 UPDATE·DELETE 하지 않는다 — 그러면 기록이 아니다.
 */

/**
 * 이력에 쓰는 칸 이름.
 *
 * ⚠️ **영문 스네이크만.** 화면에 보일 이름은 `HistoryList` 가 붙인다.
 * ★ `comment`·`comment_deleted` 는 2026-09-17 신설 — 코멘트도 이슈에 일어난 일이다.
 */
export type HistoryField =
  | "title" | "content" | "test_path" | "expected"
  | "screen" | "external_ref" | "found_version" | "fixed_version"
  | "status" | "assignee" | "priority" | "environment" | "system"
  | "round" | "repro" | "platform" | "relation" | "attachment"
  | "comment" | "comment_deleted"
  /// ★ 지라 티켓 키 (2026-09-21). 보낸 것과 손으로 적어 둔 것 **둘 다** 여기 남는다
  | "jira"
  | "deleted" | "restored";

export type Actor = { id: number; role?: TeamRole | null };

/**
 * 이력 한 줄을 만든다. **트랜잭션에 넣을 수 있게 «데이터»만 돌려준다** —
 * 여기서 직접 쓰지 않는다. 이슈 수정과 이력이 따로 커밋되면
 * 한쪽만 남는 순간이 생긴다.
 */
export function historyRow(
  issueId: number,
  field: HistoryField,
  oldValue: string | null,
  newValue: string | null,
  by: Actor,
  note?: string | null,
): Prisma.IssueHistoryCreateManyInput {
  return {
    issueId,
    field,
    oldValue,
    newValue,
    changedById: by.id,
    changedByRole: by.role ?? null,
    ...(note ? { note } : {}),
  };
}

/**
 * **값이 안 바뀌었으면 `null`.** 부르는 쪽이 `if` 를 아홉 번 쓰지 않게 한다.
 *
 * ⚠️ `undefined` 와 `null` 을 같은 것으로 본다 — DB 에서 온 값은 `null`,
 *   폼에서 온 값은 `undefined` 일 수 있는데 **둘 다 «없음»** 이다.
 *   구분하면 *"비어 있던 칸을 비웠다"* 가 이력에 남는다.
 */
export function changed(
  issueId: number,
  field: HistoryField,
  before: string | null | undefined,
  after: string | null | undefined,
  by: Actor,
  note?: string | null,
): Prisma.IssueHistoryCreateManyInput | null {
  const a = before ?? null;
  const b = after ?? null;
  if (a === b) return null;
  return historyRow(issueId, field, a, b, by, note);
}

/** 여러 줄에서 `null`(안 바뀐 것)을 걸러 낸다 */
export const rows = (
  xs: (Prisma.IssueHistoryCreateManyInput | null)[],
): Prisma.IssueHistoryCreateManyInput[] => xs.filter((x) => x !== null);
