"use server";

import { revalidatePath } from "next/cache";

import { endAllSessions, hashPassword, requireAdmin, tempPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateAllIssueScreens } from "@/lib/revalidate";
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

/**
 * 팀의 **직군** (2026-09-11 — 멤버 폐지).
 *
 * ★ 이 값이 **코멘트 유형**(FR-302)과 **답변 주체**(FR-208)를 정한다.
 *   예전엔 `project_members.role` 이 프로젝트마다 따로 정했는데,
 *   실제로는 소속 팀과 100% 같았다 (`docs/03` v13).
 *
 * ⚠️ `LEAD` 는 고를 수 없다 — 과거 이력에만 남는 값이다 (`TeamRole` 주석).
 */
// ⚠️ 고를 수 있는 값과 이름표는 `lib/ui` 에 둔다 —
//    **`"use server"` 파일은 async 함수만 내보낼 수 있다** (CLAUDE.md 의 함정).
function teamRole(v: FormDataEntryValue | null): TeamRolePick | null {
  const raw = String(v ?? "");
  return (TEAM_ROLES as readonly string[]).includes(raw) ? (raw as TeamRolePick) : null;
}

// ── 팀 ────────────────────────────────────────────────────

// ★ 팀·사용자는 **프로젝트 밖**이다 (project_id 가 없다).
//   그래서 /p/[key]/ 아래가 아니라 여기 남는다.

export async function createTeam(_p: AdminState, fd: FormData): Promise<AdminState> {
  await guard();

  const name = clean(fd.get("name"), 50);
  const color = clean(fd.get("color"), 7);
  const description = clean(fd.get("description"), 200);

  if (!name) return { error: "팀 이름을 입력하세요." };
  if (!HEX.test(color)) return { error: "색상 형식이 올바르지 않습니다 (#RRGGBB)." };

  const exists = await prisma.team.findUnique({ where: { name } });
  if (exists) return { error: `'${name}' 은 이미 있습니다.` };

  const last = await prisma.team.findFirst({ orderBy: { sortOrder: "desc" } });
  await prisma.team.create({
    data: {
      name,
      color,
      role: teamRole(fd.get("role")),
      description: description || null,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });

  revalidatePath("/admin/teams");
  revalidateAllIssueScreens();
  return { ok: `'${name}' 추가됨` };
}


export async function updateTeam(fd: FormData) {
  await guard();

  const id = Number(fd.get("id"));
  const name = clean(fd.get("name"), 50);
  const color = clean(fd.get("color"), 7);
  const description = clean(fd.get("description"), 200);
  if (!id || !name || !HEX.test(color)) return;

  await prisma.team.update({
    where: { id },
    // ★ 역할을 바꿔도 **이미 찍힌 이력은 그대로다.** 이력에는 그때의 값이 박혀 있다.
    data: { name, color, role: teamRole(fd.get("role")), description: description || null },
  });

  revalidatePath("/admin/teams");
  revalidatePath("/admin/users");
  revalidateAllIssueScreens();
}

/**
 * 팀을 지우지 않고 비활성으로 돌린다.
 * 지우면 그 팀에 속했던 사람들의 소속 기록이 통째로 사라진다.
 * users 에서 퇴사자를 지우지 않는 것과 같은 이유다.
 */

export async function toggleTeamActive(fd: FormData) {
  await guard();
  const id = Number(fd.get("id"));
  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) return;
  await prisma.team.update({ where: { id }, data: { isActive: !team.isActive } });
  revalidatePath("/admin/teams");
  revalidatePath("/admin/users");
}

// ── 사용자 ────────────────────────────────────────────────


export async function setUserTeam(fd: FormData) {
  await guard();

  const userId = Number(fd.get("userId"));
  const raw = String(fd.get("teamId") ?? "");
  const teamId = raw === "" ? null : Number(raw);
  if (!userId) return;

  await prisma.user.update({ where: { id: userId }, data: { teamId } });

  revalidatePath("/admin/users");
  revalidateAllIssueScreens();
}


export async function setUserRole(fd: FormData) {
  const me = await requireAdmin();

  const userId = Number(fd.get("userId"));
  const role = String(fd.get("systemRole"));
  if (!userId || (role !== "ADMIN" && role !== "MEMBER")) return;

  // 자기 자신의 관리자 권한은 못 뺀다. 마지막 관리자가 스스로를 강등하면
  // 아무도 관리자 화면에 못 들어가는 상태가 된다.
  if (userId === me.id && role === "MEMBER") return;

  await prisma.user.update({ where: { id: userId }, data: { systemRole: role } });
  revalidatePath("/admin/users");
}

