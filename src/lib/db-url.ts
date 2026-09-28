/**
 * 접속 주소 한 줄을 **드라이버가 받을 모양**으로 바꾼다.
 *
 * ★★ **여기가 유일한 곳이다.** 앱(`src/lib/prisma.ts`)과 데모 시드(`prisma/seed-demo.ts`)가
 *   같은 함수를 쓴다. 예전엔 시드가 접속 주소를 **그대로** 드라이버에 넘겼는데,
 *   관리형 MySQL(TiDB 등)은 **TLS 없이는 접속 자체를 거부**해서
 *   *"앱은 붙는데 시드만 안 붙는다"* 가 됐다 — 배포 첫걸음에서 막히는 자리다.
 *   `buildWhere()` · `people.ts` 와 같은 이유로 한곳에 둔다.
 *
 * | 환경변수 | 언제 | 왜 |
 * |---|---|---|
 * | `IT_DB_SSL=1` | TiDB·Aiven 등 관리형 MySQL | TLS 없이는 거부당한다 |
 * | `IT_DB_POOL=n` | 서버리스(Vercel) | 인스턴스마다 풀을 만든다. 안 줄이면 DB 접속 상한에 먼저 닿는다 |
 *
 * ⚠️ **둘 다 없으면 주소 문자열을 그대로 쓴다.** 사내 운영(도커 MySQL)은 예전과 한 글자도 다르지 않다.
 */

export type PoolConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: { rejectUnauthorized: boolean };
  connectionLimit?: number;
  connectTimeout?: number;
  acquireTimeout?: number;
  initializationTimeout?: number;
};

/**
 * ★★ **기다려 주는 시간. 이것 때문에 첫 배포가 막혔다** (2026-09-20).
 *
 *   mariadb 드라이버의 **소켓 연결 기본 상한이 1초**다. 사내 도커 MySQL 은 같은 기계라
 *   1초가 남아돌지만, **도쿄의 관리형 DB 는 TLS 까지 1.4초**가 걸린다.
 *   그래서 풀이 커넥션을 **하나도** 못 만들고, 화면에 뜨는 말은
 *   *"pool timeout … active=0 idle=0"* 이라 **느려서가 아니라 붙지도 못했다**는 게 안 보인다.
 *
 *   ⚠️ 더 나쁜 건 **단일 연결로는 잘 붙는다**는 점이다. `createConnection` 은 되고
 *   `createPool` 만 안 되니, 접속 정보·TLS·방화벽을 아무리 봐도 멀쩡해 보인다.
 *   (실제로 TLS 설정 다섯 가지를 다 재보고 나서야 여기에 닿았다)
 *
 *   15초로 둔 이유: TiDB 는 **유휴 시 잠든다.** 잠든 걸 깨우는 첫 요청은 몇 초 걸린다.
 *   3초면 평소엔 되지만 **아무도 안 들어온 다음 날 아침에 깨진다.**
 */
const MANAGED_TIMEOUTS = {
  connectTimeout: 15_000,
  acquireTimeout: 20_000,
  initializationTimeout: 20_000,
} as const;

/**
 * ★★ **사람이 붙여넣은 값을 씻어낸다** (2026-09-20 신설).
 *
 *   배포 화면에 환경변수를 손으로 넣다 보면 값이 조금씩 변형된다. 실제로 겪은 둘:
 *   ① `.env` 파일에서 복사하며 **앞뒤 큰따옴표까지** 가져온다
 *   ② `db` 가 **`DB`** 로 바뀐다 (입력기의 자동 대문자)
 *
 *   ⚠️ ①이 특히 고약하다. 따옴표가 붙으면 `mysql://` 로 시작하지 않게 되어
 *   주소를 쪼개는 규칙이 **엉뚱한 곳**을 자른다 — 사용자명이 `"mysql` 이 되고,
 *   호스트·포트·DB 이름은 **멀쩡하게 나온다.** 그래서 겉보기엔 접속 정보가 맞아 보이고,
 *   서버는 *"Missing user name prefix"* 라는 **사용자명 이야기**를 하는데
 *   정작 우리가 보는 화면에는 *"pool timeout"* 만 뜬다.
 *
 *   값을 다시 넣어 달라고 하는 대신 **여기서 씻는다.** 같은 실수는 다음 배포에서 또 난다.
 */
