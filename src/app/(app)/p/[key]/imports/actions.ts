"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import {
  buildIssue, toMapped, whyCannotCommit,
  type BuildCtx, type BuiltIssue,
} from "@/lib/import-build";
import {
  EMPTY_PLAN, FIELD_LABEL, isMasterField, MASTER_FIELDS, readPlan, toTargetField,
  valueMapOf, writePlan, type ImportPlan, type TargetField,
} from "@/lib/import-map";
import {
  cellsOf, fallbackLabel, initialStatusOf, masterChoices, MAX_IMPORT_ROWS,
} from "@/lib/imports";
import { people } from "@/lib/people";
import { prisma } from "@/lib/prisma";
import { projectFromForm } from "@/lib/project";
import { MAX_BYTES } from "@/lib/storage";
import { toReproRate } from "@/lib/ui";
import { emptyColumns, guessHeaderRow, openXlsx, XlsxError } from "@/lib/xlsx-read";

// ★ 타입과 상수는 `wizard-types.ts` 에 있다 — `"use server"` 파일은 **async 함수만**
//   내보낼 수 있어서, 상수를 여기 두면 서버 컴포넌트가 불러오는 순간 500 이 난다.
import type {
  ColumnState, CommitState, MappingState, SheetSummary, TargetState, WizardState,
} from "./wizard-types";

/**
 * 고객사 이슈리스트 임포트 (FR-907 · `docs/피드백` FB-009).
 *
 * ★ **파일을 서버에 임시로 두지 않는다.**
 *   업로드 마법사는 두 걸음(시트 고르기 → 저장)인데, 그 사이에 파일을 storage 에
 *   맡겼다가 지우는 방식을 쓰지 않았다. 임시 파일은 **지우는 걸 잊으면 남는다** —
 *   그것도 실명이 든 사내 자료가. 대신 `<input type=file>` 을 화면에 그대로 둬서
 *   브라우저가 파일을 들고 있게 하고, 두 걸음 모두 그 파일을 같이 보낸다.
 *   사내망에서 몇 MB 를 한 번 더 보내는 값이 임시 파일 관리보다 싸다.
 */

const MAX_PREVIEW_ROWS = 12;
const MAX_PREVIEW_COLS = 30;

function fail(prev: WizardState, error: string): WizardState {
  // ★ 걸음을 되돌리지 않는다. 2걸음에서 틀렸는데 1걸음으로 튕기면
  //   고른 시트와 미리보기가 통째로 날아가 처음부터 다시 해야 한다.
  return { ...prev, error };
}

/**
 * 마법사의 두 걸음을 한 액션이 맡는다.
 *
 * 폼이 하나라서 `<input type=file>` 이 계속 살아 있고, 두 걸음이 같은 파일을 보낸다.
 */
