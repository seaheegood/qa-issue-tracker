/** 목록·상세가 함께 쓰는 표시용 조각들. */
import { chipColors, composite, readableOn, SURFACE } from "@/lib/color";

/** 상태 = 속이 빈 동그라미. Linear 처럼 색만으로 상태가 읽히게 한다. */
export function StatusDot({ color }: { color: string }) {
  return <span className="sdot" style={{ background: color }} />;
}

/** 우선순위 = 작은 사각형. 상태와 모양을 다르게 해서 헷갈리지 않게 한다. */
export function PriorityDot({ color, name }: { color: string; name: string }) {
  return <span className="pdot" style={{ background: color }} title={`우선순위: ${name}`} />;
}

/**
 * 상태·유형 배지.
 *
 * ⚠️ **예전엔 DB 색을 그대로 글자색으로 썼다.** 옅은 배경(13%) 위에 같은 색 글자라
 *   실측 대비가 다크에서 **2.09** 였다 — 하루 종일 읽는 글자인데 AA(4.5)의 절반도 안 됐다.
 *   토큰을 고쳐도 여기는 안 바뀐다 (`C-51`).
 *
 * ★ **색상은 지키고 밝기만 민다.** 그래야 "색으로 상태를 읽는" 것이 살아 있다.
 *   배경은 옅은 tint 그대로 두되, **그 tint 위에서** 읽히는 글자색을 계산한다.
 */
export function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const bgL = composite(color, 0.13, SURFACE.light);
  const bgD = composite(color, 0.13, SURFACE.dark);
  return (
    <span
      className="badge"
      style={{
        ["--c-l" as string]: readableOn(color, bgL),
        ["--c-d" as string]: readableOn(color, bgD),
        ["--bg-l" as string]: bgL,
        ["--bg-d" as string]: bgD,
        ["--bd-l" as string]: composite(color, 0.28, SURFACE.light),
        ["--bd-d" as string]: composite(color, 0.28, SURFACE.dark),
      } as React.CSSProperties}
    >
      {children}
    </span>
  );
}

/** 팀이 없는 사람에게 쓰는 예비 색. 이름 해시로 정하므로 같은 사람은 항상 같은 색이다. */
const FALLBACK_COLORS = [
  "#e05252", "#dd7a29", "#c9a227", "#4f9d4f", "#2f9e8f",
  "#3b82c4", "#5e6ad2", "#8b5cd6", "#c04b9e", "#6b7280",
];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

/** 관리자가 팀 색을 고를 때 보여줄 기본 팔레트. */
export const TEAM_PALETTE = [
  "#0d9488", "#3b82c4", "#5e6ad2", "#8b5cd6", "#c04b9e",
  "#e05252", "#dd7a29", "#c9a227", "#4f9d4f", "#64748b",
];

export function Avatar({
  name,
  color,
  size,
}: {
  name: string | null | undefined;
  /** 팀 색. 없으면 이름 해시로 정한 예비 색을 쓴다. */
  color?: string | null;
  size?: number;
}) {
  const style = size ? { width: size, height: size, fontSize: size * 0.5 } : undefined;
  if (!name) {
    return <span className="avatar ghost" style={style} title="미지정">·</span>;
  }
  // 한글 이름은 성을 뺀 첫 글자가 더 잘 구분된다 (김OO, 박OO 이 많으므로)
  const initial = name.length > 1 ? name.slice(1, 2) : name.slice(0, 1);
  // ⚠️ 흰 글자를 **아무 색 위에나** 얹고 있었다 — 밝은 팀 색에서는 실측 2.42 였다.
  //   바탕색은 그대로 두고 **글자색을 밝기에 따라** 고른다 (`C-51`).
  const chip = chipColors(color ?? colorFor(name));
  return (
    <span
      className="avatar"
      style={{ ...style, background: chip.bg, color: chip.fg }}
      title={name}
    >
      {initial}
    </span>
  );
}

/**
 * 이슈번호 표시.
 * 약자(project.issuePrefix)가 없으면 숫자만 보인다 — 이게 기본값이다.
 * 저장은 숫자(seq)로만 하므로, 약자를 나중에 바꿔도 기존 번호가 틀어지지 않는다.
 */
export function issueNo(prefix: string | null | undefined, seq: number) {
  return prefix ? `${prefix}-${seq}` : String(seq);
}