export function cleanEnv(v: string | undefined | null) {
  if (!v) return "";
  let s = v.trim();

  /**
   * ★★ **`.env` 파일의 «줄 전체» 를 붙여넣은 경우** (2026-09-20 에 실제로 겪었다).
   *
   *   `DATABASE_URL="mysql://…"` 를 통째로 넣으면, 값이 `mysql://` 로 시작하지 않아
   *   주소를 쪼개는 규칙이 **사용자명 자리에서** 엉뚱하게 잘린다 —
   *   사용자명이 `DATABASE_URL="mysql` 이 되는데 **호스트·포트·DB 이름은 멀쩡히 나온다.**
   *
   *   그래서 서버는 *"Missing user name prefix"* 라고 **정확히** 말해 주는데,
   *   그 말이 커넥션 풀 안에서 삼켜져 화면에는 *"pool timeout"* 만 남는다.
   *   접속 정보를 아무리 들여다봐도 멀쩡해 보인다.
   *
   *   ⚠️ **조용히 고치지 않는다.** 벗겨 내되 **경고를 남긴다** — 저장된 값은 여전히
   *   틀린 것이고, 누군가는 그걸 고쳐야 한다.
   */
  const named = /^([A-Z_][A-Z0-9_]*)[ \t]*=[ \t]*([\s\S]*)$/.exec(s);
  if (named && /^["']?[a-z][a-z0-9+.-]*:\/\//i.test(named[2].trim())) {
    console.warn(
      `[IssueTracker] 환경변수 값에 «${named[1]}=» 가 같이 들어 있습니다. ` +
      `벗겨내고 씁니다만, 배포 설정의 값을 «= 뒤의 주소만» 으로 고치세요.`,
    );
    s = named[2].trim();
  }

  // 짝이 맞는 따옴표만 벗긴다. 비밀번호에 든 따옴표 한 짝을 지우면 안 된다.
  while (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/**
 * 앱 설정값 `IT_<이름>` 을 읽는다. 없으면 **옛 이름 `PT_<이름>`** 을 본다.
 *
 * ★ 2026-09-28 — 접두어가 `PT_`(예전 이름 ProjectTracker) 였다. 9/16 에 앱 이름을 IssueTracker 로
 *   바꾸고도 남아 있던 것을 `IT_` 로 정리했다. 옛 이름을 같이 읽는 이유는 **이미 값을 넣어 둔 곳**
 *   (Vercel 데모 · 누군가의 `.env`)이 새 이름으로 옮기기 전까지 **조용히 사내 모드로 바뀌지 않게** 하려는 것.
 *   새로 적는 곳은 `IT_` 만 쓴다. 옛 이름이 다 사라지면 이 대비는 지운다.
 */
export function appEnv(name: string): string | undefined {
  return process.env[`IT_${name}`] ?? process.env[`PT_${name}`];
}

/** 켜짐/꺼짐 값. `1`·`true`·`yes`·`on` 을 켜짐으로 보고, 대소문자를 가리지 않는다. */
export function envOn(v: string | undefined | null) {
  return ["1", "true", "yes", "on"].includes(cleanEnv(v).toLowerCase());
}

/** 갈라야 하는 상황인가. 아니면 주소 문자열을 그대로 쓰는 게 맞다. */
export function isManagedDb() {
  return envOn(appEnv("DB_SSL")) || !!cleanEnv(appEnv("DB_POOL"));
}

/**
 * `mysql://user:pw@host:3306/db?sslaccept=strict` 를 쪼갠다.
 *
 * ★ `new URL()` 을 쓰지 않는 이유: 비밀번호에 들어갈 수 있는 문자들이 규격에 안 맞아
 *   환경에 따라 파싱이 달라진다. **마지막 `@`** 를 기준으로 직접 자르는 편이 예측 가능하다.
 *   (TiDB 가 주는 비밀번호에는 `-` 나 `_` 가 섞여 나온다)
 *
 * ★ 물음표 뒤(`?sslaccept=strict`)는 **버린다.** 그건 Prisma CLI 가 읽는 것이고,
 *   여기서 만드는 건 드라이버가 받을 설정 객체다. DB 이름에 붙어 들어가면 접속이 깨진다.
 */
export function poolConfig(rawUrl: string): PoolConfig {
  const url = cleanEnv(rawUrl);
  const body = url.replace(/^[a-z]+:\/\//i, "");
  const at = body.lastIndexOf("@");
  const auth = at >= 0 ? body.slice(0, at) : "";
  const rest = at >= 0 ? body.slice(at + 1) : body;
  const colon = auth.indexOf(":");
  const slash = rest.indexOf("/");
  const hostPort = slash >= 0 ? rest.slice(0, slash) : rest;
  const dbAndQuery = slash >= 0 ? rest.slice(slash + 1) : "";
  const [host, port] = hostPort.split(":");

  return {
    host,
    port: port ? Number(port) : 3306,
    user: decodeURIComponent(colon >= 0 ? auth.slice(0, colon) : auth),
    password: decodeURIComponent(colon >= 0 ? auth.slice(colon + 1) : ""),
    database: decodeURIComponent(dbAndQuery.split("?")[0]),
    ...MANAGED_TIMEOUTS,
    ...(envOn(appEnv("DB_SSL")) ? { ssl: { rejectUnauthorized: true } } : {}),
    ...(cleanEnv(appEnv("DB_POOL"))
      ? { connectionLimit: Number(cleanEnv(appEnv("DB_POOL"))) }
      : {}),
  };
}

/** 드라이버에 넘길 것 — 갈라야 하면 설정 객체를, 아니면 주소 문자열 그대로. */
export function adapterInput(url: string): string | PoolConfig {
  return isManagedDb() ? poolConfig(url) : cleanEnv(url);
}
