/**
 * 프로젝트 설정의 «모양» — 이 앱의 기본값. 빈 DB 에서 첫 프로젝트를 만들 때 쓴다.
 *
 * 쓰는 곳
 *   prisma/seed-init.ts  빈 DB 부트스트랩 (`npm run setup`)
 *   prisma/seed-demo.ts  공개 데모
 *
 * 상태 9종 · 전이 24개(Reason 11개) · 우선순위 4 · 환경 2 · 플랫폼 4.
 *   특정 프로젝트의 설정이 아니라 **이 앱이 어떻게 동작하는가**다 — 상태 9종과 Reason 은
 *   현업 요구사항서(`docs/13`)와 피드백(FB-008)에서 정해졌다. 그래서 코드에 두어도 된다.
 *   `seed.ts` 가 읽는 `data/*.json`(초기 표본으로 빌려 온 엑셀)과는 성격이 다르다.
 *
 * ★ 왜 한 파일인가 — 전에는 `seed-demo.ts` 안에만 있었다. 부트스트랩이 따로 들고 있으면
 *   상태를 하나 늘릴 때 **한쪽만 고치게 된다** (`buildWhere` 를 한 곳에 둔 것과 같은 이유).
 *   새 프로젝트는 여기가 아니라 **기존 프로젝트를 복제**해서 만든다 (`src/lib/create-project.ts`).
 *   이 파일은 **복제할 원본이 하나도 없을 때**만 쓰인다.
 */
import type { PrismaClient } from "@prisma/client";

export const STATUSES = [
  { code: "OPEN",          name: "Open",          category: "OPEN"     as const, color: "#F59E0B", isInitial: true,  isTerminal: false },
  { code: "IN_PROGRESS",   name: "In Progress",   category: "OPEN"     as const, color: "#F97316", isInitial: false, isTerminal: false },
  { code: "MERGE_PENDING", name: "Merge Pending", category: "OPEN"     as const, color: "#EAB308", isInitial: false, isTerminal: false },
  { code: "REOPENED",      name: "Reopened",      category: "OPEN"     as const, color: "#EF4444", isInitial: false, isTerminal: false },
  { code: "FIXED",         name: "Fixed",         category: "RESOLVED" as const, color: "#3B82F6", isInitial: false, isTerminal: false },
  { code: "ANSWERED",      name: "Answered",      category: "RESOLVED" as const, color: "#6366F1", isInitial: false, isTerminal: false },
  { code: "MONITORING",    name: "Monitoring",    category: "PENDING"  as const, color: "#06B6D4", isInitial: false, isTerminal: false },
  { code: "CLOSED",        name: "Closed",        category: "CLOSED"   as const, color: "#10B981", isInitial: false, isTerminal: true  },
  { code: "DEMAND",        name: "Demand",        category: "PENDING"  as const, color: "#A855F7", isInitial: false, isTerminal: false },
];

const QA_HINT = "어느 버전·환경에서 몇 번 시도해 재현되지 않았는지, 다음 차수에 무엇을 확인해야 하는지 적습니다.";
const REOPEN_HINT = "재현 조건과 남은 현상을 적습니다. 화면이 있으면 첨부도 같이.";
const DEMAND_HINT = "무엇을 누구에게 묻는지, 결정할 선택지를 적습니다.";

