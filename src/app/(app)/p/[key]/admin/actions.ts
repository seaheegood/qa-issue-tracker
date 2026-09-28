"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateMasters } from "@/lib/revalidate";
import { JIRA_KEY_RE } from "@/lib/jira";
import { TEAM_ROLES, type TeamRolePick } from "@/lib/ui";

const HEX = /^#[0-9a-fA-F]{6}$/;

function clean(v: FormDataEntryValue | null, max: number) {
  return String(v ?? "").trim().slice(0, max);
}

/** 모든 액션 앞에서 관리자인지 확인한다. 화면을 숨기는 것만으로는 막은 게 아니다. */
async function guard() {
  await requireAdmin();
}

export type AdminState = { error?: string; ok?: string };

// ── 팀 ────────────────────────────────────────────────────

export async function updateProject(_p: AdminState, fd: FormData): Promise<AdminState> {
  await guard();
  const pr = await projectOf(fd);
  if (!pr) return { error: "프로젝트를 찾을 수 없습니다." };

  const key = clean(fd.get("key"), 10);
  const name = clean(fd.get("name"), 100);
  const prefixRaw = clean(fd.get("issuePrefix"), 10).toUpperCase();

  if (!name) return { error: "프로젝트 이름을 입력하세요." };
  if (prefixRaw && !/^[A-Z][A-Z0-9]{0,9}$/.test(prefixRaw)) {
    return { error: "약자는 영문 대문자로 시작하는 1~10자여야 합니다 (예: SP)." };
  }

  // 빈 문자열은 NULL 로 저장한다. '약자 없음'이 기본값이다.
  await prisma.project.update({
    where: { key },
    data: { name, issuePrefix: prefixRaw || null },
  });

  revalidatePath(`/p/${pr?.key}/admin/project`);
  revalidatePath(`/p/${pr?.key}/issues`);
  return { ok: prefixRaw ? `이슈번호가 ${prefixRaw}-1 형식으로 표시됩니다` : "이슈번호가 숫자만 표시됩니다" };
}

// ── 상태 ──────────────────────────────────────────────────



// ── 전이 규칙 ──────────────────────────────────────────────

/**
 * 한 칸(어느 상태 → 어느 상태)을 켜고 끈다.
 *
 * 꺼도 행을 지우지 않는다. 다시 켤 때 설정이 남아 있어야 하고,
 * 무엇을 껐는지가 화면에 보여야 "왜 이 길이 막혔지"를 답할 수 있다.
 */

export async function toggleTransition(fd: FormData) {
  await guard();
  const pr = await projectOf(fd);
  if (!pr) return;
  const fromId = Number(fd.get("fromId"));
  const toId = Number(fd.get("toId"));
  if (!fromId || !toId || fromId === toId) return;

  const from = await prisma.issueStatus.findUnique({ where: { id: fromId } });
  const to = await prisma.issueStatus.findUnique({ where: { id: toId } });
  if (!from || !to || from.projectId !== to.projectId) return;

  const existing = await prisma.statusTransition.findUnique({
    where: {
      projectId_fromStatusId_toStatusId: {
        projectId: from.projectId, fromStatusId: fromId, toStatusId: toId,
      },
    },
  });

  if (existing) {
    await prisma.statusTransition.update({
      where: { id: existing.id },
      data: { isActive: !existing.isActive },
    });
  } else {
    await prisma.statusTransition.create({
      data: { projectId: from.projectId, fromStatusId: fromId, toStatusId: toId },
    });
  }
  revalidatePath(`/p/${pr?.key}/admin/transitions`);
  revalidatePath(`/p/${pr?.key}/issues`);
}

