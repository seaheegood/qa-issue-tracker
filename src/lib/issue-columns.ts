/**
 * 이슈 목록의 **컬럼 정본**.
 *
 * ★★ **머리줄 · 줄 · 컬럼 고르기 셋이 이 배열 하나를 본다.**
 *   세 곳에 따로 적으면 컬럼을 하나 더할 때 **머리는 생겼는데 칸이 안 생기거나**
 *   그 반대가 된다. `buildWhere` 를 한 곳에 둔 것과 같은 이유다.
 *
 * ── 어떻게 숨기나 ──────────────────────────────────────────
 * **서버는 전부 그리고 CSS 가 감춘다.**
 *
 *   `<html data-cols="pri no title …">`  +  `:root:not([data-cols~="created"]) .c-created`
 *
 * ★ 서버가 컬럼을 몰라도 된다 — 쿠키도, 서버 렌더 분기도 없다.
 *   첫 페인트 **전에** 초기 스크립트가 `<html>` 에 찍으므로 깜빡이지도 않는다.
 *   테마·사이드바 접기·보기 방식과 **똑같은 방식**이다 (`C-13`).
 *
 * ⚠️ **순서 바꾸기는 안 한다.** DOM 순서가 고정이라 CSS 로는 못 하고,
 *   요청에도 없었다. **보이기/숨기기만.**
 */
export type ColumnKey =
  | "check" | "pri" | "no" | "title" | "reporter" | "assignee"
  | "created" | "updated" | "att" | "cmt"
  | "status" | "reported" | "platform" | "env" | "system"
  | "round" | "repro" | "screen" | "ver" | "qai";

export type Column = {
  key: ColumnKey;
  label: string;
  /** 끌 수 없다 — 이게 없으면 목록이 목록이 아니다 */
  always?: boolean;
  /** 처음 오는 사람이 보게 될 것 */
  def?: boolean;
  /** 머리를 눌러 정렬할 수 있는 칸이면 그 정렬 키 */
  sort?: string;
};

export const COLUMNS: Column[] = [
  /**
   * ★★ **이 차례가 곧 화면의 차례다.** 머리줄도 줄도 이 순서로 그린다.
   *   ⚠️ `Row` 의 JSX 순서가 여기와 **한 칸이라도 어긋나면 머리와 몸이 밀린다** —
   *     실제로 한 번 어긋나서 `첨부` 머리 아래에 작성자 아바타가 왔다.
   *
   * 기본으로 보이는 것(`def`)은 사용자가 정한 차례 그대로다 —
   * 체크박스 · 우선순위 · 번호 · 제목 · 작성자 · 담당자 · 등록일 · 수정일 · 첨부 · 코멘트.
   * 고르면 나오는 칸들은 **뜻이 가까운 자리**에 끼워 둔다 (상태·플랫폼은 번호 옆,
   * 화면명·버전은 제목 옆) — 켰을 때 엉뚱한 끝에 붙지 않도록.
   */
  { key: "check", label: "", always: true },
  { key: "pri", label: "우선순위", def: true, sort: "pri" },
  { key: "no", label: "번호", def: true, sort: "seq" },

  { key: "status", label: "상태" },
  { key: "platform", label: "플랫폼" },
  { key: "env", label: "환경" },
  { key: "system", label: "시스템" },
  { key: "round", label: "차수" },
  { key: "repro", label: "재현율" },

  { key: "title", label: "이슈 타이틀", always: true, sort: "title" },

  { key: "screen", label: "화면명" },
  { key: "ver", label: "검출/반영" },
  { key: "qai", label: "QAI #" },

  { key: "reporter", label: "작성자", def: true },
  { key: "assignee", label: "담당자", def: true },
  { key: "created", label: "등록일", def: true, sort: "created" },
  { key: "updated", label: "수정일", def: true, sort: "updated" },
  /**
   * ★ `발생일`(`reportedAt`) 은 **사람이 적는 진짜 날짜**다.
   *   `등록일`(`createdAt`) 과 뜻이 다르다 — 엑셀에서 이관한 1,704건은
   *   등록일이 **전부 2026-08-20**(적재한 날)이고, 그 건들의 실제 날짜는 여기뿐이다.
   */
  { key: "reported", label: "발생일", sort: "reported" },
  { key: "att", label: "첨부", def: true },
  { key: "cmt", label: "코멘트", def: true },
];