export function formatShort(d: Date | null) {
  if (!d) return "—";
  return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, "0")}`;
}

export function formatFull(d: Date | null) {
  if (!d) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * `2026-08-20 15:04` — **화면에 시각을 그릴 때는 언제나 이것**이다 (`C-40`).
 *
 * ★ 예전엔 `relativeTime()`(`방금 전`·`3시간 전`)을 썼다. **파일럿 첫날에 뒤집혔다**
 *   (`docs/피드백` FB-011) — *"'방금전' 같은거 말고 전부 정확한 날짜와 시간으로"*.
 *   QA 는 **언제 무엇이 있었는지 순서를 따지는 사람**이라 `3시간 전` 은 답이 아니다.
 *   상대시간은 읽는 시점에 따라 뜻이 변하는데, 이슈 기록은 변하면 안 된다.
 *
 * ★ 덤 — 값이 **시각에 의존하지 않게 되어** 하이드레이션이 어긋날 이유가 사라졌다.
 *   `RelTime` 의 `suppressHydrationWarning` 은 그래서 같이 없앴다.
 *
 * ⚠️ **로컬 타임존 메서드**를 쓴다. `toISOString()` 으로 자르면 **UTC 기준**이라
 *   KST 오전 9시 이전 값이 **전날로 찍힌다.**
 */
export function formatDateTime(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 마지막 글자가 한글이면 받침 유무를 돌려준다. 한글이 아니면 `null`. */
function hasFinalConsonant(word: string): boolean | null {
  const last = word.trim().slice(-1);
  if (!last) return null;
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return null;   // 한글 음절이 아니다
  return (code - 0xac00) % 28 !== 0;
}

/**
 * 목적격 조사 — `환경` → `환경을` · `차수` → `차수를`.
 *
 * ★ 한글은 **받침이 있으면 `을`, 없으면 `를`** 이다. 코드에 `를` 로 박아 두면
 *   *"환경를 개발(Dev) 로 바꿨습니다"* 가 된다. 뜻은 통하지만 **사람이 쓴 글로 안 읽힌다.**
 *   유니코드에서 한글 음절은 (초성·중성·종성)이 규칙적으로 배열돼 있어
 *   `(코드 − 0xAC00) % 28` 이 0 이 아니면 받침이 있다.
 */
export function objectParticle(word: string) {
  const f = hasFinalConsonant(word);
  return f === null ? "를" : f ? "을" : "를";
}

/**
 * 부사격 조사 — `Major` → `Major 로` · `개발(Dev)` → `개발(Dev) 로` · `1차` → `1차로`.
 *
 * 받침이 없거나 받침이 `ㄹ` 이면 `로`, 그 밖에는 `으로`.
 * 값에는 영문·기호가 섞여 들어오므로(`v1.2`·`PR #24`) 한글이 아니면 `로` 로 둔다.
 */
export function directionParticle(word: string) {
  const w = word.trim();
  const last = w.slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "로";
  const jong = (code - 0xac00) % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";   // 8 = 받침 ㄹ
}


/**
 * 종결 사유. 상태를 8종으로 줄이면서 '취소'·'보류'가 상태에서 빠지고 여기로 왔다 (docs/13 §4).
 *
 * 순서가 화면의 선택지 순서다. QA확인완료를 맨 앞에 둔 이유는 이게 1,287건으로
 * 압도적으로 흔한 길이기 때문이다 — 자주 쓰는 것이 위에 있어야 빠르다 (P-3).
 */
export const CLOSE_REASONS = ["QA_CONFIRMED", "NOT_AN_ISSUE", "DUPLICATE", "ON_HOLD"] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

export const CLOSE_REASON_LABEL: Record<CloseReason, string> = {
  QA_CONFIRMED: "QA확인완료",
  NOT_AN_ISSUE: "이슈 아님",
  DUPLICATE: "중복",
  ON_HOLD: "보류",
};

/** QA확인완료만 사유 없이 닫을 수 있다. 나머지는 "왜"가 남아야 한다. */
export const CLOSE_NEEDS_NOTE: Record<CloseReason, boolean> = {
  QA_CONFIRMED: false,
  NOT_AN_ISSUE: true,
  DUPLICATE: true,
  ON_HOLD: true,
};

/**
 * 재현율 (FB-008 · `docs/13` D-12 정정).
 *
 * ★ `CloseReason` 바로 옆에 같은 모양으로 둔다. 성격이 같기 때문이다 —
 *   **프로젝트가 달라도 안 바뀌는 QA 공용 어휘**라 테이블이 아니라 enum 이고,
 *   그래서 라벨을 화면이 아니라 여기 한 곳에서 준다.
 *
 * 값이 셋인 이유: 넷 이상으로 쪼개면 `자주`와 `가끔`의 경계를 사람마다 다르게 잡는다.
 * 그러면 필터가 뜻을 잃는다. **개발이 재현을 시도할 때 알아야 하는 건**
 * "한 번에 되나 / 여러 번 해야 되나 / 나는 못 볼 수도 있나" 셋뿐이다.
 */
