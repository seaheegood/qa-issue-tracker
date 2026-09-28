/**
 * 이슈 대량등록 — **엑셀 열을 이슈의 어느 칸으로 넣을지** 정하는 규칙 (2026-09-16 · 팀장 지시).
 *
 * ── 왜 이 파일이 따로 있나 ───────────────────────────────────
 * 매핑을 고르는 곳(클라이언트 컴포넌트)과 그 매핑으로 이슈를 만드는 곳(서버 액션)이
 * **같은 판단**을 해야 한다. 값 대조 규칙을 양쪽에 각각 쓰면
 * *"화면에서는 맞다고 했는데 등록할 때 못 맞췄다"* 가 생긴다 —
 * `buildWhere()`(`issue-filter.ts`)·`visibleColumns()`(`imports.ts`)를
 * 한 곳에 모아 둔 것과 **똑같은 이유**다.
 *
 * ★ 그래서 이 파일에는 **prisma 를 부르지 않는다.** 순수 함수만 둔다.
 *   `"server-only"` 를 붙이면 클라이언트가 못 쓴다.
 *
 * ── 우리 이슈로 매핑하지 않기로 했던 판단은 어떻게 됐나 ──────
 * `ImportedList` 앞 주석과 `docs/11` 13절은 *"고객사 상태 체계가 우리 9종과 달라
 * 억지로 맞추면 값을 지어낸다"* 고 적었고, 그래서 **보관·조회만** 했다.
 * 팀장 지시로 등록 단계를 덧붙이면서 그 판단을 이렇게 지킨다:
 *
 *   · **상태는 매핑하지 않는다.** 고객사의 `이슈현황` 은 받지 않고, 만든 이슈는
 *     전부 그 프로젝트의 **첫 상태**(보통 `Open`)로 들어간다. 지어낼 값이 없다.
 *   · 값을 못 맞추면 **사람이 고른다.** 자동으로 가장 비슷한 것에 붙이지 않는다.
 *   · **원본은 그대로 남는다.** 잘못 들어갔을 때 대조할 길이 있어야 한다.
 */

/** 이슈의 어느 칸에 넣을 것인가. `null`(= 안 씀)이면 보관만 한다. */
export type TargetField =
  | "title"
  | "content"
  | "testPath"
  | "expected"
  | "priority"
  | "environment"
  | "system"
  | "platform"
  | "reproRate"
  | "foundVersion"
  | "legacyScreenName"
  | "externalRef"
  | "reporter"
  | "reportedAt";

/**
 * 값을 **마스터와 대조해야 하는** 칸.
 *
 * 나머지(글자 칸)는 엑셀 값을 그대로 넣는다 — 대조할 표가 없다.
 */
export type MasterField = "priority" | "environment" | "system" | "platform" | "reproRate";

export const MASTER_FIELDS: readonly MasterField[] = [
  "priority",
  "environment",
  "system",
  "platform",
  "reproRate",
] as const;

/**
 * **이슈를 만들려면 반드시 있어야 하는** 마스터 (`issues` 가 NOT NULL 이다).
 *
 * 엑셀에 그 열이 없으면 화면에서 *"전부 이 값으로"* 를 고르게 한다 —
 * 사용자가 확정한 방식이다. 지어내지 않고 **사람이 한 번 정한다.**
 */
export const REQUIRED_MASTERS: readonly MasterField[] = ["priority", "environment", "system"] as const;

export type FieldDef = {
  key: TargetField;
  label: string;
  /** 어떻게 채우는 칸인가 */
  kind: "text" | "master" | "user" | "date";
  /** 글자 칸의 길이 상한. `issues` 컬럼 길이와 맞춘다 */
  max?: number;
  hint?: string;
};

/**
 * 고를 수 있는 칸과 그 순서. **화면의 차례가 이 순서다.**
 *
 * 맨 위가 `이슈타이틀` 인 이유: **매핑 필수**라서다.
 * 제목 없는 이슈는 목록에서 아무것도 안 보인다 (`I-08`).
 */
export const FIELDS: readonly FieldDef[] = [
  { key: "title", label: "이슈타이틀", kind: "text", max: 200, hint: "목록에 보이는 한 줄. 반드시 골라야 합니다" },
  { key: "content", label: "이슈내용", kind: "text", max: 5000 },
  { key: "testPath", label: "테스트 경로", kind: "text", max: 2000 },
  { key: "expected", label: "테스트 기대값", kind: "text", max: 3000 },
  { key: "priority", label: "우선순위", kind: "master" },
  { key: "environment", label: "환경", kind: "master" },
  { key: "system", label: "시스템", kind: "master" },
  { key: "platform", label: "플랫폼", kind: "master" },
  { key: "reproRate", label: "재현율", kind: "master" },
  { key: "foundVersion", label: "검출 버전", kind: "text", max: 50 },
  { key: "legacyScreenName", label: "화면명", kind: "text", max: 200 },
  { key: "externalRef", label: "QAI #", kind: "text", max: 50 },
  { key: "reporter", label: "작성자", kind: "user", hint: "못 맞추면 올린 사람이 됩니다" },
  { key: "reportedAt", label: "발생일", kind: "date", hint: "못 읽으면 오늘이 됩니다" },
] as const;

export const FIELD_LABEL: Record<TargetField, string> = Object.fromEntries(
  FIELDS.map((f) => [f.key, f.label]),
) as Record<TargetField, string>;

const FIELD_KEYS = new Set<string>(FIELDS.map((f) => f.key));

/** 폼에서 온 값을 그대로 믿지 않는다. 모르는 칸 이름이면 `null`(안 씀). */
export function toTargetField(v: unknown): TargetField | null {
  const s = typeof v === "string" ? v.trim() : "";
  return FIELD_KEYS.has(s) ? (s as TargetField) : null;
}

