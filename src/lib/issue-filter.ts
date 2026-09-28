import type { Prisma } from "@prisma/client";

import { REPRO_RATES } from "@/lib/ui";

/**
 * 이슈 목록의 **필터 조립**.
 *
 * ★ 왜 컴포넌트에서 빼냈나.
 *   `/issues` 안에 지역 변수로 있던 27줄이다. 그런데 이 조건을 쓰는 곳이 셋으로 늘었다 —
 *   목록 · **엑셀 내보내기** · **저장된 필터**. 복제하면 필터가 하나 늘 때마다
 *   세 곳이 갈라지고, 그때부터 *"화면에는 441건인데 내보내면 679건"* 이 된다.
 *
 *   요구사항서 09 가 요구한 건 *"지금 보고 있는 목록 그대로"* 내보내기다.
 *   그 '그대로'를 보장하는 유일한 방법이 **같은 함수를 쓰는 것**이다.
 */
export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * ★★ **필터는 전부 다중 선택이다** (2026-09-16 · 사용자 지시 —
 *   *"각 필터는 전부 중복으로 선택이 가능해야해"*).
 *
 *   `?status=OPEN,IN_PROGRESS` 처럼 **쉼표로 잇는다.** 반복 키(`?status=A&status=B`)가
 *   아닌 이유는 `filterToQuery`·`filter-actions`·대시보드 링크가 전부
 *   `URLSearchParams.set()` 을 전제로 짜여 있기 때문이다 — 바꾸면 그 셋이 같이 깨진다.
 *
 * ⚠️ 값이 하나인 CSV 는 그냥 단일값이라, **대시보드가 보내던 `?status=OPEN` 같은
 *   링크는 그대로 유효**하다.
 */
export type IssueFilter = {
  q?: string;
  status?: string[];
  priority?: string[];
  system?: string[];
  /** ★ `"none"`(미지정)을 실제 사람과 **함께** 고를 수 있다 — `buildWhere` 가 OR 로 푼다 */
  assignee?: string[];
  reporter?: string[];
  /** 작성자 OR 담당자. 여럿이면 "그중 누구라도" */
  person?: string[];
  open?: string;
  /** ★ 종결(Closed)까지 보겠다 — `?closed=1`. 없으면 기본이 '종결 제외'다 */
  closed?: string;
  /**
   * 숨긴 이슈만 보겠다 — `?deleted=1` (2026-09-17).
   *
   * ★ **켜고 끄는 게 아니라 «뒤집는» 필터다.** 기본은 언제나 숨긴 것을 빼고,
   *   이 값이 있으면 **숨긴 것만** 본다. 섞어 보여 주지 않는다 —
   *   되살릴 것을 고르는 화면이지 평소에 보는 화면이 아니다.
   * ⚠️ 관리자에게만 버튼이 보인다. 다만 **주소는 누구나 칠 수 있으므로**
   *   화면 쪽에서 한 번 더 막는다 (`C-44` 와 같은 규칙).
   */
  deleted?: string;
  /** ★ `"none"`(미분류)을 실제 차수와 함께 고를 수 있다 */
  round?: string[];
  platform?: string[];
  /** 환경 — 2026-09-16 신설. 목록에는 계속 있었는데 **필터가 없었다** */
  environment?: string[];
  /**
   * 재현율 — `?repro=ONCE` (FB-008).
   *
   * ★ **코드로 받는다.** `항상`·`간헐적` 같은 라벨로 받으면 문구를 다듬는 날
   *   저장된 필터와 공유한 링크가 전부 죽는다.
   */
  repro?: string[];
  /** 이 번호들만. 일괄 편집이 "방금 바꾼 그 12건" 을 가리킬 때 쓴다 */
  seq?: string[];
  /** 한 쪽에 몇 건 — `50` 또는 `100`. URL 에 남아야 공유한 링크가 같은 화면을 연다 */
  per?: string;
};

/** 필터 키 전체. 저장·복원·URL 조립이 전부 이 배열을 기준으로 돈다. */
export const FILTER_KEYS = [
  "q", "status", "priority", "system", "assignee",
  "reporter", "person", "open", "closed", "round", "platform", "environment",
  "repro", "seq", "per", "deleted",
] as const;