// ── 사용자 추가 · 비밀번호 초기화 · 비활성 (2026-09-28 · `A-105`~`A-114`) ──
//
// ★ 전에는 전부 **명령(`npm run user`)으로만** 됐다 (`A-29`). 빈 DB 로 새로 시작하면
//   동료 계정을 관리자가 터미널에서 하나씩 만들어야 했고, **비활성은 명령에도 없어서**
//   퇴사자를 막으려면 DB 를 직접 고쳐야 했다.

/** 결과 — `temp` 는 **이번 한 번만** 화면에 뜨는 임시 비밀번호. DB 에는 해시만 남는다. */
export type UserState = { error?: string; ok?: string; temp?: string };

/** 아이디 규칙 — 영문 소문자·숫자·`.`·`_`·`-`, 2~30자. `ab.cde` · `user01` 같은 모양이 전부 들어온다. */
const LOGIN_ID = /^[a-z0-9][a-z0-9._-]{1,29}$/;

export async function createUser(_p: UserState, fd: FormData): Promise<UserState> {
  await guard();

  const name = clean(fd.get("name"), 50);
  const loginId = clean(fd.get("loginId"), 30).toLowerCase();
  const rawTeam = String(fd.get("teamId") ?? "");
  const teamId = rawTeam === "" ? null : Number(rawTeam) || null;
  const systemRole = fd.get("systemRole") === "ADMIN" ? "ADMIN" : "MEMBER";

  if (!name || !loginId) return { error: "이름과 아이디를 입력하세요." };
  if (!LOGIN_ID.test(loginId)) {
    return { error: "아이디는 영문 소문자·숫자·점(.)·밑줄(_)·하이픈(-)으로 2~30자입니다." };
  }
  if (await prisma.user.findUnique({ where: { loginId }, select: { id: true } })) {
    return { error: `'${loginId}' 는 이미 있는 아이디입니다.` };
  }

  const temp = tempPassword();
  await prisma.user.create({
    data: { name, loginId, teamId, systemRole, passwordHash: await hashPassword(temp) },
  });

  revalidatePath("/admin/users");
  revalidateAllIssueScreens(); // 담당자·멘션 후보에 바로 나와야 한다
  return { ok: `${name}(${loginId}) 추가됨`, temp };
}

/**
 * 비밀번호 초기화 — 비밀번호가 없는 계정에는 **발급**이 된다. 같은 동작이다.
 * ★ 그 사람의 로그인을 **전부** 끊는다. 초기화는 대개 *"잊었다"* 또는 *"샜다"* 이고,
 *   샜다면 살아 있는 세션이 곧 남의 손에 있는 세션이다 (`npm run user -- password` 와 같다).
 */
export async function resetUserPassword(_p: UserState, fd: FormData): Promise<UserState> {
  await guard();
  const userId = Number(fd.get("userId"));
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } }) : null;
  if (!user) return { error: "사용자를 찾을 수 없습니다." };
  if (!user.isActive) return { error: "비활성 계정입니다. 먼저 활성으로 돌리세요." };

  const temp = tempPassword();
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(temp) } });
  await endAllSessions(userId);
  revalidatePath("/admin/users");
  return { temp };
}

/**
 * 활성 ↔ 비활성. **지우지 않는다** — 그 사람이 쓴 이슈·코멘트·이력이 남아 있어야 한다.
 * ★ 비활성으로 돌리면 세션을 끊는다. `getCurrentUser()` 가 다음 요청에서 어차피 튕기지만(`C-05`),
 *   세션 행을 남겨 둘 이유가 없다.
 * ⚠️ 자기 자신은 못 끈다 — 마지막 관리자가 스스로를 끄면 아무도 이 화면에 못 들어온다 (`A-26` 과 같은 이유).
 */
export async function toggleUserActive(fd: FormData) {
  const me = await requireAdmin();
  const userId = Number(fd.get("userId"));
  if (!userId || userId === me.id) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
  if (!user) return;

  await prisma.user.update({ where: { id: userId }, data: { isActive: !user.isActive } });
  if (user.isActive) await endAllSessions(userId);

  revalidatePath("/admin/users");
  revalidateAllIssueScreens(); // 담당자·멘션 후보에서 빠지거나 돌아온다
}

// ── 의견 (2026-09-28 · `F-08`) ─────────────────────────────

/** 읽음 ↔ 안 읽음. 지우지 않는다 — 들은 것의 기록이다. */
export async function toggleFeedbackChecked(fd: FormData) {
  const me = await requireAdmin();
  const id = Number(fd.get("id"));
  if (!id) return;
  const row = await prisma.feedback.findUnique({ where: { id }, select: { checkedAt: true } });
  if (!row) return;
  await prisma.feedback.update({
    where: { id },
    data: row.checkedAt ? { checkedAt: null, checkedById: null } : { checkedAt: new Date(), checkedById: me.id },
  });
  revalidatePath("/admin/feedback");
  revalidatePath("/", "layout"); // 사이드바의 안 읽음 수
}

// ── 프로젝트 ──────────────────────────────────────────────