export function isMasterField(f: TargetField | null): f is MasterField {
  return !!f && (MASTER_FIELDS as readonly string[]).includes(f);
}

// ── 값 대조 ────────────────────────────────────────────────

/** 고를 수 있는 값 하나. 재현율처럼 표가 없는 것은 `id` 가 0 이다. */
export type Choice = { id: number; code: string; name: string };

/**
 * 대조용으로 값을 납작하게 만든다.
 *
 * ★ 고객사 엑셀 표기가 우리 마스터 이름과 **글자까지 같은 일은 없다.**
 *   `개발 (Dev)` · `개발(DEV)` · `dev` 가 전부 같은 것을 가리킨다.
 *   그래서 공백·괄호·기호를 털고 소문자로 눕혀서 본다.
 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s()[\]{}<>_\-./,·:;'"`]/g, "")
    .trim();
}

/** 한 값에서 뽑아낼 수 있는 대조 후보들. `개발(Dev)` 은 `개발` 로도 쳐 준다. */
function keysOf(s: string): string[] {
  const out = [norm(s)];
  const bare = s.replace(/\(.*?\)/g, "");
  const n = norm(bare);
  if (n && n !== out[0]) out.push(n);
  return out.filter(Boolean);
}

/**
 * 엑셀 값 하나를 마스터 코드로. 못 맞추면 `null`.
 *
 * ★ **가장 비슷한 것으로 붙이지 않는다.** 부분 일치·편집거리 같은 추측을 넣으면
 *   `Minor` 가 `Major` 로 들어가고, 그 이슈는 **아무도 틀린 줄 모른다.**
 *   못 맞춘 값은 화면이 사람에게 물어본다.
 */
export function matchChoice(value: string, choices: readonly Choice[]): string | null {
  const ks = keysOf(value);
  if (ks.length === 0) return null;
  for (const c of choices) {
    const cand = [...keysOf(c.code), ...keysOf(c.name)];
    if (cand.some((x) => ks.includes(x))) return c.code;
  }
  return null;
}

/**
 * 한 열의 값들을 훑어 **못 맞춘 것만** 골라낸다.
 *
 * 돌려주는 map 은 **맞춘 것까지 전부** 담는다 — 나중에 마스터 이름이 바뀌어도
 * 그때 무엇으로 이었는지가 남아야 한다 (`ImportedColumn.valueMap` 에 그대로 저장한다).
 */
export function autoMap(values: readonly string[], choices: readonly Choice[]) {
  const map: Record<string, string> = {};
  const unmatched: string[] = [];
  for (const v of values) {
    const hit = matchChoice(v, choices);
    if (hit) map[v] = hit;
    else unmatched.push(v);
  }
  return { map, unmatched };
}

/** `valueMap` 은 Prisma 의 Json 이라 그대로는 못 읽는다. 한 곳에서만 좁힌다. */
export function valueMapOf(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string" && val) out[k] = val;
  }
  return out;
}

// ── 대량등록 설정(plan) ────────────────────────────────────

/**
 * *"전부 이 값으로"* 로 고른 기본값들.
 *
 * 사는 곳은 `imported_lists.defaults` (Json) 이다.
 *
 * ⚠️ **왜 `imported_columns` 가 아닌가.** 기본값은 **열이 없을 때** 쓰는 값이라
 *   담을 열 행 자체가 없다.
 * ⚠️ **한때 `note` 에 넣었다** (2026-09-16 당일, 몇 시간). `note` 는 사람이 적는
 *   메모 칸이라 화면에 메모를 여는 날 설정과 메모가 서로를 덮어쓴다. 바로 옮겼다.
 *   ★ 읽기는 여전히 **못 읽어도 터지지 않게** 둔다 — 손으로 고친 JSON 이 들어올 수 있다.
 */
export type ImportPlan = {
  /** 마스터 칸 → 코드. 열이 없거나, 열은 있는데 그 행의 값을 못 맞췄을 때 쓴다 */
  defaults: Partial<Record<MasterField, string>>;
};

export const EMPTY_PLAN: ImportPlan = { defaults: {} };

/** DB 의 `defaults` 칸(Json) 을 읽는다. 모양이 이상하면 **설정이 없는 것으로 본다.** */
export function readPlan(raw: unknown): ImportPlan {
  const o = typeof raw === "string" ? safeParse(raw) : raw;
  const src = (o as { defaults?: Record<string, unknown> } | null)?.defaults;
  const defaults: ImportPlan["defaults"] = {};
  for (const f of MASTER_FIELDS) {
    const v = src?.[f];
    if (typeof v === "string" && v) defaults[f] = v;
  }
  return { defaults };
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

/** DB 에 넣을 모양. Prisma 의 Json 칸에 객체 그대로 들어간다 */
export function writePlan(plan: ImportPlan): { defaults: ImportPlan["defaults"] } {
  return { defaults: plan.defaults };
}

// ── 날짜 ───────────────────────────────────────────────────

/**
 * 엑셀에서 온 발생일.
 *
 * ★ `xlsx-read.ts` 가 날짜 서식 셀을 이미 `YYYY-MM-DD` 로 바꿔 준다 (`IM-07`).
 *   그래도 사람이 손으로 친 칸은 `2026.8.3` · `2026/08/03` 처럼 온다.
 *   **못 읽으면 `null` 을 돌려준다** — 오늘로 떨어뜨리는 판단은 부르는 쪽이 한다.
 */
export function parseImportDate(v: string): Date | null {
  const s = v.trim();
  const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (!m) return null;
  const [, y, mo, d, hh, mi] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh ?? 0), Number(mi ?? 0));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return null;  // 2026-02-31
  return date;
}