/**
 * 전이별 Reason (docs/13 §5 · D-06).
 *
 * ★ 사유 필수를 **상태가 아니라 전이**에 두는 이유.
 *   `Fixed` 라는 도착지 하나로는 요구사항서를 만족할 수 없다 —
 *   `Merge Pending → Fixed` 는 *원인·조치·영향 범위*를,
 *   `Fixed → Closed` 는 *확인한 환경·케이스*를 받아야 한다. 출발지가 달라야 갈린다.
 *
 * ★ 안내 문구(`noteHint`)를 관리자가 고칠 수 있게 둔 이유.
 *   무엇을 적어야 하는지 안 알려주면 **"확인함" 세 글자**가 들어온다.
 *   프로젝트마다 확인할 것이 다르므로 코드에 박지 않는다.
 */

export async function setTransitionReason(fd: FormData) {
  await guard();
  const pr = await projectOf(fd);
  if (!pr) return;
  const id = Number(fd.get("id"));
  const require = fd.get("require") === "1";
  const label = String(fd.get("label") ?? "").trim().slice(0, 30);
  const hint = String(fd.get("hint") ?? "").trim().slice(0, 255);

  const t = await prisma.statusTransition.findUnique({ where: { id } });
  if (!t) return;

  await prisma.statusTransition.update({
    where: { id },
    // 끄더라도 문구는 지우지 않는다. 다시 켤 때 처음부터 쓰게 하면 아무도 안 켠다.
    data: { requireNote: require, noteLabel: label || null, noteHint: hint || null },
  });
  revalidatePath(`/p/${pr?.key}/admin/transitions`);
  revalidatePath(`/p/${pr?.key}/issues`);
}

// ── 차수 ──────────────────────────────────────────────────
//
// 우선순위·환경·시스템과 달리 차수는 **화면에서 늘린다.**
// 프로젝트가 돌면서 3차·4차가 계속 생기는데, 그때마다 seed 를 다시 돌릴 수는 없다.

/**
 * 폼이 실어 보낸 프로젝트로 찾는다.
 *
 * ★ 서버 액션은 라우트의 `[key]` 를 못 본다. 그래서 폼마다 `projectKey` 를 숨겨 보낸다.
 * ★ **없으면 조용히 넘어가지 않고 멈춘다.** 예전처럼 `"SP"` 를 기본값으로 두면
 *   폼 하나에서 빠뜨렸을 때 **엉뚱한 프로젝트가 바뀌고, 그건 아무도 못 알아챈다.**
 */
async function projectOf(fd: FormData) {
  const key = String(fd.get("projectKey") ?? "").toUpperCase();
  if (!key) return null;
  return prisma.project.findUnique({ where: { key }, select: { id: true, key: true } });
}

/** 날짜 칸은 비워 둘 수 있다. 차수를 만들 때 끝날 날을 모르는 게 보통이다. */
function dateOrNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? null : d;
}


