import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { adapterInput } from "./db-url";

// Prisma 7부터는 클라이언트가 DB에 직접 붙지 않고 '드라이버 어댑터'를 통해 붙는다.
// MySQL은 mariadb 드라이버를 쓴다 (프로토콜이 호환된다).
//
// ★ **어떤 모양으로 붙을지는 `db-url.ts` 가 정한다.** 관리형 DB(TLS 필수)·서버리스(풀 제한)를
//   여기서 판단하면, 같은 판단이 데모 시드에도 또 필요해진다 (실제로 한 번 어긋났다).
function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 이 없습니다. .env.example 을 .env 로 복사하세요.");
  return new PrismaClient({ adapter: new PrismaMariaDb(adapterInput(url)) });
}

// 개발 중에는 파일을 고칠 때마다 모듈이 다시 로드된다.
// 그때마다 새 커넥션 풀을 만들면 커넥션이 계속 쌓여서 결국 DB가 접속을 거부한다.
// 그래서 전역 객체에 한 번 만든 클라이언트를 붙여두고 재사용한다.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
