/**
 * 계정 관리 CLI. 관리자 화면(② 단계)이 생기기 전까지 쓰는 임시 도구다.
 *
 *   npm run user -- list
 *   npm run user -- create <아이디> <이름> <비밀번호> [--admin]
 *   npm run user -- password <아이디> <비밀번호>
 *   npm run user -- admin <아이디>            # 관리자로 승격
 *   npm run user -- rename <옛아이디> <새아이디>  # 로그인 아이디 변경
 *
 * 비밀번호는 bcrypt 해시로만 저장된다. 평문은 DB 어디에도 남지 않는다.
 */
import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { passwordProblem } from "../src/lib/password-rule";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(process.env.DATABASE_URL!),
});

const hash = (p: string) => bcrypt.hash(p, 12);

function checkPassword(pw: string) {
  const problem = passwordProblem(pw); // 내 계정 화면과 같은 규칙 (src/lib/password-rule.ts)
  if (problem) throw new Error(problem);
}

async function list() {
  const users = await prisma.user.findMany({
    orderBy: [{ systemRole: "asc" }, { loginId: "asc" }],
    select: {
      loginId: true, name: true, systemRole: true,
      isActive: true, passwordHash: true, lastLoginAt: true,
      _count: { select: { reportedIssues: true, assignedIssues: true } },
    },
  });

  console.log("\n아이디        이름        권한     비밀번호  작성   담당   최근 로그인");
  console.log("─".repeat(76));
  for (const u of users) {
    const pw = u.passwordHash ? "설정됨  " : "없음    ";
    const role = u.systemRole === "ADMIN" ? "관리자  " : "일반    ";
    const last = u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 10) : "—";
    const active = u.isActive ? "" : " (비활성)";
    console.log(
      `${u.loginId.padEnd(13)}${(u.name + active).padEnd(12)}${role}${pw}` +
      `${String(u._count.reportedIssues).padStart(5)}${String(u._count.assignedIssues).padStart(7)}   ${last}`
    );
  }
  console.log(`\n총 ${users.length}명 / 비밀번호 미설정 ${users.filter((u) => !u.passwordHash).length}명\n`);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case "list":
      await list();
      break;

    case "create": {
      const [loginId, name, password] = args;
      if (!loginId || !name || !password) {
        throw new Error("사용법: npm run user -- create <아이디> <이름> <비밀번호> [--admin]");
      }
      checkPassword(password);
      const isAdmin = args.includes("--admin");
      const user = await prisma.user.create({
        data: {
          loginId, name,
          passwordHash: await hash(password),
          systemRole: isAdmin ? "ADMIN" : "MEMBER",
        },
      });
      console.log(`✅ 생성: ${user.loginId} (${user.name}) ${isAdmin ? "· 관리자" : ""}`);
      break;
    }

    case "password": {
      const [loginId, password] = args;
      if (!loginId || !password) {
        throw new Error("사용법: npm run user -- password <아이디> <비밀번호>");
      }
      checkPassword(password);
      await prisma.user.update({
        where: { loginId },
        data: { passwordHash: await hash(password) },
      });
      // 비밀번호를 바꾸면 기존 세션을 전부 끊는다.
      // 비밀번호가 샜을 때 바꾸는 것인데 기존 로그인이 살아있으면 의미가 없다.
      const { count } = await prisma.session.deleteMany({ where: { user: { loginId } } });
      console.log(`✅ ${loginId} 비밀번호 변경 (기존 세션 ${count}개 종료)`);
      break;
    }

    case "rename": {
      const [from, to] = args;
      if (!from || !to) throw new Error("사용법: npm run user -- rename <옛아이디> <새아이디>");
      if (!/^[a-z0-9._-]{2,50}$/.test(to)) {
        throw new Error("새 아이디는 영문 소문자·숫자·. _ - 로만 2~50자여야 합니다.");
      }
      if (await prisma.user.findUnique({ where: { loginId: to } })) {
        throw new Error(`'${to}' 는 이미 쓰이고 있습니다.`);
      }
      const u = await prisma.user.update({
        where: { loginId: from },
        data: { loginId: to },
      });
      // 아이디를 바꾸면 기존 세션을 끊는다. 예전 아이디로 로그인해 둔 창이 남아 있으면 헷갈린다.
      const { count } = await prisma.session.deleteMany({ where: { userId: u.id } });
      console.log(`✅ ${from} → ${to} (${u.name}) · 기존 세션 ${count}개 종료`);
      break;
    }

    case "admin": {
      const [loginId] = args;
      if (!loginId) throw new Error("사용법: npm run user -- admin <아이디>");
      await prisma.user.update({ where: { loginId }, data: { systemRole: "ADMIN" } });
      console.log(`✅ ${loginId} → 관리자`);
      break;
    }

    default:
      console.log(`
계정 관리

  npm run user -- list
  npm run user -- create <아이디> <이름> <비밀번호> [--admin]
  npm run user -- password <아이디> <비밀번호>
  npm run user -- admin <아이디>
  npm run user -- rename <옛아이디> <새아이디>
`);
  }
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
