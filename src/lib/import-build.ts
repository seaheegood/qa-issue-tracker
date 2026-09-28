/**
 * 원본 행 하나 → 이슈 하나. **매핑을 실제로 적용하는 곳** (2026-09-16 · 이슈 대량등록).
 *
 * ★ **prisma 를 부르지 않는다.** 필요한 마스터·사람은 부르는 쪽이 한 번에 읽어 넘긴다.
 *   행마다 DB 를 뒤지면 240행에 쿼리가 수천 번 나간다.
 *
 * ★ **미리보기와 등록이 같은 함수를 쓴다.** 미리보기에서 "236건 됩니다" 라고 해 놓고
 *   등록에서 다른 수가 나오면, 그 뒤로 이 화면의 어떤 숫자도 못 믿는다
 *   (대시보드에서 배운 것 — *"화면의 숫자 = 링크 결과 건수"*).
 */

import type { Cells } from "@/lib/imports";
import {
  FIELD_LABEL,
  matchChoice,
  parseImportDate,
  REQUIRED_MASTERS,
  toTargetField,
  valueMapOf,
  type Choice,
  type ImportPlan,
  type MasterField,
  type TargetField,
} from "@/lib/import-map";

/** 매핑이 끝난 열 하나. `ImportedColumn` 에서 필요한 것만 좁혀 받는다. */
export type MappedColumn = {
  sourceIndex: number;
  label: string;
  targetField: TargetField | null;
  valueMap: Record<string, string>;
};

export type Person = { id: number; name: string; loginId: string };

export type BuildCtx = {
  cols: readonly MappedColumn[];
  plan: ImportPlan;
  /** 대상 프로젝트의 마스터. 재현율만 표가 없어 `id` 가 0 이다 */
  masters: Record<MasterField, Choice[]>;
  people: readonly Person[];
  /** 작성자를 못 맞췄을 때 쓸 사람 = **올린 사람** */
  uploaderId: number;
  /** 발생일을 못 읽었을 때 쓸 시각 = **지금** */
  now: Date;
};

export type BuiltIssue = {
  title: string;
  content: string | null;
  testPath: string | null;
  expected: string | null;
  foundVersion: string | null;
  legacyScreenName: string | null;
  externalRef: string | null;
  reproRate: string | null;
  priorityId: number;
  environmentId: number;
  systemId: number;
  platformIds: number[];
  reporterId: number;
  reportedAt: Date;
};

export type BuildResult = { ok: true; issue: BuiltIssue } | { ok: false; error: string };

const MAX: Partial<Record<TargetField, number>> = {
  title: 200, content: 5000, testPath: 2000, expected: 3000,
  foundVersion: 50, legacyScreenName: 200, externalRef: 50,
};

/** 이 칸으로 매핑된 열의 값. 열이 없거나 칸이 비었으면 빈 문자열. */
function raw(cells: Cells, cols: readonly MappedColumn[], field: TargetField): string {
  const col = cols.find((c) => c.targetField === field);
  if (!col) return "";
  return (cells[String(col.sourceIndex)] ?? "").trim();
}

function text(cells: Cells, cols: readonly MappedColumn[], field: TargetField): string | null {
  const v = raw(cells, cols, field);
  if (!v) return null;
  const max = MAX[field];
  return max ? v.slice(0, max) : v;
}

/**
 * 마스터 한 칸을 정한다.
 *
 * | 열이 | 값이 | 어떻게 되나 |
 * |---|---|---|
 * | 있다 | 맞았다 | 그 값 |
 * | 있다 | **못 맞췄다** | ★ **오류다.** 기본값으로 조용히 떨어뜨리지 않는다 — 값이 적혀 있는데 다른 값으로 넣으면 **아무도 틀린 줄 모른다** |
 * | 있다 | 비었다 | 기본값 (칸이 비었다는 건 정보가 없다는 뜻이라 지어내는 게 아니다) |
 * | 없다 | — | 기본값 |
 */
function master(
  cells: Cells,
  ctx: BuildCtx,
  field: MasterField,
): { ok: true; choice: Choice | null } | { ok: false; error: string } {
  const choices = ctx.masters[field];
  const col = ctx.cols.find((c) => c.targetField === field);
  const value = col ? (cells[String(col.sourceIndex)] ?? "").trim() : "";

  let code: string | undefined;
  if (value) {
    code = col!.valueMap[value] ?? matchChoice(value, choices) ?? undefined;
    if (!code) {
      return { ok: false, error: `${col!.label} 의 '${value}' 를 어느 값으로 넣을지 정하지 않았습니다.` };
    }
  } else {
    code = ctx.plan.defaults[field];
  }

  if (!code) return { ok: true, choice: null };
  const hit = choices.find((c) => c.code === code);
  if (!hit) return { ok: false, error: `'${code}' 는 대상 프로젝트에 없는 값입니다. 매핑을 다시 저장해 주세요.` };
  return { ok: true, choice: hit };
}