export async function importAction(prev: WizardState, fd: FormData): Promise<WizardState> {
  const user = await requireUser();
  const project = await projectFromForm(fd);
  if (!project) return fail(prev, "프로젝트를 찾을 수 없습니다.");

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail(prev, "엑셀 파일을 골라주세요.");
  }
  if (file.size > MAX_BYTES) {
    return fail(prev, `파일이 너무 큽니다. ${Math.floor(MAX_BYTES / 1024 / 1024)}MB 까지 올릴 수 있습니다.`);
  }
  if (!/\.xlsx$/i.test(file.name)) {
    // 확장자만 본다. `.xls` 와 `.csv` 를 여기서 걸러야 "왜 안 되는지"를 말해 줄 수 있다.
    return fail(prev, "`.xlsx` 파일만 올릴 수 있습니다. 엑셀에서 '다른 이름으로 저장 → .xlsx' 로 바꿔 주세요.");
  }

  let wb;
  try {
    wb = openXlsx(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    // XlsxError 는 사람에게 보여줄 문장을 이미 들고 있다.
    if (e instanceof XlsxError) return fail(prev, e.message);
    throw e;
  }

  if (wb.sheets.length === 0) return fail(prev, "시트가 하나도 없는 파일입니다.");

  // ── 1걸음: 시트를 훑어 보여준다 ─────────────────────────
  if (String(fd.get("step")) !== "save") {
    const sheets: SheetSummary[] = wb.sheets.map((s) => {
      const g = wb.readSheet(s.name);
      return {
        name: s.name,
        hidden: s.hidden,
        rowCount: g.rowCount,
        colCount: g.colCount,
        headerGuess: guessHeaderRow(g),
        emptyCols: [...emptyColumns(g)],
        preview: g.rows.slice(0, MAX_PREVIEW_ROWS).map((r) =>
          Array.from({ length: Math.min(g.colCount, MAX_PREVIEW_COLS) }, (_, i) => r[i] ?? ""),
        ),
      };
    });
    return { step: "configure", fileName: file.name, sheets };
  }

  // ── 2걸음: 고른 대로 저장한다 ───────────────────────────
  const sheetName = String(fd.get("sheet") ?? "");
  const sheet = wb.sheets.find((s) => s.name === sheetName);
  if (!sheet) return fail(prev, "시트를 골라주세요.");

  const grid = wb.readSheet(sheetName);
  const headerRow = Number(fd.get("headerRow"));
  const dataRow = Number(fd.get("dataRow"));

  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > grid.rowCount) {
    return fail(prev, "헤더 행 번호가 표 밖입니다.");
  }
  if (!Number.isInteger(dataRow) || dataRow <= headerRow) {
    return fail(prev, "데이터 시작 행은 헤더 행보다 아래여야 합니다.");
  }
  if (dataRow > grid.rowCount) return fail(prev, "데이터 시작 행 아래에 아무 행도 없습니다.");

  const name = String(fd.get("name") ?? "").trim().slice(0, 120)
    || `${file.name.replace(/\.xlsx$/i, "")} · ${sheetName}`;

  const header = grid.rows[headerRow - 1] ?? [];
  const blank = emptyColumns(grid);

  // ★ **전 열을 넣는다.** 고른 것만 넣지 않는다 — 선택은 되돌릴 수 있어야 한다.
  //   통째로 빈 열과 머리글도 값도 없는 열은 체크만 꺼 둔다.
  //   (고객사 파일은 35열 중 A 와 R~AI 가 비어 있어 실제로는 16열이었다)
  const columns = Array.from({ length: grid.colCount }, (_, i) => {
    const raw = (header[i] ?? "").trim();
    return {
      sourceIndex: i,
      sourceHeader: raw.slice(0, 255),
      label: (raw || fallbackLabel(i)).slice(0, 255),
      isSelected: !blank.has(i) && raw !== "",
      sortOrder: i,
    };
  });
  if (columns.every((c) => !c.isSelected)) {
    return fail(prev, "고른 행에 머리글이 없습니다. 헤더 행을 다시 골라 주세요.");
  }

  const body = grid.rows.slice(dataRow - 1, dataRow - 1 + MAX_IMPORT_ROWS);
  const rows = body
    .map((r, i) => {
      const cells: Record<string, string> = {};
      for (let c = 0; c < grid.colCount; c++) {
        const v = r[c] ?? "";
        if (v !== "") cells[String(c)] = v;      // 빈 칸은 넣지 않는다 — JSON 이 쓸데없이 커진다
      }
      return { rowNo: dataRow + i, cells };
    })
    .filter((r) => Object.keys(r.cells).length > 0);   // 중간의 빈 행은 버린다

  if (rows.length === 0) return fail(prev, "가져올 행이 없습니다. 데이터 시작 행을 다시 골라 주세요.");

  const created = await prisma.$transaction(async (tx) => {
    const list = await tx.importedList.create({
      data: {
        projectId: project.id,
        name,
        sourceFile: file.name.slice(0, 255),
        sheetName: sheetName.slice(0, 200),
        headerRow,
        dataRow,
        rowCount: rows.length,
        createdById: user.id,
      },
      select: { id: true },
    });
    await tx.importedColumn.createMany({
      data: columns.map((c) => ({ ...c, listId: list.id })),
    });
    // 행은 나눠 넣는다. 2만 행을 한 문장으로 보내면 MySQL 의 max_allowed_packet 에 걸린다.
    for (let i = 0; i < rows.length; i += 500) {
      await tx.importedRow.createMany({
        data: rows.slice(i, i + 500).map((r) => ({ ...r, listId: list.id })),
      });
    }
    return list;
  }, { timeout: 60000 });

  revalidatePath(`/p/${project.key}/imports`);

  // ★ 곧바로 **열 설정**으로 보낸다. 사용자가 요구한 게 그 화면이다 —
  //   *"차출할 컬럼을 선택하고 그 순서를 설정"*.
  redirect(`/p/${project.key}/imports/${created.id}/columns?new=1`);
}

