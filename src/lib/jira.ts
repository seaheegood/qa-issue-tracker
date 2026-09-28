import "server-only";

import { prisma } from "@/lib/prisma";
import { formatFull } from "@/lib/ui";
import { appEnv } from "@/lib/db-url";

/**
 * 지라(Jira Cloud) 로 **보내는** 일을 아는 **한 곳**.
 *
 * ★★ **왜 한 곳인가.** `buildWhere()`(필터) · `people()`(고를 수 있는 사람) ·
 *   `storage.ts`(첨부 실물)와 같은 이유다. 보낼 값을 만드는 곳과 보내는 곳이 갈리면
 *   *"미리보기에는 있는데 실제로 보낸 것에는 없는 칸"* 이 생긴다.
 *   **미리보기와 실제 전송이 같은 함수(`buildPayload`)로 만든 같은 JSON** 이어야
 *   미리보기가 증거가 된다.
 *
 * ★ 범위는 **㉠ 우리 → 지라 단방향**뿐이다 (`docs/21` ❷ · `docs/22-답변` 1장).
 *   받아오기·양방향은 «정본이 둘» 이 되므로 만들지 않는다.
 *
 * ⚠️ **토큰은 `.env` 에만 있다** (`IT_JIRA_EMAIL` · `IT_JIRA_TOKEN`).
 *   DB·화면·이력·로그 어디에도 값이 실리지 않는다. 있는지 없는지만 말한다.
 */

/** 보낼 값을 만드는 데 필요한 우리 쪽 이슈. **화면이 가진 것만** 받는다. */
export type JiraSource = {
  seq: number;
  /** 화면에 보이는 번호 (`PT-1702`). 지라 본문에 그대로 적는다 */
  no: string;
  title: string;
  content: string | null;
  testPath: string | null;
  expected: string | null;
  screen: string | null;
  priorityId: number;
  priorityName: string;
  environmentName: string;
  systemName: string;
  platformNames: string[];
  statusName: string;
  reproRateLabel: string | null;
  foundVersion: string | null;
  roundName: string | null;
  reporterName: string;
  reportedAt: Date;
  externalRef: string | null;
};

export type JiraConfig = {
  baseUrl: string;
  jiraProjectKey: string;
  issueTypeId: string;
  labels: string | null;
  categoryFieldId: string | null;
  categoryValue: string | null;
  defaultParentKey: string | null;
  priorityMap: string | null;
  isActive: boolean;
};

// ── .env 에서 오는 것 ──────────────────────────────────────

/**
 * 연동 계정. **없으면 `null`** — 그러면 이 앱은 **미리보기까지만** 한다.
 *
 * ★ 없는 것을 «고장» 으로 다루지 않는다. 토큰 승인이 나기 전까지는
 *   미리보기가 정상 동작이고, 그 사실을 화면이 말해 준다 (`J-20`).
 */
