import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

import type { TeamRole } from "@prisma/client";

/**
 * 로그인/세션.
 *
 * ── 왜 이 방식인가 ──────────────────────────────────────────
 * 1. 비밀번호는 **해시로만** 저장한다 (bcrypt).
 *    평문을 저장하면 DB가 유출될 때 그대로 털린다. 해시는 되돌릴 수 없다.
 *    bcrypt 는 일부러 느리게 설계돼서, 유출되더라도 대입 공격에 시간이 오래 걸린다.
 *
 * 2. 세션을 **JWT 가 아니라 DB** 에 둔다.
 *    JWT 는 한 번 발급하면 만료 전까지 무효화가 어렵다. 사내 도구에서는
 *    "로그아웃 즉시 끊기", "퇴사자 계정 즉시 차단"이 더 중요하다.
 *    하루 수십 명 규모라 조회 한 번은 부담이 아니다.
 *
 * 3. 쿠키에 담는 토큰의 **해시만** DB에 저장한다.
 *    세션 테이블이 유출돼도 그 값으로는 로그인할 수 없다. 비밀번호와 같은 원리다.
 *
 * ── SSO 로 바뀌면 ───────────────────────────────────────────
 * 사내 계정 체계(Q5)가 확인되면 `verifyPassword` 자리만 SSO 검증으로 바뀐다.
 * `createSession` 아래는 그대로 쓴다. users 테이블도 그대로다.
 * ───────────────────────────────────────────────────────── */

// ★ 2026-09-28 `pt_session` → `it_session` (예전 이름 ProjectTracker 의 흔적 정리).
//   바꾸는 순간 모두 **한 번 로그아웃**된다 — 옛 쿠키는 아무도 안 읽으니 그냥 남았다가 만료된다.
//   ⚠️ `proxy.ts` 도 같은 이름을 본다 (Edge 라 이 파일을 못 불러온다). 바꿀 땐 둘 다.
const COOKIE_NAME = "it_session";
const SESSION_DAYS = 14;
const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

/** 쿠키에 담을 원본 토큰과, DB에 저장할 해시를 함께 만든다. */
function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, id: sha256(token) };
}

function sha256(v: string) {
  return createHash("sha256").update(v).digest("hex");
}

/**
 * 이 요청이 HTTPS 로 들어왔는가.
 *
 * ★ 왜 `NODE_ENV === "production"` 으로 판단하면 안 되는가 (2026-08-24 실제 사고)
 *   `Secure` 쿠키는 **HTTPS 응답에서만 저장된다.** `localhost` 는 브라우저가
 *   예외로 봐주지만(보안 컨텍스트로 친다), `http://192.168.0.20:3000` 같은
 *   **사내망 IP 는 그냥 버린다.** 그것도 **조용히** — 응답에 `Set-Cookie` 는
 *   그대로 붙어 있어서 서버 로그만 봐서는 정상으로 보인다.
 *
 *   그 결과가 *"한 번 로그인하면 안 들어가지고 두 번 해야 된다"* 였다.
 *   서버 액션이 쿠키를 굽고 그 **같은 요청 안에서** 목적지를 그리기 때문에
 *   화면은 한 번 열린다. 그런데 브라우저에 남은 게 없으니 다음 이동에서
 *   `proxy.ts` 가 다시 로그인으로 돌려보낸다.
 *
 *   시험 운영(`npm run serve`)은 `next start` 라 NODE_ENV 가 production 인데
 *   주소는 평문 http 다. 개발 모드에서는 secure:false 라 **검증에서 안 잡혔다.**
 *
 * ⚠️ 평문 http 로 여는 동안은 같은 망에서 쿠키를 엿볼 수 있다.
 *   사내 서버에 HTTPS 가 붙으면 `x-forwarded-proto: https` 가 오므로
 *   **코드를 고치지 않아도** 자동으로 Secure 가 다시 붙는다 (`docs/12`).
 */
async function isHttpsRequest() {
  const h = await headers();
  // 리버스 프록시 뒤에서는 원래 프로토콜이 이 헤더로 온다. 값이 여러 개면 맨 앞이 클라이언트 쪽이다.
  const proto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim().toLowerCase();
  return proto === "https";
}