/** 다중 선택 필터들. 화면의 드롭다운·칩이 이 목록을 기준으로 돈다. */
export const MULTI_KEYS = [
  "status", "priority", "system", "assignee", "reporter", "person",
  "round", "platform", "environment", "repro", "seq",
] as const;

const one = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/**
 * 여러 개를 고르는 필터. `?platform=PC,MO` 처럼 쉼표로 온다.
 *
 * 반복 키(`?platform=PC&platform=MO`)가 아니라 CSV 를 쓰는 이유는 URL 조립 때문이다.
 * `URLSearchParams.set()` 으로 키 하나에 값 하나를 넣고 있어서, 반복 키로 가려면
 * `append` 로 재작성해야 한다. CSV 면 이 함수 하나로 끝난다.
 *
 * ★ 빈 배열은 undefined 로 돌려준다. `Boolean([])` 이 true 라서
 *   그냥 두면 필터가 없는데도 "필터가 걸렸다"고 판단한다.
 */
const many = (v: string | string[] | undefined) => {
  const raw = Array.isArray(v) ? v.join(",") : v;
  const list = (raw ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return list.length ? list : undefined;
};

/** 쿼리스트링 → 필터. `/issues`, 내보내기, 저장된 필터가 모두 이걸 쓴다. */
export function parseFilter(sp: SearchParams): IssueFilter {
  return {
    q: one(sp.q),
    status: many(sp.status),
    priority: many(sp.priority),
    system: many(sp.system),
    assignee: many(sp.assignee),
    reporter: many(sp.reporter),
    person: many(sp.person),
    open: one(sp.open),
    closed: one(sp.closed),
    round: many(sp.round),
    platform: many(sp.platform),
    environment: many(sp.environment),
    repro: many(sp.repro),
    seq: many(sp.seq),
    per: one(sp.per),
    deleted: one(sp.deleted),
  };
}

/**
 * ⚠️ **키를 늘릴 때는 «세 곳»을 같이 고친다** — `IssueFilter` 타입 · `FILTER_KEYS` ·
 *   그리고 **여기.** 2026-09-17 에 `deleted` 를 앞의 둘에만 넣었더니
 *   주소에 `?deleted=1` 이 있어도 **`parseFilter` 가 안 읽어** 평소 목록이 그대로 나왔다.
 *   타입은 선택값(`?`)이라 컴파일도 통과한다 — 기계가 안 잡아 주는 자리다.
 */

/** ★ `Boolean([])` 은 true 다. 배열은 길이로 판단해야 한다. */
export const hasAnyFilter = (f: IssueFilter) =>
  Object.values(f).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v)));

/** 필터 → 쿼리스트링. 저장된 필터를 다시 링크로 만들 때 쓴다. */
export function filterToQuery(f: IssueFilter): string {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = f[k];
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(","));
    } else if (v !== "") {
      p.set(k, v);
    }
  }
  return p.toString();
}

/**
 * 필터 → Prisma 조건.
 *
 * 모든 조회는 project_id 로 먼저 좁힌다 (docs/03 6장 — 프로젝트 격리).
 */
/**
 * 필터 → Prisma 조건.
 *
 * ★ `per`(쪽 크기)는 **조회 조건이 아니라 표시 방식**이라 여기서 쓰지 않는다.
 *   그래도 FILTER_KEYS 에 넣은 이유는 URL·저장된 필터에서 살아남아야 하기 때문이다.
 */
/**
 * **숨기지 않은 이슈**만. 이슈를 세는 곳이라면 어디든 이걸 쓴다.
 *
 * ★ `buildWhere` 를 안 쓰는 곳이 열 곳 넘는다 — 대시보드의 `groupBy` 14개,
 *   사이드바 건수 3개, 목록의 전체 건수, 설정 화면, 등록 화면의 화면명 목록.
 *   **그 전부가 같은 조건을 봐야** *"화면의 숫자 = 링크 결과 건수"* 가 유지된다.
 * ⚠️ 문자열로 복제하지 말 것. 조건이 바뀌는 날 **한 곳만 고치고 끝나야** 한다.
 */
