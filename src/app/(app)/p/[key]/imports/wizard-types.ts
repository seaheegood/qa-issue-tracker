/**
 * 업로드 마법사가 주고받는 모양.
 *
 * ★ **왜 `actions.ts` 에 두지 않았나.**
 *   `"use server"` 파일은 **async 함수만 내보낼 수 있다.** 상수 하나(`WIZARD_START`)를
 *   같이 내보냈더니, 서버 컴포넌트가 그 모듈을 불러오는 순간 500 이 났다:
 *
 *     Error: A "use server" file can only export async functions, found object.
 *
 *   ⚠️ 클라이언트 컴포넌트만 쓸 때는 안 터진다 — 거기서는 액션이 **참조**로 바뀌기 때문이다.
 *     그래서 업로드 화면은 멀쩡했고 **열 설정 화면에서만** 터졌다.
 *     타입만 내보낼 때도 마찬가지로 위험하니(지워지긴 하지만) 값과 타입은 여기 모아 둔다.
 */

export type SheetSummary = {
  name: string;
  hidden: boolean;
  rowCount: number;
  colCount: number;
  headerGuess: number;
  emptyCols: number[];
  /** 앞부분만. 사람이 헤더 행과 데이터 시작 행을 눈으로 고르라고 주는 것이다 */
  preview: string[][];
};

export type WizardState =
  | { step: "pick"; error?: string }
  | { step: "configure"; fileName: string; sheets: SheetSummary[]; error?: string };

export const WIZARD_START: WizardState = { step: "pick" };

/**
 * ② 열 설정 — 이름·순서·쓸지 말지.
 *
 * ★ `values` 는 **오류 때 돌려주는 입력값**이다.
 *   여기 입력칸은 비제어(`defaultValue`)라 값이 DOM 에만 있고,
 *   React 19 가 폼을 초기화하면 **손으로 고친 열 이름이 원래대로 되돌아간다.**
 *   (`issues/new` 가 먼저 겉은 함정 — 거기와 같은 장치다)
 * ★ `at` 은 폼을 다시 마운트하라는 신호. 같은 오류가 연속으로 나도 되살아나야 한다
 */
export type ColumnState = {
  error?: string;
  ok?: string;
  at?: number;
  values?: { name: string; labels: Record<string, string> };
};

// ── 이슈 대량등록 (2026-09-16 · 팀장 지시) ──────────────────

/** ④ 대상 — 어느 프로젝트의 어느 차수로 넣을 것인가 */
export type TargetState = { error?: string; ok?: string };

/**
 * ③ 매핑 — 열을 이슈의 어느 칸으로 넣을 것인가.
 *
 * ★ `at` 은 **폼을 다시 마운트하라는 신호**다 (`MappingEditor` 주석 참고).
 *   값에 뜻은 없고 **매번 달라지기만** 하면 된다 — 같은 오류가 두 번
 *   연속으로 나도 화면이 되살아나야 하기 때문이다.
 */
export type MappingState = { error?: string; ok?: string; at?: number };

/**
 * ⑤ 등록 결과.
 *
 * ★ **되는 행은 만들고, 안 되는 행만 남긴다.** 한 행 때문에 240행을 통째로
 *   되돌리지 않는다 — 그러면 고객사 파일 하나에 오타가 한 칸만 있어도
 *   **아무것도 못 넣는다.**
 */
export type CommitState = {
  error?: string;
  ok?: string;
  created?: number;
  failed?: number;
  skipped?: number;
};