// ── 열 설정 ────────────────────────────────────────────────

/**
 * 고른 열과 그 순서를 저장한다.
 *
 * ★ 여기서 정한 순서가 **목록 화면과 엑셀 내보내기 양쪽**을 정한다 (사용자 결정).
 *   그래서 순서를 두 벌로 나눠 갖지 않는다.
 */
export async function saveColumns(_prev: ColumnState, fd: FormData): Promise<ColumnState> {
  /**
   * ★ **오류가 나면 적던 것을 돌려준다.**
   *   이 화면의 입력칸은 비제어라 값이 DOM 에만 있고,
   *   React 19 가 폼을 초기화하면 **손으로 고친 열 이름이 원래대로 돌아간다.**
   *   35열짜리 파일에서 그러면 다시 다 치게 된다 (`issues/new` 와 같은 장치).
   */
  const keep = () => {
    const labels: Record<string, string> = {};
    for (const [k, v] of fd.entries()) {
      if (k.startsWith("label_")) labels[k.slice(6)] = String(v);
    }
    return { name: String(fd.get("name") ?? ""), labels };
  };
  const fail = (error: string): ColumnState => ({ error, at: Date.now(), values: keep() });

  await requireUser();
  const project = await projectFromForm(fd);
  if (!project) return fail("프로젝트를 찾을 수 없습니다.");

  const listId = Number(fd.get("listId"));
  const list = await prisma.importedList.findFirst({
    where: { id: listId, projectId: project.id },
    include: { columns: true },
  });
  if (!list) return fail("목록을 찾을 수 없습니다.");

  // `order` 는 열 id 를 화면에 놓인 순서대로 이어 붙인 것이다.
  const order = String(fd.get("order") ?? "").split(",").map(Number).filter(Number.isInteger);
  const known = new Set(list.columns.map((c) => c.id));
  if (order.length !== known.size || !order.every((id) => known.has(id))) {
    return fail("열 순서가 어긋났습니다. 새로고침 뒤 다시 시도해 주세요.");
  }

  const picked = new Set(
    String(fd.get("selected") ?? "").split(",").map(Number).filter(Number.isInteger),
  );
  if (picked.size === 0) return fail("적어도 한 열은 골라야 합니다.");

  const name = String(fd.get("name") ?? "").trim().slice(0, 120);

  await prisma.$transaction([
    ...(name ? [prisma.importedList.update({ where: { id: list.id }, data: { name } })] : []),
    ...order.map((id, i) =>
      prisma.importedColumn.update({
        where: { id },
        data: {
          sortOrder: i,
          isSelected: picked.has(id),
          label: String(fd.get(`label_${id}`) ?? "").trim().slice(0, 255)
            || list.columns.find((c) => c.id === id)!.label,
        },
      }),
    ),
  ]);

  revalidatePath(`/p/${project.key}/imports`);
  revalidatePath(`/p/${project.key}/imports/${list.id}`);
  revalidatePath(`/p/${project.key}/imports/${list.id}/columns`);
  return { ok: `열 ${picked.size}개를 고른 순서대로 저장했습니다.`, at: Date.now() };
}

/**
 * 목록을 지운다.
 *
 * ★ 만든 사람이나 관리자만. 임포트는 **되돌리기 쉬운 일**이라 (파일을 다시 올리면 된다)
 *   이슈처럼 지우지 못하게 막지는 않는다.
 */
