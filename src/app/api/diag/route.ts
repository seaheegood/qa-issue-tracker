import { lookup } from "node:dns/promises";
import { connect as tcpConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";

import { poolConfig, appEnv } from "@/lib/db-url";

/**
 * DB 까지 가는 길을 **층마다 따로** 재는 진단 경로.
 *
 * ★★ **왜 만들었나** (2026-09-20).
 *   Vercel 에 올린 뒤 로그인이 500 이었고, 로그에 남은 건 이것뿐이었다:
 *
 *       pool timeout: failed to retrieve a connection from pool after 20000ms
 *           (pool connections: active=0 idle=0 limit=3)
 *
 *   ⚠️ **커넥션 풀은 «왜 못 붙었는지»를 삼킨다.** 각 시도의 진짜 오류(인증 거부 ·
 *   TLS 실패 · 포트 차단)가 풀 안에서 사라지고, 부르는 쪽에는 *"시간이 다 됐다"* 만 남는다.
 *   그래서 **밖에서 아무리 봐도 원인이 안 보인다** — 방화벽을 열어 봐도, 접속 주소를
 *   다시 넣어 봐도 증상이 똑같다. 실제로 그렇게 한 번 헛다리를 짚었다.
 *
 *   여기서는 **풀을 쓰지 않고** DNS → TCP → TLS → MySQL 핸드셰이크를 하나씩 밟는다.
 *   어느 층에서 멈추는지가 곧 원인이다:
 *
 *   | 어디서 멈추나 | 뜻 |
 *   |---|---|
 *   | DNS | 주소가 틀렸다 |
 *   | TCP | **그 포트로 나가는 길이 막혔다** (플랫폼 방화벽) |
 *   | TLS | 인증서·CA 문제 |
 *   | MySQL | 계정·비밀번호·DB 이름 |
 *   | 전부 통과인데 풀만 실패 | 풀 설정(동시 개수·대기 시간) |
 *
 * ⚠️ **폴더 이름을 `_diag` 로 지었다가 한 번 헛돌았다.** App Router 는 `_` 로 시작하는
 *   폴더를 **비공개 폴더**로 보고 라우트에서 빼 버린다. 파일은 있는데 주소가 없어서
 *   **앱의 404 화면**이 떴고, 잠깐 «열쇠가 틀렸나» 를 의심했다.
 *
 * ★ **기본은 «없는 페이지»다.** `IT_DIAG_KEY` 가 없으면 404 를 준다.
 *   열쇠가 맞아도 **비밀번호는 한 글자도 돌려주지 않는다** — 호스트·포트·DB 이름과
 *   각 층의 성공 여부·소요 시간만 준다.
 */
export const dynamic = "force-dynamic";

const ms = (t: number) => `${Date.now() - t}ms`;

function err(e: unknown) {
  const x = e as { message?: string; code?: string; errno?: number; cause?: { message?: string } };
  return [x?.code, x?.message, x?.cause?.message].filter(Boolean).join(" | ").slice(0, 300);
}

export async function GET(req: Request) {
  const key = appEnv("DIAG_KEY");
  if (!key) return new Response("Not Found", { status: 404 });
  if (new URL(req.url).searchParams.get("key") !== key) {
    return new Response("Not Found", { status: 404 });
  }

  const url = process.env.DATABASE_URL;
  const out: Record<string, unknown> = {
    // 값이 아니라 **있는가**만. 값을 돌려주면 이 경로가 비밀 유출구가 된다.
    env: {
      DATABASE_URL: !!url,
      IT_DB_SSL: appEnv("DB_SSL") ?? null,
      IT_DB_POOL: appEnv("DB_POOL") ?? null,
      IT_STORAGE: appEnv("STORAGE") ?? null,
      IT_DEMO: appEnv("DEMO") ?? null,
      IT_MAX_UPLOAD_MB: appEnv("MAX_UPLOAD_MB") ?? null,
      region: process.env.VERCEL_REGION ?? null,
      node: process.version,
    },
  };
  if (!url) return Response.json(out, { status: 500 });

  const cfg = poolConfig(url);
    // ★ 사용자명은 **값이 아니라 «모양»만** 준다. TiDB 는 `<클러스터>.<계정>` 형태를 요구하는데,
  //   주소가 잘못 잘리면 여기가 먼저 망가진다. 실제로 이것 때문에 한 번 막혔다.
  out.target = {
    host: cfg.host, port: cfg.port, database: cfg.database, sslOn: !!cfg.ssl,
    userLen: cfg.user.length,
    userHasPrefix: cfg.user.includes("."),
    userHead: cfg.user.slice(0, 4),
    passLen: cfg.password.length,
  };

  // ① DNS
  let t = Date.now();
  try {
    const a4 = await lookup(cfg.host, { family: 4 }).catch(() => null);
    const a6 = await lookup(cfg.host, { family: 6 }).catch(() => null);
    out.dns = { ok: true, ipv4: a4?.address ?? null, ipv6: a6?.address ?? null, took: ms(t) };
  } catch (e) { out.dns = { ok: false, error: err(e), took: ms(t) }; }

  // ② TCP — 여기서 막히면 «그 포트로 나가는 길» 이 없는 것이다
  t = Date.now();
  out.tcp = await new Promise((res) => {
    const s = tcpConnect({ host: cfg.host, port: cfg.port });
    const fin = (v: object) => { s.destroy(); res({ ...v, took: ms(t) }); };
    s.setTimeout(12_000);
    s.once("connect", () => fin({ ok: true }));
    s.once("timeout", () => fin({ ok: false, error: "timeout 12s" }));
    s.once("error", (e) => fin({ ok: false, error: err(e) }));
  });

  // ③ TLS (실패해도 대개 정상 — 아래 주석 참고)
  t = Date.now();
  out.tls = await new Promise((res) => {
    const s = tlsConnect({ host: cfg.host, port: cfg.port, servername: cfg.host });
    const fin = (v: object) => { s.destroy(); res({ ...v, took: ms(t) }); };
    s.setTimeout(12_000);
    s.once("secureConnect", () => fin({ ok: true, authorized: s.authorized, err: s.authorizationError?.message ?? null }));
    // ⚠️ **여기 실패는 대개 정상이다.** MySQL 의 4000/3306 번은 «열자마자 TLS» 가 아니라
    //   평문으로 시작해 핸드셰이크 중에 TLS 로 올라간다(STARTTLS 방식). 그래서 생 TLS 로
    //   찌르면 `ERR_SSL_WRONG_VERSION_NUMBER` 가 난다. **진짜 TLS 판정은 ④ mysql 층**이다.
    //   이 줄이 없으면 다음 사람이 여기서 멈춰 애먼 인증서를 뒤진다.
    s.once("timeout", () => fin({ ok: false, error: "timeout 12s" }));
    s.once("error", (e) => fin({ ok: false, error: err(e) }));
  });

  // ④ MySQL 핸드셰이크 — 풀 없이 단 한 개
  t = Date.now();
  try {
    const { default: mariadb } = await import("mariadb");
    const conn = await mariadb.createConnection({ ...cfg, connectTimeout: 15_000 });
    const rows = await conn.query("SELECT DATABASE() d, VERSION() v, COUNT(*) n FROM users");
    await conn.end();
    // ⚠️ MySQL 의 COUNT(*) 는 BigInt 로 온다. 그대로 넣으면 `JSON.stringify` 가
    //   *"Do not know how to serialize a BigInt"* 로 터져 **500 + 빈 본문**이 된다.
    //   붙기는 붙었는데 화면에는 아무 단서도 안 남는 모양이라, 진단이 진단을 못 하게 된다.
    const row = Object.fromEntries(
      Object.entries(rows[0] as Record<string, unknown>)
        .map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v]),
    );
    out.mysql = { ok: true, ...row, took: ms(t) };
  } catch (e) { out.mysql = { ok: false, error: err(e), took: ms(t) }; }

  // ⑤ 풀 — 앱이 실제로 쓰는 길
  t = Date.now();
  try {
    const { default: mariadb } = await import("mariadb");
    const pool = mariadb.createPool(cfg);
    const c = await pool.getConnection();
    await c.query("SELECT 1");
    await c.release();
    await pool.end();
    out.pool = { ok: true, took: ms(t) };
  } catch (e) { out.pool = { ok: false, error: err(e), took: ms(t) }; }

  out.읽는법 = {
    tls: "실패가 정상입니다 — MySQL 포트는 평문으로 시작해 핸드셰이크 중 TLS 로 올라갑니다. 진짜 TLS 판정은 mysql 층입니다.",
    tcp: "여기서 막히면 그 포트로 나가는 길이 없는 것입니다(플랫폼 방화벽).",
    mysql: "여기 오류가 진짜 원인입니다. 계정·비밀번호·DB 이름·사용자명 접두사.",
    pool: "mysql 은 되는데 여기만 실패하면 풀 설정(동시 개수·대기 시간) 문제입니다.",
  };
  return Response.json(out);
}