export function jiraCreds(): { email: string; token: string } | null {
  // ⚠️ 2026-09-20 의 `DATABASE_URL=` 사고와 같은 대비 — 값에 따옴표·공백이 섞여 온다.
  const email = (appEnv("JIRA_EMAIL") ?? "").trim().replace(/^["']|["']$/g, "");
  const token = (appEnv("JIRA_TOKEN") ?? "").trim().replace(/^["']|["']$/g, "");
  if (!email || !token) return null;
  return { email, token };
}

/**
 * 우리 앱의 겉주소. 지라 본문에 **되돌아오는 링크**를 적는 데 쓴다.
 *
 * ⚠️ 이건 프로젝트 설정이 아니라 **이 서버가 어떻게 불리는가**라서 `.env` 에 둔다
 *   (`IT_BASE_URL=http://192.168.0.10:3000`). 안 주면 링크 없이 번호만 적는다 —
 *   **틀린 링크를 적는 것보다 낫다** (`docs/12` ④ 의 «호스트 이름 우선» 과 같은 판단).
 */
export function ourBaseUrl(): string | null {
  const v = (appEnv("BASE_URL") ?? "").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  return v || null;
}

// ── 주소 만들기 ────────────────────────────────────────────

/** 지라 티켓을 여는 주소. `https://…/browse/WEB-123` */
export function browseUrl(baseUrl: string | null | undefined, jiraKey: string): string | null {
  const b = (baseUrl ?? "").replace(/\/+$/, "");
  if (!b || !jiraKey) return null;
  return `${b}/browse/${encodeURIComponent(jiraKey)}`;
}

// ★ 키 모양·우선순위 등급은 **클라이언트도 본다** → `lib/jira-const.ts` 에 있다.
//   여기서 다시 내보내는 건 부르는 쪽이 한 곳만 보면 되게 하기 위함이다 (값은 한 벌이다).
export { JIRA_KEY_RE, JIRA_PRIORITIES, normalizeJiraKey } from "./jira-const";

// ── 우선순위 짝짓기 ────────────────────────────────────────

/** `{"3":"Highest"}` → Map. ⚠️ 깨진 JSON 이 저장돼 있어도 **화면이 죽지 않게** 빈 Map */
export function parsePriorityMap(json: string | null | undefined): Map<number, string> {
  const m = new Map<number, string>();
  if (!json) return m;
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    for (const [k, v] of Object.entries(o)) {
      const id = Number(k);
      if (Number.isInteger(id) && typeof v === "string" && v) m.set(id, v);
    }
  } catch {
    // 조용히 빈 Map. 우선순위를 못 보내는 것은 티켓 생성을 막을 일이 아니다.
  }
  return m;
}

// ── ADF (지라 본문 형식) ───────────────────────────────────

/**
 * ⚠️ **Jira Cloud 의 `description` 은 평문이 아니라 ADF(JSON)** 다
 *   (`docs/22-답변` 2-1). 문자열을 그대로 넣으면 400 이 온다.
 *
 * ⚠️ ADF 의 `text` 노드에는 **줄바꿈을 넣을 수 없다.** 우리 본문은 여러 줄이라
 *   줄마다 문단을 하나씩 만든다 — 안 그러면 한 줄로 붙어 읽을 수 없게 된다.
 */
type Adf = Record<string, unknown>;

const textNode = (t: string): Adf => ({ type: "text", text: t });

function paragraphs(body: string): Adf[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: Adf[] = [];
  for (const line of lines) {
    // 빈 줄은 빈 문단으로 두면 지라가 거른다. 내용 있는 줄만 남긴다.
    if (line.trim() === "") continue;
    out.push({ type: "paragraph", content: [textNode(line)] });
  }
  return out.length > 0 ? out : [{ type: "paragraph", content: [textNode("—")] }];
}

const heading = (t: string): Adf => ({
  type: "heading", attrs: { level: 3 }, content: [textNode(t)],
});

function bullets(items: [string, string | null][]): Adf {
  const rows = items.filter(([, v]) => v != null && v !== "");
  return {
    type: "bulletList",
    content: rows.map(([k, v]) => ({
      type: "listItem",
      content: [{
        type: "paragraph",
        content: [
          { ...textNode(`${k}: `), marks: [{ type: "strong" }] },
          textNode(String(v)),
        ],
      }],
    })),
  };
}

/** 우리 이슈로 돌아오는 첫 줄. 링크를 만들 수 없으면 **번호만** 적는다 */
function backlinkParagraph(src: JiraSource, url: string | null): Adf {
  const label = `IssueTracker ${src.no}`;
  return {
    type: "paragraph",
    content: [
      textNode("원본: "),
      url
        ? { ...textNode(label), marks: [{ type: "link", attrs: { href: url } }] }
        : textNode(label),
      textNode(` · 등록 ${src.reporterName}`),
    ],
  };
}

// ── 보낼 JSON 만들기 ──────────────────────────────────────

export type JiraPayload = { fields: Record<string, unknown> };

/**
 * 지라에 보낼 JSON. **미리보기와 실제 전송이 이 함수 하나를 쓴다.**
 *
 * ★ **Reporter 를 보내지 않는다.** 필수 항목이지만(`docs/22-답변` 2-4) 비워 보내면
 *   지라가 **연동 계정**을 등록자로 넣는다. 우리 사람과 지라 계정을 짝지을 표가 없는데
 *   `accountId` 를 지어내면 400 이 나거나 **엉뚱한 사람 이름이 박힌다.**
 *   대신 **본문 첫 줄에 우리 쪽 등록자**를 적는다 — 지어내지 않고 사실을 옮긴다
 *   (플랫폼 `모바일` 153건을 AOS/iOS 로 지어내지 않은 것과 같은 판단).
 */
export function buildPayload(
  src: JiraSource,
  cfg: JiraConfig,
  opts: { parentKey?: string | null; ourUrl?: string | null } = {},
): JiraPayload {
  const fields: Record<string, unknown> = {
    project: { key: cfg.jiraProjectKey },
    issuetype: { id: cfg.issueTypeId },
    // ★ Summary 는 **제목만** 쓴다. 번호는 본문과 라벨로 찾을 수 있고,
    //   제목 앞에 `[PT-1702]` 를 붙이면 지라 목록에서 제목이 그만큼 잘린다.
    summary: src.title.slice(0, 250),
    description: {
      type: "doc",
      version: 1,
      content: [
        backlinkParagraph(src, opts.ourUrl ?? null),
        heading("이슈 내용"),
        ...paragraphs(src.content ?? "—"),
        ...(src.testPath ? [heading("테스트 경로"), ...paragraphs(src.testPath)] : []),
        ...(src.expected ? [heading("기대값"), ...paragraphs(src.expected)] : []),
        heading("정보"),
        bullets([
          ["화면", src.screen],
          ["우선순위", src.priorityName],
          ["환경", src.environmentName],
          ["시스템", src.systemName],
          ["플랫폼", src.platformNames.join(", ") || null],
          ["재현율", src.reproRateLabel],
          ["검출 버전", src.foundVersion],
          ["차수", src.roundName],
          ["QAI #", src.externalRef],
          ["우리 쪽 상태", src.statusName],
          // ⚠️ `toISOString()` 으로 자르지 않는다 — UTC 라 KST 오전 9시 이전이 **전날**로 찍힌다 (`C-40-3`)
          ["발생일", formatFull(src.reportedAt)],
        ]),
      ],
    },
  };

  const labels = (cfg.labels ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\s+/g, "_"))
    .filter(Boolean);
  if (labels.length > 0) fields.labels = labels;

  const pri = parsePriorityMap(cfg.priorityMap).get(src.priorityId);
  if (pri) fields.priority = { name: pri };

  const parent = (opts.parentKey ?? "").trim().toUpperCase();
  if (parent) fields.parent = { key: parent };

  // ⚠️ 필드 ID 와 값 **둘 다** 있어야 보낸다. 반쪽으로 보내면 400 이다.
  if (cfg.categoryFieldId && cfg.categoryValue) {
    fields[cfg.categoryFieldId] = { value: cfg.categoryValue };
  }

  return { fields };
}

// ── 실제로 보내기 ──────────────────────────────────────────

export type JiraSendResult =
  | { ok: true; key: string; url: string | null }
  /** 토큰이 없어 **보내지 않았다.** 고장이 아니다 */
  | { ok: false; preview: true; payload: JiraPayload }
  | { ok: false; preview?: false; message: string; status?: number };

/**
 * 티켓 하나를 만든다.
 *
 * ⚠️ **타임아웃을 우리가 건다** (15초). 2026-09-20 에 배운 것 —
 *   «대신 해 주는 층» 이 원인을 삼키면 `active=0` 같은 말만 남는다.
 *   여기서는 **무엇이 몇 초에 끊겼는지**를 그대로 화면에 올린다.
 * ⚠️ 실패 메시지에 **응답 본문을 담는다.** 지라의 400 은 어느 칸이 문제인지
 *   `errors` 에 정확히 말해 주는데, 그걸 버리면 `docs/23` 의 실수를 되풀이한다.
 */
export async function createJiraIssue(
  payload: JiraPayload,
  cfg: JiraConfig,
): Promise<JiraSendResult> {
  const creds = jiraCreds();
  if (!creds) return { ok: false, preview: true, payload };

  const base = cfg.baseUrl.replace(/\/+$/, "");
  const auth = Buffer.from(`${creds.email}:${creds.token}`).toString("base64");

  let res: Response;
  try {
    res = await fetch(`${base}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `지라에 닿지 못했습니다 (${msg}). 주소와 사내망·VPN 을 확인하세요.`,
    };
  }

  const raw = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, message: `${res.status} ${jiraError(raw)}` };
  }

  let key = "";
  try {
    key = String((JSON.parse(raw) as { key?: string }).key ?? "");
  } catch {
    // 200 인데 JSON 이 아니면 프록시가 가로챈 것이다 — 그 사실을 그대로 말한다
  }
  if (!key) {
    return { ok: false, message: "티켓은 만들어졌을 수 있으나 키를 읽지 못했습니다. 지라에서 확인하세요." };
  }
  return { ok: true, key, url: browseUrl(cfg.baseUrl, key) };
}

/** 지라의 오류 본문을 사람이 읽을 한 줄로. 못 읽으면 원문을 자른다 */
function jiraError(raw: string): string {
  try {
    const o = JSON.parse(raw) as { errorMessages?: string[]; errors?: Record<string, string> };
    const parts = [
      ...(o.errorMessages ?? []),
      ...Object.entries(o.errors ?? {}).map(([k, v]) => `${k}: ${v}`),
    ];
    if (parts.length > 0) return parts.join(" · ").slice(0, 500);
  } catch {
    // 아래로
  }
  return (raw || "본문 없음").slice(0, 300);
}

// ── 화면이 쓰는 조회 ──────────────────────────────────────

/** 이슈 상세가 쓰는 조회 한 벌 — 설정 + 링크 주소. **화면이 직접 DB 를 보지 않게** */
/**
 * 이슈 상세가 지라 상자를 그리는 데 필요한 것 한 벌.
 *
 * ★ **화면이 직접 DB 를 보지 않게** 한다 — 상세는 전체 페이지와 사이드 패널 **두 곳**에서
 *   그려지므로, 조회를 복제하면 곧 한쪽만 고치게 된다.
 *
 * ★★ **설정이 없으면 `null`** — 상세에 지라 절 자체를 그리지 않는다.
 *   여기서 빈 칸을 그리면 *"키를 적어 두면 눌러서 갈 수 있습니다"* 라고 말하게 되는데,
 *   사이트 주소가 없으면 **링크를 만들 수 없다.** 못 하는 것을 된다고 말하지 않는다.
 * ⚠️ 단, **이미 키가 적힌 이슈는 예외**다. 설정을 지워도 *"지라 WEB-123 로 넘어갔다"* 는
 *   기록은 남아 있어야 한다 — 그때는 링크 없이 키만 보인다.
 */
export async function jiraBoxData(projectId: number, jiraKey: string | null) {
  const cfg = await prisma.jiraSetting.findUnique({
    where: { projectId },
    select: { baseUrl: true, isActive: true, defaultParentKey: true },
  });
  if (!cfg && !jiraKey) return null;
  return {
    active: cfg?.isActive ?? false,
    hasToken: jiraCreds() !== null,
    defaultParentKey: cfg?.defaultParentKey ?? null,
    url: jiraKey ? browseUrl(cfg?.baseUrl, jiraKey) : null,
  };
}
