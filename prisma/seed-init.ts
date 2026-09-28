/**
 * 빈 DB 부트스트랩 — 첫 프로젝트 하나를 기본 설정과 함께 만든다.
 *
 *     npx prisma migrate deploy                     # ① 표를 만든다
 *     npm run setup -- ABC "첫 프로젝트"              # ② 첫 프로젝트 (키 · 이름)
 *     npm run user -- create <아이디> <이름> '<비번>' --admin   # ③ 첫 관리자
 *
 * 왜 필요한가 (2026-09-28):
 *   새 프로젝트는 화면에서 **기존 프로젝트를 복제**해서 만든다 (`src/lib/create-project.ts`).
 *   빈 DB 에는 복제할 원본이 없어서 **아무것도 시작할 수 없다.** 이 스크립트가 그 첫 원본을 만든다.
 *   그다음 프로젝트부터는 화면(관리자 설정 → 프로젝트)에서 이걸 복제한다.
 *
 * 만드는 것  프로젝트 1 · 상태 9 · 전이 24(Reason 포함) · 우선순위 4 · 환경 2 · 플랫폼 4 · 차수 `1차`
 *            값은 `prisma/masters.ts` — 이 앱의 기본값
 * 안 만드는 것
 *   - **시스템** — 프로젝트마다 다르다. 지어내지 않는다. 로그인 후 `프로젝트 설정 → 시스템` 에서 넣는다
 *     (이슈 등록 필수값이라 **넣기 전엔 등록이 막힌다** — 끝에 안내한다)
 *   - 팀 · 사용자 — `관리자 설정` 에서. 첫 관리자만 `npm run user` 로
 *
 * ⚠️ **프로젝트가 하나라도 있으면 안 돈다.** 이건 «처음 한 번» 도구다.
 *    이미 쓰는 DB 에 잘못 붙여도 아무것도 안 바뀐다.
 */
import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { adapterInput } from "../src/lib/db-url";
import { createMasters } from "./masters";

const [key, name] = process.argv.slice(2);
if (!key || !name) {
  console.error('사용법: npm run setup -- <키> <이름>     예) npm run setup -- ABC "첫 프로젝트"');
  process.exit(1);
}
if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) {
  console.error(`키는 영문 대문자로 시작하는 2~10자(대문자·숫자)여야 합니다: ${key}`);
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(adapterInput(process.env.DATABASE_URL!)) });

async function main() {
  const existing = await prisma.project.count();
  if (existing > 0) {
    console.error(`이미 프로젝트가 ${existing}개 있습니다. 새 프로젝트는 화면(관리자 설정 → 프로젝트)에서 복제해 만드세요.`);
    process.exitCode = 1;
    return;
  }

  const made = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({ data: { key, issuePrefix: key, name, issueSeq: 0 } });
    await createMasters(tx, project.id);
    await tx.round.create({ data: { projectId: project.id, code: "R1", name: "1차", sortOrder: 1 } });
    return project;
  });

  const admins = await prisma.user.count({ where: { systemRole: "ADMIN", isActive: true } });
  console.log(`\n✅ 첫 프로젝트  ${made.key} · ${made.name}`);
  console.log("   상태 9 · 전이 24 · 우선순위 4 · 환경 2 · 플랫폼 4 · 차수 1차\n");
  console.log("다음 할 일");
  if (admins === 0) console.log(`  ① 첫 관리자   npm run user -- create <아이디> <이름> '<비밀번호>' --admin`);
  console.log(`  ② 로그인 → 프로젝트 설정 → 시스템 추가   ★ 시스템이 없으면 이슈 등록이 막힙니다`);
  console.log(`  ③ 관리자 설정 → 팀 · 사용자\n`);
}

main().finally(() => prisma.$disconnect());