export const REPRO_RATES = ["ALWAYS", "INTERMITTENT", "ONCE"] as const;
export type ReproRate = (typeof REPRO_RATES)[number];

export const REPRO_RATE_LABEL: Record<ReproRate, string> = {
  ALWAYS: "항상",
  INTERMITTENT: "간헐적",
  ONCE: "1회성",
};

/**
 * 사람을 **팀으로 묶는다** (2026-09-11 — 멤버 폐지).
 *
 * ★ 고를 수 있는 사람이 '프로젝트 멤버 몇 명'에서 **활성 사용자 전원**으로 늘었다.
 *   한 줄로 늘어놓으면 찾기 어려워서 드롭다운마다 팀 머리글을 넣는다.
 *
 * ★ **여기 한 곳에서만 묶는다.** 목록 필터(서버)와 담당자 고르기(클라이언트)가
 *   같은 함수를 쓴다 — 복제하면 두 화면의 사람 순서가 갈라진다.
 *   ⚠️ 그래서 `lib/people.ts`(server-only) 가 아니라 여기 둔다.
 *
 * 들어오는 목록은 **이미 팀 순서로 정렬돼 있어야 한다** (`people()` 이 그렇게 준다).
 */
export function byTeam<T extends { team: { name: string; color: string } | null }>(list: T[]) {
  const groups: { team: string; color: string; people: T[] }[] = [];
  for (const p of list) {
    const name = p.team?.name ?? "팀 없음";
    const last = groups[groups.length - 1];
    if (last && last.team === name) last.people.push(p);
    else groups.push({ team: name, color: p.team?.color ?? "#9AA3AE", people: [p] });
  }
  return groups;
}

/**
 * 팀의 **직군** — 고를 수 있는 값과 그 이름 (2026-09-11 — 멤버 폐지).
 *
 * ★ 이 값이 **코멘트 유형**(FR-302)과 **답변 주체**(FR-208)를 정한다.
 *   예전엔 `project_members.role` 이 프로젝트마다 따로 정했는데, 실제 데이터는
 *   소속 팀과 100% 같았다 (`docs/03` v13).
 *
 * ⚠️ `LEAD` 는 **고를 수 없다.** 프로젝트를 만든 사람에게 붙던 값이라 직군이 아니고,
 *   이미 찍힌 이력 72건을 읽기 위해 이름만 남겨 둔다.
 */
export const TEAM_ROLES = ["QA", "DEV", "PLANNER"] as const;
export type TeamRolePick = (typeof TEAM_ROLES)[number];

export const TEAM_ROLE_LABEL: Record<string, string> = {
  QA: "QA",
  DEV: "개발",
  PLANNER: "기획",
  LEAD: "리드 (옛 값)",
};

/** 폼·필터에서 값을 그대로 믿지 않기 위한 관문. 아니면 undefined 를 돌려준다. */
export const toReproRate = (v: string | null | undefined): ReproRate | undefined =>
  REPRO_RATES.includes(v as ReproRate) ? (v as ReproRate) : undefined;

/**
 * 코멘트 유형 표시 — **지금은 화면에 안 그린다** (`D-97` · 2026-09-11).
 *
 * ★ 코멘트 머리 줄 오른쪽에 배지로 띄웠는데, 왼쪽 팀 배지와 **같은 말이 두 번**
 *   뜨는 일이 잦았다. 유형은 고르는 게 아니라 **직군에서 자동으로** 정해지고,
 *   직군이 없으면 `QA` 로 떨어져 **틀린 말이 되기도** 했다 (FB-011 6번).
 *   그 자리는 이제 **시각**이 쓴다.
 *
 * ⚠️ **지우지 않는다.** `comments.type` 은 계속 기록되고 있으므로,
 *   "개발이 단 코멘트만 보기" 같은 요구가 나오면 이 표가 그대로 쓰인다.
 *   (`docs/11` `10. 아직 없는 기능`)
 */
export const COMMENT_TYPE_LABEL: Record<string, string> = { DEV: "개발", PLAN: "기획", QA: "QA" };
export const COMMENT_TYPE_COLOR: Record<string, string> = {
  DEV: "#3b82c4",
  PLAN: "#8b5cd6",
  QA: "#2f9e8f",
};

export function Caret() {
  return (
    <span className="caret">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </span>
  );
}