/** 행 하나를 이슈 한 건으로. 안 되면 **왜 안 되는지**를 돌려준다 (그 행만 실패한다). */
export function buildIssue(cells: Cells, ctx: BuildCtx): BuildResult {
  const title = text(cells, ctx.cols, "title");
  if (!title) return { ok: false, error: "이슈타이틀로 고른 열이 비어 있습니다." };

  // 필수 마스터 셋. 하나라도 못 정하면 **그 행만** 실패한다.
  const need: Partial<Record<MasterField, Choice>> = {};
  for (const f of REQUIRED_MASTERS) {
    const r = master(cells, ctx, f);
    if (!r.ok) return r;
    if (!r.choice) return { ok: false, error: `${FIELD_LABEL[f]} 를 정하지 못했습니다.` };
    need[f] = r.choice;
  }
  const priority = need.priority!;
  const environment = need.environment!;
  const system = need.system!;

  const pf = master(cells, ctx, "platform");
  if (!pf.ok) return pf;
  const rr = master(cells, ctx, "reproRate");
  if (!rr.ok) return rr;

  /**
   * 작성자 — 못 맞추면 **올린 사람**이다 (사용자 확정).
   *
   * ★ 여기서는 행을 실패시키지 않는다. 고객사 파일의 작성자는 우리 계정이 아닌 일이
   *   대부분이라(고객사 담당자 이름), 실패로 두면 **전부 안 들어간다.**
   *   누가 넣었는지는 어차피 `imported_rows` 가 원본으로 들고 있다.
   */
  const who = raw(cells, ctx.cols, "reporter");
  const mapped = ctx.cols.find((c) => c.targetField === "reporter")?.valueMap[who];
  const byMap = mapped ? ctx.people.find((p) => String(p.id) === mapped) : undefined;
  const byName = who
    ? ctx.people.find((p) => p.name === who || p.loginId === who.toLowerCase())
    : undefined;
  const reporterId = byMap?.id ?? byName?.id ?? ctx.uploaderId;

  // 발생일 — 못 읽으면 오늘. 지어내는 게 아니라 **적재 시각**이고, 원본은 남아 있다.
  const reportedAt = parseImportDate(raw(cells, ctx.cols, "reportedAt")) ?? ctx.now;

  return {
    ok: true,
    issue: {
      title,
      content: text(cells, ctx.cols, "content"),
      testPath: text(cells, ctx.cols, "testPath"),
      expected: text(cells, ctx.cols, "expected"),
      foundVersion: text(cells, ctx.cols, "foundVersion"),
      legacyScreenName: text(cells, ctx.cols, "legacyScreenName"),
      externalRef: text(cells, ctx.cols, "externalRef"),
      reproRate: rr.choice?.code ?? null,
      priorityId: priority.id,
      environmentId: environment.id,
      systemId: system.id,
      platformIds: pf.choice ? [pf.choice.id] : [],
      reporterId,
      reportedAt,
    },
  };
}

/** 매핑이 등록을 시작할 수 있는 상태인가. 화면의 버튼과 서버가 **같은 함수**로 판단한다. */
export function whyCannotCommit(
  cols: readonly MappedColumn[],
  plan: ImportPlan,
  hasTargetProject: boolean,
): string | null {
  if (!hasTargetProject) return "이슈를 넣을 프로젝트를 먼저 고르세요.";
  if (!cols.some((c) => c.targetField === "title")) {
    return "이슈타이틀로 쓸 열을 고르세요. 제목이 없으면 목록에서 아무것도 안 보입니다.";
  }
  for (const f of REQUIRED_MASTERS) {
    const hasCol = cols.some((c) => c.targetField === f);
    if (!hasCol && !plan.defaults[f]) {
      return `${FIELD_LABEL[f]} 를 엑셀 열에서 가져오거나 '전부 이 값으로' 를 골라 주세요.`;
    }
  }
  return null;
}

/** `ImportedColumn` 행을 `MappedColumn` 으로. **매핑을 읽는 곳을 한 군데로** 모은다. */
export function toMapped(
  rows: readonly { sourceIndex: number; label: string; targetField: string | null; valueMap: unknown }[],
): MappedColumn[] {
  return rows.map((c) => ({
    sourceIndex: c.sourceIndex,
    label: c.label,
    targetField: toTargetField(c.targetField),
    valueMap: valueMapOf(c.valueMap),
  }));
}