/** 로그인 성공 후 호출. 세션을 만들고 쿠키를 굽는다. */
export async function createSession(userId: number, userAgent?: string | null) {
  const { token, id } = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { id, userId, expiresAt, userAgent: userAgent?.slice(0, 255) ?? null },
  });
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,   // 자바스크립트로 못 읽는다 → XSS 로 토큰을 훔쳐가지 못함
    sameSite: "lax",  // 다른 사이트에서 넘어온 요청에는 쿠키를 안 실어보냄 → CSRF 완화
    secure: await isHttpsRequest(), // HTTPS 로 들어온 요청에만. 위 주석 참조
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    // 이미 지워졌을 수도 있으므로 deleteMany 로 조용히 처리한다
    await prisma.session.deleteMany({ where: { id: sha256(token) } });
  }
  jar.delete(COOKIE_NAME);
}

/**
 * 지금 쓰는 세션만 남기고 그 사람의 **다른 세션을 전부** 끊는다. 끊은 개수를 돌려준다.
 *
 * ★ 비밀번호를 바꾸는 이유는 대개 *"누가 알았을지 모른다"* 다. 다른 기기의 로그인이
 *   살아 있으면 바꾼 의미가 없다. 그렇다고 **지금 이 화면까지** 끊으면
 *   바꾸자마자 로그인 화면으로 튕겨서 *"바뀐 건가?"* 가 된다 — 그래서 하나는 남긴다.
 *   (`npm run user -- password` 는 관리자가 대신 바꾸는 것이라 전부 끊는다)
 */
export async function endOtherSessions(userId: number) {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const keep = token ? sha256(token) : "";
  const { count } = await prisma.session.deleteMany({ where: { userId, id: { not: keep } } });
  return count;
}

/** 그 사람의 세션을 **전부** 끊는다 — 관리자가 비밀번호를 초기화하거나 계정을 비활성으로 돌릴 때. */
export async function endAllSessions(userId: number) {
  const { count } = await prisma.session.deleteMany({ where: { userId } });
  return count;
}

/**
 * 관리자가 발급하는 **임시 비밀번호** — 10자.
 *
 * ★ 관리자가 직접 적게 하지 않는다. 사람이 고르면 `1234abcd` · `회사이름2026` 이 된다.
 * ★ 헷갈리는 글자(`0 O o 1 l I`)를 뺐다 — 메신저로 불러 주거나 옮겨 적는 값이다.
 * ★ `randomInt` 는 암호학적 난수다. `Math.random()` 은 예측될 수 있어 비밀번호에 쓰면 안 된다.
 */
export function tempPassword() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => abc[randomInt(abc.length)]).join("");
}

export type SessionUser = {
  id: number;
  loginId: string;
  name: string;
  systemRole: "ADMIN" | "MEMBER";
  /**
   * 직군 — **소속 팀이 정한다** (`teams.role` · 2026-09-11).
   *
   * ★ 예전엔 `project_members.role` 이었고, 쓸 때마다 프로젝트마다 한 번씩
   *   더 조회했다. 팀으로 옮기면서 **세션이 이미 하는 조회에 얹었다** —
   *   질의가 하나도 늘지 않는다.
   *
   * ★ NULL 을 `QA` 로 메우지 않는다. 팀이 없으면 역할도 **없는 것**이고,
   *   이력에는 빈 칸으로 남는 게 맞다. 코멘트 유형만 QA 로 떨어진다
   *   (`ROLE_TO_TYPE` — 지금까지 LEAD·VIEWER 가 QA 로 떨어지던 것과 같다).
   */
  role: TeamRole | null;
};

/** 로그인 안 했으면 null. 화면에서 "로그인했으면 ~" 을 그릴 때 쓴다. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: sha256(token) },
    include: {
      user: {
        select: {
          id: true, loginId: true, name: true, systemRole: true, isActive: true,
          team: { select: { role: true } },
        },
      },
    },
  });

  if (!session) return null;

  // 만료됐거나 비활성 계정이면 세션을 치운다.
  // 퇴사 처리(is_active=false)가 즉시 반영되는 지점이다 — JWT 로는 이게 안 된다.
  if (session.expiresAt < new Date() || !session.user.isActive) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  const { id, loginId, name, systemRole, team } = session.user;
  return { id, loginId, name, systemRole, role: team?.role ?? null };
}

/** 로그인 필수 화면에서 쓴다. 없으면 로그인 화면으로 보낸다. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
  }
  return user;
}

/** 관리자 전용 화면에서 쓴다. (② 관리자 기능에서 사용 예정) */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") redirect("/");
  return user;
}

export const SESSION_COOKIE = COOKIE_NAME;