/** [from, to, 사유필수, 사유라벨, 사유안내] */
export const TRANSITIONS: [string, string, boolean, string | null, string | null][] = [
  ["OPEN", "IN_PROGRESS", false, null, null],
  ["OPEN", "MONITORING", true, "QA Reason", QA_HINT],
  ["OPEN", "CLOSED", false, null, null],
  ["OPEN", "DEMAND", true, "Demand Reason", DEMAND_HINT],
  ["IN_PROGRESS", "MERGE_PENDING", false, null, null],
  ["IN_PROGRESS", "CLOSED", false, null, null],
  ["IN_PROGRESS", "DEMAND", true, "Demand Reason", DEMAND_HINT],
  ["MERGE_PENDING", "IN_PROGRESS", false, null, null],
  ["MERGE_PENDING", "FIXED", true, "Developer Reason", "원인 · 조치 · 영향 범위를 적습니다."],
  ["MERGE_PENDING", "CLOSED", false, null, null],
  ["REOPENED", "IN_PROGRESS", false, null, null],
  ["REOPENED", "MONITORING", true, "QA Reason", QA_HINT],
  ["REOPENED", "CLOSED", false, null, null],
  ["FIXED", "REOPENED", true, "QA Reason", REOPEN_HINT],
  ["FIXED", "MONITORING", true, "QA Reason", QA_HINT],
  ["FIXED", "CLOSED", true, "QA Reason", "확인한 환경·버전과 확인한 케이스를 적습니다."],
  ["ANSWERED", "OPEN", false, null, null],
  ["ANSWERED", "IN_PROGRESS", false, null, null],
  ["ANSWERED", "CLOSED", false, null, null],
  ["MONITORING", "REOPENED", true, "QA Reason", REOPEN_HINT],
  ["MONITORING", "CLOSED", false, null, null],
  ["CLOSED", "REOPENED", true, "QA Reason", REOPEN_HINT],
  ["DEMAND", "ANSWERED", true, "Answer Reason", "받은 답변을 그대로 적습니다. 요약하면 나중에 근거가 못 됩니다."],
  ["DEMAND", "CLOSED", false, null, null],
];

export const PRIORITIES = [
  { code: "CRITICAL", name: "Critical", color: "#DC2626" },
  { code: "MAJOR",    name: "Major",    color: "#EA580C" },
  { code: "NORMAL",   name: "Normal",   color: "#0284C7" },
  { code: "MINOR",    name: "Minor",    color: "#64748B" },
];
export const ENVIRONMENTS = [
  { code: "DEV",   name: "개발(Dev)" },
  { code: "STAGE", name: "Stage" },
];
export const PLATFORMS = [
  { code: "PC", name: "PC" }, { code: "AOS", name: "AOS" },
  { code: "IOS", name: "iOS" }, { code: "POS", name: "POS" },
];

type Db = Pick<PrismaClient, "issueStatus" | "statusTransition" | "priority" | "environment" | "platform">;

/** 한 프로젝트에 위 설정을 전부 만든다. 코드 → 새 id 표를 돌려준다 (이슈를 채울 때 쓴다). */
export async function createMasters(db: Db, projectId: number) {
  const st = new Map<string, number>();
  for (const [i, s] of STATUSES.entries()) {
    const row = await db.issueStatus.create({ data: { projectId, ...s, sortOrder: i + 1, isActive: true } });
    st.set(s.code, row.id);
  }
  await db.statusTransition.createMany({
    data: TRANSITIONS.map(([f, t, req, label, hint]) => ({
      projectId, fromStatusId: st.get(f)!, toStatusId: st.get(t)!,
      requireNote: req, noteLabel: label, noteHint: hint, isActive: true,
    })),
  });
  const pr = new Map<string, number>();
  for (const [i, x] of PRIORITIES.entries()) {
    const row = await db.priority.create({ data: { projectId, ...x, sortOrder: i + 1 } });
    pr.set(x.code, row.id);
  }
  const env = new Map<string, number>();
  for (const [i, x] of ENVIRONMENTS.entries()) {
    const row = await db.environment.create({ data: { projectId, ...x, sortOrder: i + 1 } });
    env.set(x.code, row.id);
  }
  const plat = new Map<string, number>();
  for (const [i, x] of PLATFORMS.entries()) {
    const row = await db.platform.create({ data: { projectId, ...x, sortOrder: i + 1 } });
    plat.set(x.code, row.id);
  }
  return { st, pr, env, plat };
}
