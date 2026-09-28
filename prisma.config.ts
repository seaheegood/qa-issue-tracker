// Prisma 7 설정 파일.
//
// Prisma 6까지는 schema.prisma 안에 접속 주소를 적었다:
//     datasource db { provider = "mysql"  url = env("DATABASE_URL") }
//
// 7부터는 그게 금지됐다. 스키마는 '테이블이 어떻게 생겼는가'만 담고,
// '어느 DB에 붙는가'는 이 파일이 담는다.
// 스키마 파일이 개발/운영 환경에 따라 달라지지 않게 하려는 변경이다.

import "dotenv/config"; // .env 를 읽어 process.env 에 넣는다 (Prisma 7은 자동으로 안 읽음)
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",

  datasource: {
    url: env("DATABASE_URL"),
  },

  migrations: {
    // `npx prisma db seed` 로 실행될 명령.
    // tsx = TypeScript 파일을 컴파일 없이 바로 실행해주는 도구
    seed: "tsx prisma/seed.ts",
  },
});