export async function createRound(_p: AdminState, fd: FormData): Promise<AdminState> {
  await guard();
  const pr = await projectOf(fd);
  const pid = pr?.id ?? null;
  if (!pid) return { error: "프로젝트를 찾을 수 없습니다." };

  const name = clean(fd.get("name"), 50);
  const code = clean(fd.get("code"), 30).toUpperCase();
  if (!name) return { error: "차수 이름을 입력하세요." };
  if (!/^[A-Z0-9_-]{1,30}$/.test(code)) {
    return { error: "코드는 영문 대문자·숫자·_·- 로만 넣어주세요 (예: R3)." };
  }

  const exists = await prisma.round.findUnique({
    where: { projectId_code: { projectId: pid, code } },
  });
  if (exists) return { error: `'${code}' 는 이미 있습니다.` };

  const last = await prisma.round.findFirst({
    where: { projectId: pid }, orderBy: { sortOrder: "desc" },
  });
  await prisma.round.create({
    data: {
      projectId: pid, code, name,
      startedOn: dateOrNull(fd.get("startedOn")),
      endedOn: dateOrNull(fd.get("endedOn")),
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });

  revalidatePath(`/p/${pr?.key}/admin/rounds`);
  revalidatePath(`/p/${pr?.key}/issues`);
  return { ok: `'${name}' 추가됨` };
}


/**
 * 차수 한 줄을 고친다. 이름을 벗어나거나 날짜를 고르는 즉시 호출된다.
 *
 * ★ 예전에는 아무것도 돌려주지 않았다(`Promise<void>`). 그래서 **이름을 비운 채
 *   저장하면 조용히 아무 일도 안 일어났다** — 화면은 새 이름을 보여주는데 DB 는 옛 이름이다.
 *   `AdminState` 를 돌려줘서 실패는 말하고, 성공은 확인 문구를 띄운다 (C-25).
 */
export async function updateRound(_p: AdminState, fd: FormData): Promise<AdminState> {
  await guard();
  const pr = await projectOf(fd);
  if (!pr) return { error: "프로젝트를 찾을 수 없습니다." };
  const id = Number(fd.get("id"));
  const name = clean(fd.get("name"), 50);
  if (!id) return { error: "차수를 찾을 수 없습니다." };
  if (!name) return { error: "차수 이름은 비울 수 없습니다." };

  await prisma.round.update({
    where: { id },
    data: {
      name,
      startedOn: dateOrNull(fd.get("startedOn")),
      endedOn: dateOrNull(fd.get("endedOn")),
    },
  });
  revalidatePath(`/p/${pr?.key}/admin/rounds`);
  revalidatePath(`/p/${pr?.key}/issues`);
  return { ok: "저장했습니다" };
}

/**
 * 차수를 지우지 않고 비활성으로 돌린다.
 * 지우면 그 차수에서 발견된 이슈들이 어느 회차 것인지 알 수 없게 된다.
 * 팀·상태를 지우지 않는 것과 같은 이유다.
 */

export async function toggleRoundActive(fd: FormData) {
  await guard();
  const pr = await projectOf(fd);
  if (!pr) return;
  const id = Number(fd.get("id"));
  const round = await prisma.round.findUnique({ where: { id } });
  if (!round) return;
  // ★ **마지막 하나는 끄지 않는다** (`A-83`). 차수는 등록의 필수값이라 0개가 되면
  //   등록 화면의 차수 칸이 **빈 드롭다운**이 되고, 사람은 "차수를 골라주세요." 만
  //   듣는다 — 고를 것이 없는데. 우선순위·환경·플랫폼은 이미 이렇게 막고 있었다
  //   (`toggleMasterActive`). 여기만 뚫려 있었다 (2026-09-11).
  if (round.isActive) {
    const active = await prisma.round.count({ where: { projectId: pr.id, isActive: true } });
    if (active <= 1) return;
  }
  await prisma.round.update({ where: { id }, data: { isActive: !round.isActive } });
  revalidatePath(`/p/${pr?.key}/admin/rounds`);
  revalidatePath(`/p/${pr?.key}/issues`);
}

// ── 이슈 템플릿 ────────────────────────────────────────────
//
// 차수와 같은 이유로 화면을 준다 — 프로젝트가 돌면 템플릿이 계속 늘어난다 (P-2).
// 목적은 하나다: **필수값 9개의 부담을 상쇄한다** (docs/13 미결 3).

/** 템플릿 하나를 통째로 저장한다. 칸을 따로 저장하면 반쯤 채워진 템플릿이 남는다. */

export async function saveTemplate(fd: FormData) {
  await guard();
  const pr = await projectOf(fd);
  const pid = pr?.id ?? null;
  if (!pid) return;

  const id = Number(fd.get("id")) || 0;
  const name = clean(fd.get("name"), 60);
  if (!name) return;

  const num = (k: string) => {
    const v = String(fd.get(k) ?? "");
    return v === "" ? null : Number(v) || null;
  };
  const codes = fd.getAll("platform").map(String).filter(Boolean);

  const data = {
    name,
    // 재현 경로가 이 기능의 핵심이다. 매번 같은 진입 경로를 다시 치는 걸 없앤다.
    testPath: clean(fd.get("testPath"), 2000) || null,
    expected: clean(fd.get("expected"), 3000) || null,
    foundVersion: clean(fd.get("foundVersion"), 50) || null,
    screenName: clean(fd.get("screenName"), 255) || null,
    roundId: num("roundId"),
    priorityId: num("priorityId"),
    environmentId: num("environmentId"),
    systemId: num("systemId"),
    platformCodes: codes.length ? codes : undefined,
  };

  if (id) {
    await prisma.issueTemplate.update({ where: { id }, data });
  } else {
    const last = await prisma.issueTemplate.findFirst({
      where: { projectId: pid }, orderBy: { sortOrder: "desc" },
    });
    const dup = await prisma.issueTemplate.findUnique({
      where: { projectId_name: { projectId: pid, name } },
    });
    if (dup) return;   // 같은 이름은 만들지 않는다. 목록에서 구분이 안 된다
    await prisma.issueTemplate.create({
      data: { ...data, projectId: pid, sortOrder: (last?.sortOrder ?? 0) + 10 },
    });
  }
  revalidatePath(`/p/${pr?.key}/admin/templates`);
  revalidatePath(`/p/${pr?.key}/issues/new`);
}

/** 켜고 끈다. 지우지 않는 이유는 차수와 같다 — 다시 켤 때 설정이 남아 있어야 한다. */

export async function toggleTemplate(fd: FormData) {
  await guard();
  const pr = await projectOf(fd);
  if (!pr) return;
  const id = Number(fd.get("id"));
  const t = await prisma.issueTemplate.findUnique({ where: { id } });
  if (!t) return;
  await prisma.issueTemplate.update({ where: { id }, data: { isActive: !t.isActive } });
  revalidatePath(`/p/${pr?.key}/admin/templates`);
  revalidatePath(`/p/${pr?.key}/issues/new`);
}

// ── 시스템 ────────────────────────────────────────────────
//
// ★ **왜 이제야 화면이 생겼나** (2026-09-04).
//   `CLAUDE.md` 는 Phase 1 에서 열 설정을 **8가지**로 못박아 뒀는데(상태·전이규칙·
//   우선순위·환경·**시스템**·기능·기능분류·멤버) 시스템만 화면이 없었다.
//   첫 프로젝트은 seed 가 4종을 넣어 줘서 **없다는 걸 아무도 몰랐다.**
//
//   그런데 `create-project.ts` 는 시스템을 복제하지 않는다(당연하다 — `SV`·`SL` 은
//   첫 프로젝트의 것이다). 그래서 **새로 만든 프로젝트는 시스템이 0개**고,
//   시스템은 이슈 등록의 필수값이라 **이슈를 아예 등록할 수 없었다.**
//   `MALL`·`DW` 가 그 상태로 있었다. P-2("새 프로젝트를 5분 안에")가 깨진 자리다.

/**
 * 시스템 추가.
 *
 * ★ 코드는 **2글자**다. 기능ID 체계(`SVPR-01-01`)의 앞 두 글자가 이것이라
 *   여기서 길이를 흐트러뜨리면 기능ID 가 깨진다 (`docs/04`).
 */
export async function createSystem(_p: AdminState, fd: FormData): Promise<AdminState> {
  await guard();
  const pr = await projectOf(fd);
  const pid = pr?.id ?? null;
  if (!pid) return { error: "프로젝트를 찾을 수 없습니다." };

  const name = clean(fd.get("name"), 50);
  const code = clean(fd.get("code"), 2).toUpperCase();

  if (!name) return { error: "시스템 이름을 입력하세요." };
  if (!/^[A-Z]{2}$/.test(code)) {
    return { error: "코드는 **영문 대문자 두 글자**입니다 (예: SV). 기능ID 의 앞 두 글자가 됩니다." };
  }

  const exists = await prisma.system.findUnique({
    where: { projectId_code: { projectId: pid, code } },
  });
  if (exists) return { error: `'${code}' 는 이미 있습니다.` };

  const last = await prisma.system.findFirst({
    where: { projectId: pid }, orderBy: { sortOrder: "desc" },
  });
  await prisma.system.create({
    data: {
      projectId: pid, code, name,
      // userType · platform · baseUrl 은 받지 않는다 (A-68). 스키마 기본값으로 들어간다 —
      // 컬럼과 첫 프로젝트의 기존 값은 남는다 (A-69).
      description: clean(fd.get("description"), 500) || null,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });

  revalidatePath(`/p/${pr?.key}/admin/systems`);
  revalidatePath(`/p/${pr?.key}/issues/new`);
  return { ok: `'${name}' 을 더했습니다` };
}

/**
 * 이름·설명만 고친다. **코드는 못 바꾼다** — 기능ID 가 그걸 물고 있다.
 *
 * ★ `baseUrl` 을 여기서 빼는 것은 폼에서 칸을 뺀 것과 **한 쌍**이다. 칸만 지우고 이 줄을
 *   남겨두면 `fd.get("baseUrl")` 이 매번 빈 값이라 **저장할 때마다 기존 주소가 NULL 로 밀린다.**
 */
export async function updateSystem(_p: AdminState, fd: FormData): Promise<AdminState> {
  await guard();
  const pr = await projectOf(fd);
  if (!pr) return { error: "프로젝트를 찾을 수 없습니다." };
  const id = Number(fd.get("id"));
  const name = clean(fd.get("name"), 50);
  if (!id) return { error: "시스템을 찾을 수 없습니다." };
  if (!name) return { error: "시스템 이름은 비울 수 없습니다." };

  await prisma.system.update({
    where: { id },
    data: {
      name,
      description: clean(fd.get("description"), 500) || null,
    },
  });
  revalidatePath(`/p/${pr?.key}/admin/systems`);
  revalidatePath(`/p/${pr?.key}/issues`);
  return { ok: "저장했습니다" };
}

/**
 * 지우지 않고 비활성으로 돌린다.
 * 지우면 그 시스템에서 나온 이슈와 기능이 어디 것인지 알 수 없게 된다 —
 * 차수·상태·팀을 안 지우는 것과 같은 이유다.
 */
export async function toggleSystemActive(fd: FormData) {
  await guard();
  const pr = await projectOf(fd);
  if (!pr) return;
  const id = Number(fd.get("id"));
  const sys = await prisma.system.findUnique({ where: { id } });
  if (!sys) return;
  // ★ 차수와 같은 이유로 **마지막 하나는 끄지 않는다** (`A-83`).
  //   시스템은 배너가 있어 차수보다는 낫지만, 그 배너는 *"하나 만들어 주세요"* 라고
  //   말한다 — 꺼놓고 그 말을 들으면 **이미 있는 것을 또 만들게** 된다.
  if (sys.isActive) {
    const active = await prisma.system.count({ where: { projectId: pr.id, isActive: true } });
    if (active <= 1) return;
  }
  await prisma.system.update({ where: { id }, data: { isActive: !sys.isActive } });
  revalidatePath(`/p/${pr?.key}/admin/systems`);
  revalidatePath(`/p/${pr?.key}/issues`);
  revalidatePath(`/p/${pr?.key}/issues/new`);
}


// ── 우선순위 · 환경 · 플랫폼 (A-74~A-81) ─────────────────────────
//
// ★ 셋은 **같은 모양**이다 — 코드 · 이름 · 순서 · 사용 (우선순위만 색이 하나 더).
//   차수와도 같다. 그래서 액션도 화면도 하나로 만들고 `kind` 로 가른다.
//
// ★ 왜 이제 와서 화면을 주나. `create-project.ts` 가 이 셋을 원본 프로젝트에서
//   **복제**하는데 고칠 방법이 없었다. 그래서 새 프로젝트는 첫 프로젝트의 `POS` 를
//   물고 태어나 영원히 못 지웠다 (WEB 실사용 제보 — docs/피드백 FB-010).

/** `"use server"` 파일은 async 함수만 export 할 수 있다 — 타입은 지워지므로 괜찮다. */
export type MasterKind = "priority" | "environment" | "platform";

const MASTER_LABEL: Record<MasterKind, string> = {
  priority: "우선순위", environment: "환경", platform: "플랫폼",
};
const MASTER_TAB: Record<MasterKind, string> = {
  priority: "priorities", environment: "environments", platform: "platforms",
};

/**
 * 세 델리게이트를 하나로 다룬다.
 *
 * ★ union 타입(`typeof prisma.priority | typeof prisma.environment | …`)으로 두면
 *   TS 가 `findFirst` 호출을 **거부한다** — 세 오버로드의 인자 타입이 갈려서
 *   호출 시그니처가 하나로 좁혀지지 않기 때문이다. 셋 중 **공통 모양**인
 *   `environment` 로 맞춰 쓰고, 우선순위의 `color` 만 아래에서 따로 다룬다.
 */
const master = (k: MasterKind) =>
  (k === "priority" ? prisma.priority : k === "environment" ? prisma.environment : prisma.platform) as
    typeof prisma.environment;

function kindOf(fd: FormData): MasterKind | null {
  const k = String(fd.get("kind") ?? "");
  return k === "priority" || k === "environment" || k === "platform" ? k : null;
}

export async function createMaster(_p: AdminState, fd: FormData): Promise<AdminState> {
  await guard();
  const kind = kindOf(fd);
  if (!kind) return { error: "무엇을 추가하는지 알 수 없습니다." };
  const pr = await projectOf(fd);
  const pid = pr?.id ?? null;
  if (!pid) return { error: "프로젝트를 찾을 수 없습니다." };

  const label = MASTER_LABEL[kind];
  const name = clean(fd.get("name"), 50);
  const code = clean(fd.get("code"), 30).toUpperCase();
  if (!name) return { error: `${label} 이름을 입력하세요.` };
  if (!/^[A-Z0-9_-]{1,30}$/.test(code)) {
    return { error: "코드는 영문 대문자·숫자·_·- 로만 넣어주세요 (예: TABLET)." };
  }

  const exists = await master(kind).findFirst({ where: { projectId: pid, code } });
  if (exists) return { error: `'${code}' 는 이미 있습니다.` };

  const last = await master(kind).findFirst({
    where: { projectId: pid }, orderBy: { sortOrder: "desc" },
  });
  // 10 씩 띄운다 — 나중에 사이에 하나 끼울 때 전부 다시 번호 매기지 않아도 된다
  const sortOrder = (last?.sortOrder ?? 0) + 10;

  if (kind === "priority") {
    const color = clean(fd.get("color"), 7) || "#94a3b8";
    if (!HEX.test(color)) return { error: "색은 #RRGGBB 형식으로 골라주세요." };
    await prisma.priority.create({ data: { projectId: pid, code, name, color, sortOrder } });
  } else {
    await master(kind).create({ data: { projectId: pid, code, name, sortOrder } });
  }

  revalidateMasters(pr!.key, MASTER_TAB[kind]);
  return { ok: `'${name}' 을 더했습니다` };
}

/**
 * 한 줄을 고친다. 이름을 벗어나거나 순서·색을 바꾸는 즉시 호출된다.
 *
 * ★ **코드는 받지 않는다** (A-77). 공유 링크(`?priority=CRITICAL`)와 저장된 필터,
 *   내려받은 엑셀이 그 값을 물고 있다. 차수 코드·시스템 코드와 같은 이유다.
 */
export async function updateMaster(_p: AdminState, fd: FormData): Promise<AdminState> {
  await guard();
  const kind = kindOf(fd);
  if (!kind) return { error: "무엇을 고치는지 알 수 없습니다." };
  const pr = await projectOf(fd);
  if (!pr) return { error: "프로젝트를 찾을 수 없습니다." };

  const label = MASTER_LABEL[kind];
  const id = Number(fd.get("id"));
  const name = clean(fd.get("name"), 50);
  if (!id) return { error: `${label}을 찾을 수 없습니다.` };
  if (!name) return { error: `${label} 이름은 비울 수 없습니다.` };

  // 이 프로젝트의 것인지 확인한다 — id 는 폼에서 오므로 그대로 믿지 않는다
  const row = await master(kind).findFirst({ where: { id, projectId: pr.id } });
  if (!row) return { error: `${label}을 찾을 수 없습니다.` };

  const sortRaw = clean(fd.get("sortOrder"), 6);
  const sortOrder = sortRaw === "" ? row.sortOrder : Number(sortRaw);
  if (!Number.isFinite(sortOrder)) return { error: "순서는 숫자로 넣어주세요." };

  if (kind === "priority") {
    const color = clean(fd.get("color"), 7);
    if (color && !HEX.test(color)) return { error: "색은 #RRGGBB 형식으로 골라주세요." };
    await prisma.priority.update({
      where: { id }, data: { name, sortOrder, ...(color ? { color } : {}) },
    });
  } else {
    await master(kind).update({ where: { id }, data: { name, sortOrder } });
  }

  revalidateMasters(pr.key, MASTER_TAB[kind]);
  return { ok: "저장했습니다" };
}

/**
 * 지우지 않고 비활성으로 돌린다 (A-79). 지우면 그 값을 쓰던 이슈가 어디 것인지 알 수 없다.
 *
 * ★ **마지막 켜진 하나는 끌 수 없다** (A-80). 우선순위·환경은 이슈의 비울 수 없는 칸이고,
 *   플랫폼은 최소 하나를 골라야 등록된다 (N-01). 0개가 되면 **아무도 이슈를 못 올린다** —
 *   그것도 설정 화면이 아니라 등록 화면에서, 원인을 모른 채 막힌다.
 *   화면에서도 버튼을 막지만 서버에서도 막는다 (화면만 막은 것은 막은 게 아니다).
 */
export async function toggleMasterActive(fd: FormData) {
  await guard();
  const kind = kindOf(fd);
  if (!kind) return;
  const pr = await projectOf(fd);
  if (!pr) return;
  const id = Number(fd.get("id"));
  const row = await master(kind).findFirst({ where: { id, projectId: pr.id } });
  if (!row) return;

  if (row.isActive) {
    const activeCount = await master(kind).count({ where: { projectId: pr.id, isActive: true } });
    if (activeCount <= 1) return;   // 마지막 하나 — 끄지 않는다
  }

  await master(kind).update({ where: { id }, data: { isActive: !row.isActive } });
  revalidateMasters(pr.key, MASTER_TAB[kind]);
}

// ── 지라 연동 ──────────────────────────────────────────────

/**
 * 지라 설정 저장 (`J-02`~`J-09`).
 *
 * ★ **토큰은 받지 않는다.** 이 폼에는 토큰 칸이 아예 없다 —
 *   있으면 누군가 넣고, 넣으면 DB 와 백업에 평문으로 남는다 (`schema.prisma` JiraSetting 주석).
 * ★ 우선순위 짝짓기는 `jiraPri_<우리 id>` 라는 칸 여럿으로 온다 → JSON 한 덩어리로 접는다.
 */
export async function saveJiraSettings(_p: AdminState, fd: FormData): Promise<AdminState> {
  await guard();
  const pr = await projectOf(fd);
  if (!pr) return { error: "프로젝트를 찾을 수 없습니다." };

  // 끝의 `/` 를 떼어 저장한다 — 안 떼면 `//browse/…` 가 된다
  const baseUrl = clean(fd.get("baseUrl"), 200).replace(/\/+$/, "");
  const jiraProjectKey = clean(fd.get("jiraProjectKey"), 20).toUpperCase();
  const issueTypeId = clean(fd.get("issueTypeId"), 20);

  if (!/^https?:\/\/[^\s]+$/.test(baseUrl)) {
    return { error: "지라 주소는 http:// 또는 https:// 로 시작하는 주소여야 합니다 (예: https://your-company.atlassian.net)." };
  }
  if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(jiraProjectKey)) {
    return { error: "지라 프로젝트 키는 영문 대문자로 시작하는 2~20자여야 합니다 (예: WEB)." };
  }
  if (!/^\d{1,20}$/.test(issueTypeId)) {
    return { error: "이슈 타입은 **ID**(숫자)로 적습니다 — 이름(Bug)이 아닙니다 (예: 10355)." };
  }

  // 지라 라벨은 공백을 못 받는다. 조용히 `_` 로 바꾸고 저장한다 (보낼 때와 같은 규칙)
  const labels = clean(fd.get("labels"), 200)
    .split(",").map((s) => s.trim().replace(/\s+/g, "_")).filter(Boolean).join(",");

  const categoryFieldId = clean(fd.get("categoryFieldId"), 40);
  const categoryValue = clean(fd.get("categoryValue"), 100);
  if ((categoryFieldId === "") !== (categoryValue === "")) {
    return { error: "커스텀 필드는 **필드 ID 와 값을 둘 다** 적거나 둘 다 비워야 합니다. 반쪽으로 보내면 지라가 거부합니다." };
  }

  const defaultParentKey = clean(fd.get("defaultParentKey"), 30).toUpperCase();
  if (defaultParentKey && !JIRA_KEY_RE.test(defaultParentKey)) {
    return { error: "기본 Epic 은 지라 키 모양이어야 합니다 (예: WEB-123)." };
  }

  // 우선순위 짝짓기 — 이 프로젝트의 우선순위만 받는다 (남의 id 를 실어 보내도 걸러진다)
  const prios = await prisma.priority.findMany({
    where: { projectId: pr.id }, select: { id: true },
  });
  const map: Record<string, string> = {};
  for (const { id } of prios) {
    const v = clean(fd.get(`jiraPri_${id}`), 20);
    if (v) map[String(id)] = v;
  }
  const priorityMap = Object.keys(map).length > 0 ? JSON.stringify(map) : null;

  const data = {
    baseUrl, jiraProjectKey, issueTypeId,
    labels: labels || null,
    categoryFieldId: categoryFieldId || null,
    categoryValue: categoryValue || null,
    defaultParentKey: defaultParentKey || null,
    priorityMap,
  };

  await prisma.jiraSetting.upsert({
    where: { projectId: pr.id },
    update: data,
    // ★ 새로 만들 때는 **꺼진 상태**로 만든다. 채우는 일과 버튼을 보여주는 일을 가른다 (`J-10`)
    create: { projectId: pr.id, isActive: false, ...data },
  });

  revalidateJira(pr.key);
  return { ok: "저장했습니다" };
}

/**
 * 연동을 켜고 끈다 (`J-10`).
 *
 * ★ 꺼도 **설정을 지우지 않는다.** 마스터의 `사용` 토글과 같은 규칙이다.
 * ★ 이미 보낸 이슈의 지라 키는 꺼도 그대로 보인다 — 기록이기 때문이다.
 */
export async function toggleJiraActive(fd: FormData) {
  await guard();
  const pr = await projectOf(fd);
  if (!pr) return;
  const row = await prisma.jiraSetting.findUnique({ where: { projectId: pr.id } });
  if (!row) return;
  await prisma.jiraSetting.update({
    where: { projectId: pr.id }, data: { isActive: !row.isActive },
  });
  revalidateJira(pr.key);
}

/** 설정을 고치면 **설정 화면과 이슈 상세 둘 다** 다시 그려야 한다 (버튼이 거기 있다) */
function revalidateJira(projectKey: string) {
  revalidatePath(`/p/${projectKey}/admin/jira`);
  revalidatePath(`/p/${projectKey}/issues/[seq]`, "page");
  revalidatePath(`/p/${projectKey}/issues`);
}