export const notDeleted = { deletedAt: null } as const;

export function buildWhere(projectId: number, f: IssueFilter): Prisma.IssueWhereInput {
  /**
   * ★★ **조건을 `AND` 배열에 쌓는다** (2026-09-16 · 다중 선택으로 바꾸면서).
   *
   *   예전에는 최상위 객체에 스프레드로 얹었다. 그래서 **같은 키를 쓰는 두 필터가
   *   서로를 덮어썼다** — `?status=OPEN&open=1` 은 뒤에 오는 `open` 이 이겼다.
   *   `q`(검색)가 최상위 `OR` 를 점유하는 것도 같은 종류의 문제였고,
   *   `person` 만 `AND` 로 피해 가고 있었다.
   *
   *   배열에 쌓으면 **서로 덮어쓸 자리가 없다.** `OR` 가 필요한 조건도
   *   `{ OR: [...] }` 한 덩어리로 밀어 넣으면 된다.
   */
  const AND: Prisma.IssueWhereInput[] = [];

  /**
   * 값 목록 + `"none"` 센티널을 함께 푼다.
   *
   * ⚠️ **`in` 하나로는 안 된다.** *"미지정 + 담당자A"* 을 고르면
   *   `assigneeId IS NULL` 과 `loginId IN (...)` 을 **OR** 로 이어야 한다.
   */
  const withNone = (
    vals: string[] | undefined,
    nullWhere: Prisma.IssueWhereInput,
    listWhere: (v: string[]) => Prisma.IssueWhereInput,
  ) => {
    if (!vals?.length) return;
    const none = vals.includes("none");
    const rest = vals.filter((v) => v !== "none");
    const parts: Prisma.IssueWhereInput[] = [];
    if (none) parts.push(nullWhere);
    if (rest.length) parts.push(listWhere(rest));
    if (parts.length === 1) AND.push(parts[0]);
    else if (parts.length > 1) AND.push({ OR: parts });
  };

  if (f.status?.length) AND.push({ status: { code: { in: f.status } } });
  if (f.priority?.length) AND.push({ priority: { code: { in: f.priority } } });
  if (f.system?.length) AND.push({ system: { code: { in: f.system } } });
  if (f.environment?.length) AND.push({ environment: { code: { in: f.environment } } });
  if (f.reporter?.length) AND.push({ reporter: { loginId: { in: f.reporter } } });

  // 담당자는 '미지정'(NULL)도 고를 수 있다
  withNone(f.assignee, { assigneeId: null }, (v) => ({ assignee: { loginId: { in: v } } }));
  // 차수는 '미분류'(NULL)도 — 이관한 1,704건이 전부 거기 있다
  withNone(f.round, { roundId: null }, (v) => ({ round: { code: { in: v } } }));

  /**
   * 미해결만 — `?open=1`.
   *
   * '미해결'은 상태 하나가 아니라 **분류**(OPEN·PENDING)다.
   * `?status=OPEN` 으로는 Demand·Merge Pending 이 빠진다.
   * 대시보드의 '남은 것' 숫자가 이 링크로 온다 — 숫자와 목록이 어긋나면 안 된다.
   */
  if (f.open === "1") AND.push({ status: { category: { in: ["OPEN", "PENDING"] as const } } });

  /**
   * ★★ **기본은 종결(Closed)을 뺀 전부다** (2026-09-16 · 사용자 지시 —
   *   *"디폴트는 closed 되지 않은 모든 이슈가 보이는게 디폴트"*).
   *
   *   상태를 하나라도 골랐으면 **고른 것이 이긴다** (`Closed` 를 골랐는데 안 보이면 안 된다).
   *   `?open=1` 도 이미 더 좁은 조건이라 손대지 않는다.
   *   전부 보려면 `?closed=1` — 사이드바의 `전체` 가 그 링크다.
   *
   * ⚠️ 이 한 줄이 **엑셀 내보내기와 대시보드 링크의 결과까지** 바꾼다.
   *   내보내기는 같이 바뀌는 게 맞고(X-02 — 화면과 파일은 같아야 한다),
   *   대시보드는 자기가 센 숫자와 맞추려고 링크에 `closed=1` 을 붙였다.
   */
  if (!f.status?.length && f.open !== "1" && f.closed !== "1") {
    AND.push({ status: { category: { not: "CLOSED" } } });
  }

  /**
   * ★★ **숨긴 이슈는 기본으로 빠진다** (2026-09-17 · 사용자 지시).
   *
   *   `?deleted=1` 이면 **숨긴 것만** 본다 — 되살릴 것을 고르는 화면이다.
   *
   * ⚠️⚠️ **여기 한 줄로 끝나지 않는다.** 목록과 엑셀은 이 함수를 쓰지만,
   *   **대시보드·사이드바·건수는 자기 `where` 를 따로 만든다.**
   *   거기를 빠뜨리면 이 프로젝트의 기본 계약이 깨진다 —
   *   *"화면의 숫자 = 링크 결과 건수"*. 사이드바는 15건이라는데 눌러 보면 14건이 된다.
   *   → 그래서 `notDeleted` 를 따로 내보내 **세는 곳마다 같은 조건**을 쓰게 한다.
   */
  AND.push(f.deleted === "1" ? { deletedAt: { not: null } } : { deletedAt: null });

  // 플랫폼은 여러 개 중 **하나라도** 맞으면 걸린다.
  // PC·AOS 를 함께 고르면 "둘 다인 이슈"가 아니라 "둘 중 하나라도인 이슈"다.
  if (f.platform?.length) {
    AND.push({ platforms: { some: { platform: { code: { in: f.platform } } } } });
  }

  /**
   * 재현율 — `?repro=ONCE,ALWAYS` (FB-008).
   *
   * ★ 넘어온 값을 그대로 조건에 넣지 않는다. Prisma 는 enum 에 없는 값을 받으면
   *   **던진다** — 필터 하나 잘못 친 링크가 목록 화면 전체를 500 으로 만든다.
   *   ⚠️ 다중이 되면서 **원소마다** 걸러야 한다. 하나만 이상해도 전체가 터진다.
   */
  if (f.repro?.length) {
    const ok = f.repro.filter((r): r is (typeof REPRO_RATES)[number] =>
      REPRO_RATES.includes(r as (typeof REPRO_RATES)[number]));
    if (ok.length) AND.push({ reproRate: { in: ok } });
  }

  /**
   * 번호를 콕 집어서 — `?seq=2358,2359,…`
   *
   * 일괄 편집 알림이 "방금 바꾼 그 12건" 을 정확히 가리키려고 만들었다.
   * 담당자 코드 같은 걸로 링크하면 그 사람의 **전부**가 나와서 12건이 묻힌다.
   */
  if (f.seq?.length) {
    const nums = f.seq.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (nums.length) AND.push({ seq: { in: nums } });
  }

  /**
   * 한 사람과 관련된 것 — **작성했거나 담당인** 이슈 (docs/10 §4).
   *
   * ★ reporter·assignee 를 함께 주면 AND 가 된다.
   *   `?reporter=X&assignee=X` 는 "작성자도 X이고 담당자도 X" 라서 0건이 나온다.
   *   그래서 키를 따로 둔다.
   */
  if (f.person?.length) {
    AND.push({
      OR: [
        { reporter: { loginId: { in: f.person } } },
        { assignee: { loginId: { in: f.person } } },
      ],
    });
  }

  if (f.q) {
    AND.push({
      OR: [
        // 숫자를 넣으면 이슈번호로도 찾는다 ('1704' → 1704번)
        ...(/^\d+$/.test(f.q) ? [{ seq: Number(f.q) }] : []),

        // ★ 제목을 **맨 앞**에 둔다 (2026-09-16). 사람이 검색창에 치는 말은
        //   대개 목록에서 본 그 제목이다.
        { title: { contains: f.q } },
        { content: { contains: f.q } },
        { testPath: { contains: f.q } },
        { expected: { contains: f.q } },
        { legacyScreenName: { contains: f.q } },
      ],
    });
  }

  return { projectId, ...(AND.length ? { AND } : {}) };
}