export async function deleteList(fd: FormData): Promise<void> {
  const user = await requireUser();
  const project = await projectFromForm(fd);
  if (!project) return;

  const listId = Number(fd.get("listId"));
  const list = await prisma.importedList.findFirst({
    where: { id: listId, projectId: project.id },
    select: { id: true, createdById: true },
  });
  if (!list) return;
  if (list.createdById !== user.id && user.systemRole !== "ADMIN") return;

  // 열·행은 FK 의 ON DELETE CASCADE 로 같이 간다.
  await prisma.importedList.delete({ where: { id: list.id } });

  revalidatePath(`/p/${project.key}/imports`);
  redirect(`/p/${project.key}/imports`);
}

// ══════════════════════════════════════════════════════════
//  이슈 대량등록 (2026-09-16 · 팀장 지시)
//
//  ★ 원본 보관은 **그대로 남긴다.** 이슈를 만든 뒤에도 `imported_rows` 는 안 지운다 —
//    잘못 들어갔을 때 대조할 길이 있어야 한다 (사용자 확정).
//  ★ 상태는 매핑하지 않는다. 고객사의 `이슈현황` 은 우리 9종과 다른 체계라
//    억지로 맞추면 **없는 값을 지어낸다** (`docs/11` 13절의 판단 그대로).
// ══════════════════════════════════════════════════════════

/** 대상·매핑·등록이 공통으로 하는 준비. 목록은 **올린 프로젝트의 것인지** 반드시 확인한다. */
async function listForEdit(fd: FormData) {
  const project = await projectFromForm(fd);
  if (!project) return null;
  const listId = Number(fd.get("listId"));
  if (!Number.isInteger(listId)) return null;
  const list = await prisma.importedList.findFirst({
    where: { id: listId, projectId: project.id },
    include: { columns: { orderBy: { sortOrder: "asc" } } },
  });
  return list ? { project, list } : null;
}

/**
 * ④ 대상 — **어느 프로젝트의 어느 차수**로 넣을 것인가.
 *
 * ★ 올린 프로젝트와 달라도 된다 (팀장 지시). 파일은 여기서 열었지만
 *   이슈는 저기로 들어가는 일이 실제로 있다.
 */
export async function saveTarget(_p: TargetState, fd: FormData): Promise<TargetState> {
  await requireUser();
  const found = await listForEdit(fd);
  if (!found) return { error: "목록을 찾을 수 없습니다." };
  const { project, list } = found;

  const key = String(fd.get("target") ?? "").toUpperCase();
  const target = key
    ? await prisma.project.findFirst({ where: { key, status: "ACTIVE" }, select: { id: true } })
    : null;
  if (!target) return { error: "이슈를 넣을 프로젝트를 골라주세요." };

  const roundRaw = String(fd.get("round") ?? "");
  const roundId = roundRaw ? Number(roundRaw) : null;
  const round = roundId
    ? await prisma.round.findFirst({
        where: { id: roundId, projectId: target.id, isActive: true }, select: { id: true },
      })
    : null;
  if (roundId && !round) return { error: "차수를 다시 골라주세요." };

  // ★ 프로젝트가 바뀌면 **값 대조를 버린다.** 마스터는 프로젝트마다 따로라
  //   `CRITICAL` 이 저쪽에도 있으리라는 보장이 없다. 남겨 두면 화면은
  //   "이어 놨다"고 말하는데 등록은 실패한다 — 그게 제일 나쁜 상태다.
  const changed = list.targetProjectId !== target.id;

  await prisma.$transaction(async (tx) => {
    await tx.importedList.update({
      where: { id: list.id },
      data: {
        targetProjectId: target.id,
        targetRoundId: round?.id ?? null,
        ...(changed ? { defaults: writePlan(EMPTY_PLAN) } : {}),
      },
    });
    if (changed) {
      await tx.importedColumn.updateMany({
        where: { listId: list.id },
        data: { valueMap: Prisma.DbNull },
      });
    }
  });

  revalidatePath(`/p/${project.key}/imports/${list.id}/mapping`);
  return {
    ok: changed
      ? "대상을 정했습니다. 프로젝트가 바뀌어 값 대조는 새로 합니다."
      : "대상을 저장했습니다.",
  };
}