/**
 * 칸 기본 폭(px).
 *
 * ★ **CSS 가 아니라 여기가 정본이다.** 머리줄·줄·초기 스크립트가 같은 값을 봐야
 *   머리와 몸이 안 어긋난다. CSS 에서는 `var(--cw-{키}, {여기 값})` 으로 읽는다.
 * ⚠️ `title` 은 없다 — 남는 폭을 먹는 칸이라 폭을 정하지 않는다.
 * ⚠️ `platform`·`env` 는 **서버가 세어 넘기는 폭**(`--w-plat`·`--w-env`)이 기본이라
 *   여기 값이 아니라 CSS 쪽 계산식이 대신 들어간다.
 */
export const COL_W: Partial<Record<ColumnKey, number>> = {
  pri: 86, no: 78,
  status: 108, system: 118, round: 78, repro: 78,
  screen: 130, ver: 130, qai: 86,
  reporter: 46, assignee: 46,
  created: 100, updated: 100, reported: 100,
  att: 48, cmt: 48,
};

/** 폭을 담는 열쇠 */
export const COLW_KEY = "pt-issue-colw";

/**
 * 손으로 바꾼 칸 폭을 **전부 되돌린다.**
 *
 * ★ 저장소만 비우면 안 된다 — 이미 `<html>` 에 찍힌 `--cw-*` 가 남아 있어
 *   새로고침하기 전까지 그대로 보인다. 둘 다 지운다.
 *
 * ⚠️ **되돌릴 길이 없으면 폭 조절은 함정이 된다** (2026-09-17 제보 —
 *   *"이슈 타이틀 컬럼이 화면이 꽉 차지 않았는데 더 늘어나질 않아서 오른쪽이 계속 비어있어"*).
 *   제목 칸을 한 번 끌면 그 값이 **상한**이 되어, 넓은 화면에서 오른쪽이 통째로 빈다.
 *   그런데 컬럼 메뉴의 `기본으로 되돌리기` 는 보이기/숨기기만 되돌리고 있었다.
 */
export function resetColWidths() {
  const root = document.documentElement;
  for (const c of COLUMNS) root.style.removeProperty(`--cw-${c.key}`);
  try {
    localStorage.removeItem(COLW_KEY);
  } catch {
    // 저장소가 막혀 있어도 지금 화면은 되돌린다
  }
}

/**
 * 저장해 둔 칸 폭을 첫 페인트 **전에** 찍는다.
 * 이게 없으면 기본 폭으로 한 번 그려졌다가 확 바뀌는 게 보인다.
 *
 * ⚠️ 저장된 값은 사람이 고친 것이라 믿지 않는다 — **아는 키 · 숫자 · 범위**만 받는다.
 */
export const colWidthInitScript = `
(function(){
  try {
    var raw = localStorage.getItem(${JSON.stringify(COLW_KEY)});
    if (!raw) return;
    var w = JSON.parse(raw), root = document.documentElement;
    Object.keys(w).forEach(function(k){
      var v = Number(w[k]);
      if (isFinite(v) && v >= 40 && v <= 4000) root.style.setProperty('--cw-' + k, v + 'px');
    });
  } catch (e) {}
})();
`;

/** 저장된 적이 없는 사람이 보게 될 컬럼 */
export const DEFAULT_COLS = COLUMNS.filter((c) => c.always || c.def).map((c) => c.key);

/** 브라우저에 담는 열쇠. `ColumnPicker` 와 초기 스크립트가 같이 쓴다. */
export const COLS_KEY = "pt-issue-cols";

/**
 * 첫 페인트 **전에** `<html data-cols>` 를 찍는다.
 * 이게 없으면 기본 컬럼으로 한 번 그려졌다가 바뀌는 게 보인다.
 */
export const colsInitScript = `
(function(){
  try {
    var v = localStorage.getItem(${JSON.stringify(COLS_KEY)});
    document.documentElement.dataset.cols = v || ${JSON.stringify(DEFAULT_COLS.join(" "))};
  } catch (e) {
    document.documentElement.dataset.cols = ${JSON.stringify(DEFAULT_COLS.join(" "))};
  }
})();
`;
