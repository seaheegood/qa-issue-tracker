import "server-only";

import type { Choice, MasterField } from "@/lib/import-map";
import { prisma } from "@/lib/prisma";
import { REPRO_RATE_LABEL, REPRO_RATES } from "@/lib/ui";

/**
 * 고객사 이슈리스트(임포트) 공통 (FR-907 · `docs/피드백` FB-009).
 *
 * ★ **열 순서를 만드는 곳은 여기 하나다.**
 *   목록 화면과 엑셀 내보내기가 같은 `visibleColumns()` 를 쓴다.
 *   복제하면 *"화면 순서와 파일 순서가 다르다"* 가 생기는데, 그건 이슈 쪽에서
 *   이미 한 번 겪고 `buildWhere()` 를 한 곳으로 모은 이유와 똑같은 문제다
 *   (`src/lib/issue-filter.ts` · `export/route.ts`).
 */

/** 한 번에 받을 수 있는 행 수. 넘으면 자른다 — `xlsx-read.ts` 의 MAX_ROWS 와 짝이다. */
export const MAX_IMPORT_ROWS = 20000;

/** 원본 행 하나. 키는 **원본 열 번호(0-based)**, 빈 칸은 아예 없다. */
export type Cells = Record<string, string>;

export type ImportColumn = {
  id: number;
  sourceIndex: number;
  sourceHeader: string;
  label: string;
  isSelected: boolean;
  sortOrder: number;
};

/** `cells` 는 Prisma 의 Json 이라 그대로는 못 읽는다. 한 곳에서만 좁힌다. */
export function cellsOf(v: unknown): Cells {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Cells) : {};
}

/**
 * 화면·파일에 실제로 나갈 열을, **사람이 정한 순서대로**.
 *
 * ★ 목록·열 설정·내보내기 셋이 전부 이 함수를 부른다.
 */
export function visibleColumns(cols: ImportColumn[]): ImportColumn[] {
  return cols.filter((c) => c.isSelected).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** 열 하나의 값. 없으면 빈 문자열 — `undefined` 를 화면까지 들고 가지 않는다. */
export function cellAt(cells: Cells, col: ImportColumn): string {
  return cells[String(col.sourceIndex)] ?? "";
}

/**
 * 목록 하나를 열·행까지 통째로 읽는다.
 *
 * ★ 프로젝트를 함께 확인한다. `id` 만으로 찾으면 주소를 바꿔치기해
 *   **다른 프로젝트의 목록**을 볼 수 있다.
 */
export async function loadList(projectId: number, listId: number) {
  const list = await prisma.importedList.findFirst({
    where: { id: listId, projectId },
    include: {
      createdBy: { select: { id: true, name: true } },
      columns: { orderBy: { sortOrder: "asc" } },
    },
  });
  return list;
}

/** 원본 헤더가 비어 있을 때 쓸 이름. 엑셀 열 이름을 그대로 보여준다 (`C열`). */
export function fallbackLabel(sourceIndex: number): string {
  let s = "";
  for (let n = sourceIndex + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return `${s}열`;
}

// ── 이슈 대량등록 (2026-09-16 · 팀장 지시) ──────────────────

/**
 * **대상 프로젝트의** 마스터 선택지.
 *
 * ★ 올린 프로젝트가 아니라 **이슈가 들어갈 프로젝트**의 것이어야 한다.
 *   파일은 여기서 열었지만 이슈는 저기로 들어가는 일이 실제로 있다 (팀장 지시).
 *   올린 쪽 마스터로 대조하면 *"화면에서는 골랐는데 등록이 안 되는"* 일이 난다.
 *
 * ★ `isActive` 를 존중한다 — 등록 화면과 같은 규칙이다 (`A-70`).
 *   쓰지 않기로 한 값으로 **새 이슈를 만들 수는 없다.**
 */
export async function masterChoices(projectId: number): Promise<Record<MasterField, Choice[]>> {
  const pick = { id: true, code: true, name: true } as const;
  const where = { projectId, isActive: true } as const;
  const order = { sortOrder: "asc" } as const;

  const [priority, environment, system, platform] = await Promise.all([
    prisma.priority.findMany({ where, select: pick, orderBy: order }),
    prisma.environment.findMany({ where, select: pick, orderBy: order }),
    prisma.system.findMany({ where, select: pick, orderBy: order }),
    prisma.platform.findMany({ where, select: pick, orderBy: order }),
  ]);

  return {
    priority,
    environment,
    system,
    platform,
    // ★ 재현율만 표가 아니라 enum 이다 (`CloseReason` 과 같은 성격 — `docs/11` N-59).
    //   그래서 `id` 가 없다. 0 을 쓰되 **이 값으로 FK 를 걸지 않는다.**
    reproRate: REPRO_RATES.map((code) => ({ id: 0, code, name: REPRO_RATE_LABEL[code] })),
  };
}

/**
 * 이슈를 만들 때 쓸 **첫 상태**.
 *
 * `is_initial` 이 정본이고, 없으면 `sort_order` 가 가장 작은 것으로 떨어진다 —
 * 새 프로젝트를 손으로 만들다 초기 상태를 안 찍어 둔 경우가 있다.
 */
export async function initialStatusOf(projectId: number) {
  return prisma.issueStatus.findFirst({
    where: { projectId, isActive: true },
    orderBy: [{ isInitial: "desc" }, { sortOrder: "asc" }],
    select: { id: true, name: true },
  });
}

/**
 * 열마다 **실제로 들어 있는 값**의 가짓수.
 *
 * ★ 매핑 화면이 *"못 맞춘 값"* 을 보여주려면 이게 필요하다. 이름만 보고는
 *   `중요도` 열에 `치명`이 들어 있는지 `P1`이 들어 있는지 알 수 없다 (`IM-26` 과 같은 이유).
 *
 * ⚠️ 가짓수가 많은 열은 **아예 안 보낸다** (`tooMany`). 자유 입력 칸(이슈 내용·비고)은
 *   값이 행 수만큼 있어서, 그대로 화면에 실어 보내면 2만 행짜리 목록에서
 *   **응답이 수 MB** 가 된다. 그런 열은 어차피 마스터로 대조할 열이 아니다.
 */
export const MAX_DISTINCT = 60;

export type ColumnValues = { sourceIndex: number; values: string[]; tooMany: boolean };

export function distinctValues(
  rows: readonly { cells: unknown }[],
  cols: readonly ImportColumn[],
): ColumnValues[] {
  const sets = new Map<number, Set<string>>();
  for (const c of cols) sets.set(c.sourceIndex, new Set());

  for (const r of rows) {
    const cells = cellsOf(r.cells);
    for (const c of cols) {
      const set = sets.get(c.sourceIndex)!;
      if (set.size > MAX_DISTINCT) continue;          // 이미 넘쳤다. 더 모을 이유가 없다
      const v = (cells[String(c.sourceIndex)] ?? "").trim();
      if (v) set.add(v);
    }
  }

  return cols.map((c) => {
    const set = sets.get(c.sourceIndex)!;
    const tooMany = set.size > MAX_DISTINCT;
    return {
      sourceIndex: c.sourceIndex,
      values: tooMany ? [] : [...set].sort((a, b) => a.localeCompare(b, "ko")),
      tooMany,
    };
  });
}