/** 화면이 보낸 값 대조표. **모르는 코드는 버린다** — 폼에서 온 값을 그대로 믿지 않는다. */
function cleanMap(raw: string, allowed: (code: string) => boolean): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    return {};
  }
  const out = valueMapOf(parsed);
  for (const k of Object.keys(out)) if (!allowed(out[k])) delete out[k];
  return out;
}

/**
 * ③ 매핑 — **열을 이슈의 어느 칸으로** 넣을 것인가 + 못 맞춘 값을 어떻게 이을 것인가.
 */
export async function saveMapping(_p: MappingState, fd: FormData): Promise<MappingState> {
  await requireUser();
  const found = await listForEdit(fd);
  if (!found) return { error: "목록을 찾을 수 없습니다.", at: Date.now() };
  const { project, list } = found;
  if (!list.targetProjectId) return { error: "이슈를 넣을 프로젝트를 먼저 고르세요.", at: Date.now() };

  const [masters, ppl] = await Promise.all([masterChoices(list.targetProjectId), people()]);
  const personIds = new Set(ppl.map((p) => String(p.id)));

  // ★ **한 칸에 한 열만.** 두 열이 같은 칸을 가리키면 어느 쪽이 들어갈지 알 수 없고,
  //   그건 화면이 아니라 코드가 몰래 정하게 된다.
  const used = new Map<TargetField, number>();
  type ColUpdate = { id: number; field: TargetField | null; map: Record<string, string> };
  const updates: ColUpdate[] = [];

  for (const c of list.columns) {
    const field = toTargetField(fd.get(`field_${c.id}`));
    if (field) {
      // ⚠️ `at` 을 빠뜨리면 **같은 오류가 두 번 연속 날 때 폼이 안 살아난다** (IM-69-3).
      //   다섯 갈래 중 여기만 빠져 있었다 — 한 줄짜리 return 은 이렇게 새기 쉽다.
      if (used.has(field))
        return { error: `${FIELD_LABEL[field]} 에 두 열이 걸려 있습니다. 하나만 고르세요.`, at: Date.now() };
      used.set(field, c.id);
    }
    const map = isMasterField(field)
      ? cleanMap(String(fd.get(`map_${c.id}`) ?? ""), (code) => masters[field].some((m) => m.code === code))
      : field === "reporter"
        ? cleanMap(String(fd.get(`map_${c.id}`) ?? ""), (id) => personIds.has(id))
        : {};
    updates.push({ id: c.id, field, map });
  }

  if (!used.has("title")) {
    return { error: "이슈타이틀로 쓸 열을 고르세요. 제목이 없으면 목록에서 아무것도 안 보입니다.", at: Date.now() };
  }

  /**
   * *"전부 이 값으로"* — 열이 없을 때 쓸 값.
   *
   * ★ 열이 **있을 때도** 저장한다. 그때는 *"빈 칸이면 이 값"* 이라는 뜻이다.
   *   값이 적혀 있는데 못 맞춘 경우는 기본값으로 떨어뜨리지 않는다 (`import-build.ts`).
   */
  const defaults: ImportPlan["defaults"] = {};
  for (const f of MASTER_FIELDS) {
    const code = String(fd.get(`default_${f}`) ?? "");
    if (code && masters[f].some((m) => m.code === code)) defaults[f] = code;
  }

  const why = whyCannotCommit(
    updates.map((u) => ({ sourceIndex: 0, label: "", targetField: u.field, valueMap: u.map })),
    { defaults },
    true,
  );
  if (why) return { error: why, at: Date.now() };

  await prisma.$transaction([
    prisma.importedList.update({ where: { id: list.id }, data: { defaults: writePlan({ defaults }) } }),
    ...updates.map((u) =>
      prisma.importedColumn.update({
        where: { id: u.id },
        data: {
          targetField: u.field,
          valueMap: Object.keys(u.map).length ? (u.map as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      }),
    ),
  ]);

  revalidatePath(`/p/${project.key}/imports/${list.id}/mapping`);
  return { ok: `이슈 칸 ${used.size}개를 이었습니다.`, at: Date.now() };
}

/**
 * ⑤ 등록 — 원본 행을 **진짜 이슈로** 만든다.
 *
 * ★ **채번은 한 번에 올린다.** 등록 화면(`issues/new/actions.ts`)은 행마다
 *   `SELECT … FOR UPDATE` 로 하나씩 올리는데, 그건 한 건짜리라 맞는 방법이다.
 *   여기서 그대로 하면 240행이 **줄을 서서** 잠금을 240번 잡는다.
 *   그래서 카운터를 `N` 만큼 **한 번에** 올리고 번호를 행에 나눠 준다.
 *
 * ★ **멱등하다.** 이미 이슈를 만든 행(`imported_rows.issue_id`)은 건너뛴다.
 *   다시 눌러도 두 벌 생기지 않는다 — 실패한 행만 다시 시도된다.
 */
export async function commitImport(_p: CommitState, fd: FormData): Promise<CommitState> {
  const user = await requireUser();
  const found = await listForEdit(fd);
  if (!found) return { error: "목록을 찾을 수 없습니다." };
  const { project, list } = found;

  const target = list.targetProjectId
    ? await prisma.project.findUnique({
        where: { id: list.targetProjectId }, select: { id: true, key: true, name: true },
      })
    : null;

  const cols = toMapped(list.columns);
  const plan = readPlan(list.defaults);
  const why = whyCannotCommit(cols, plan, !!target);
  if (why) return { error: why };

  const [masters, ppl, status] = await Promise.all([
    masterChoices(target!.id),
    people(),
    initialStatusOf(target!.id),
  ]);
  if (!status) return { error: "대상 프로젝트에 이슈 상태가 하나도 없습니다. 설정을 먼저 확인해주세요." };

  const round = list.targetRoundId
    ? await prisma.round.findFirst({
        where: { id: list.targetRoundId, projectId: target!.id }, select: { id: true },
      })
    : null;

  const rows = await prisma.importedRow.findMany({
    where: { listId: list.id },
    orderBy: { rowNo: "asc" },
    select: { id: true, cells: true, issueId: true },
  });

  const skipped = rows.filter((r) => r.issueId !== null).length;
  const todo = rows.filter((r) => r.issueId === null);
  if (todo.length === 0) {
    return { ok: "새로 만들 행이 없습니다. 이미 전부 등록되어 있습니다.", created: 0, failed: 0, skipped };
  }

  const now = new Date();
  const ctx: BuildCtx = { cols, plan, masters, people: ppl, uploaderId: user.id, now };

  const good: { rowId: number; issue: BuiltIssue }[] = [];
  const bad: { rowId: number; error: string }[] = [];
  for (const r of todo) {
    const built = buildIssue(cellsOf(r.cells), ctx);
    if (built.ok) good.push({ rowId: r.id, issue: built.issue });
    else bad.push({ rowId: r.id, error: built.error });
  }

  if (good.length > 0) {
    await prisma.$transaction(async (tx) => {
      const seqRows = await tx.$queryRaw<{ seq: bigint | number }[]>`
        SELECT issue_seq AS seq FROM projects WHERE id = ${target!.id} FOR UPDATE
      `;
      // MySQL 이 BIGINT 로 돌려준다. Prisma 의 Int 에 그대로 넣으면 거부당한다.
      const base = Number(seqRows[0].seq);
      await tx.project.update({
        where: { id: target!.id }, data: { issueSeq: base + good.length },
      });

      const data = good.map((g, i) => ({
        projectId: target!.id,
        seq: base + i + 1,
        title: g.issue.title,
        content: g.issue.content,
        testPath: g.issue.testPath,
        expected: g.issue.expected,
        externalRef: g.issue.externalRef,
        legacyScreenName: g.issue.legacyScreenName,
        foundVersion: g.issue.foundVersion,
        reproRate: toReproRate(g.issue.reproRate) ?? null,
        priorityId: g.issue.priorityId,
        environmentId: g.issue.environmentId,
        systemId: g.issue.systemId,
        reporterId: g.issue.reporterId,
        reportedAt: g.issue.reportedAt,
        roundId: round?.id ?? null,
        statusId: status.id,
        statusChangedAt: now,
      }));

      // 한 문장에 다 실으면 max_allowed_packet 에 걸린다. 적재와 같은 규칙으로 쪼갠다.
      for (let i = 0; i < data.length; i += 200) {
        await tx.issue.createMany({ data: data.slice(i, i + 200) });
      }

      // ★ `createMany` 는 만든 id 를 안 돌려준다. **방금 올린 번호 구간**으로 되받는다 —
      //   `seq` 는 프로젝트 안에서 유일하고(`@@unique([projectId, seq])`),
      //   그 구간은 우리가 잠금 안에서 가져왔으니 남이 끼어들 수 없다.
      const made = await tx.issue.findMany({
        where: { projectId: target!.id, seq: { gte: base + 1, lte: base + good.length } },
        select: { id: true, seq: true },
      });
      const bySeq = new Map(made.map((m) => [m.seq, m.id]));

      const platforms: { issueId: number; platformId: number }[] = [];
      const watchers: { issueId: number; userId: number }[] = [];
      const pairs: [number, number][] = [];
      good.forEach((g, i) => {
        const issueId = bySeq.get(base + i + 1);
        if (!issueId) return;
        pairs.push([g.rowId, issueId]);
        for (const pid of g.issue.platformIds) platforms.push({ issueId, platformId: pid });
        // 작성자는 자기가 올린 이슈를 지켜본다 — 등록 화면과 같다.
        // ⚠️ 알림은 **보내지 않는다.** 240건이 한꺼번에 종을 울리면 아무도 안 읽는다.
        watchers.push({ issueId, userId: g.issue.reporterId });
      });

      for (let i = 0; i < platforms.length; i += 500) {
        await tx.issuePlatform.createMany({ data: platforms.slice(i, i + 500) });
      }
      for (let i = 0; i < watchers.length; i += 500) {
        await tx.issueWatcher.createMany({ data: watchers.slice(i, i + 500), skipDuplicates: true });
      }

      // ★ 행마다 `update` 를 부르면 2만 행에서 쿼리가 2만 번이다. 한 문장으로 쓴다.
      //   ⚠️ `Unsafe` 지만 **이어 붙이는 값이 전부 DB 에서 온 정수**다 (행 id · 이슈 id).
      //   사람이 친 글자는 한 자도 들어가지 않는다.
      for (let i = 0; i < pairs.length; i += 500) {
        const chunk = pairs.slice(i, i + 500);
        const cases = chunk.map(([rowId, issueId]) => `WHEN ${rowId} THEN ${issueId}`).join(" ");
        const ids = chunk.map(([rowId]) => rowId).join(",");
        await tx.$executeRawUnsafe(
          `UPDATE imported_rows SET issue_id = CASE id ${cases} END, import_error = NULL WHERE id IN (${ids})`,
        );
      }
    }, { timeout: 60000 });
  }

  // 실패한 행은 **왜 실패했는지**를 그 행에 적는다. 같은 이유끼리 묶어 한 번에.
  const byError = new Map<string, number[]>();
  for (const b of bad) {
    const at = byError.get(b.error) ?? [];
    at.push(b.rowId);
    byError.set(b.error, at);
  }
  for (const [error, ids] of byError) {
    await prisma.importedRow.updateMany({ where: { id: { in: ids } }, data: { importError: error } });
  }

  await prisma.importedList.update({
    where: { id: list.id },
    data: { committedAt: new Date(), committedById: user.id },
  });

  revalidatePath(`/p/${project.key}/imports`);
  revalidatePath(`/p/${project.key}/imports/${list.id}`);
  revalidatePath(`/p/${project.key}/imports/${list.id}/mapping`);
  revalidatePath(`/p/${target!.key}/issues`);

  return {
    ok: bad.length === 0
      ? `${good.length}건을 ${target!.name} 이슈로 만들었습니다.`
      : `${good.length}건을 만들었습니다. ${bad.length}건은 실패해 아래에 이유를 적어 뒀습니다.`,
    created: good.length,
    failed: bad.length,
    skipped,
  };
}
