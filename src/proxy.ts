import { NextResponse, type NextRequest } from "next/server";

/**
 * 로그인 안 한 요청을 로그인 화면으로 돌린다.
 *
 * ⚠️ Next.js 16 부터 `middleware.ts` 는 **`proxy.ts` 로 이름이 바뀌었다.**
 *    함수 이름도 middleware → proxy. 예전 이름도 동작하지만 경고가 뜬다.
 *
 * ⚠️ 여기서는 **쿠키가 있는지만** 본다. 세션이 진짜 유효한지는 검사하지 않는다.
 *    이 파일은 Edge 런타임에서 도는데 Prisma(=DB 연결)를 쓸 수 없기 때문이다.
 *
 * 진짜 검증은 (app)/layout.tsx 의 requireUser() 가 DB를 보고 한다.
 * 즉 여기는 "빠른 1차 거름망"이고, 실제 자물쇠는 레이아웃에 있다.
 * 쿠키만 위조해서는 아무것도 못 본다.
 */
/**
 * 로그인 없이 지나가는 경로.
 *
 * ★ `/api/diag` 는 **자기 자신이 문을 지킨다** — `IT_DIAG_KEY` 가 없으면 404,
 *   열쇠가 틀려도 404 다. 여기서 막으면 «DB 에 왜 못 붙는지» 를 보려는 진단이
 *   **DB 를 보는 로그인에 막히는** 앞뒤가 뒤바뀐 상태가 된다 (2026-09-20 에 실제로 겪었다).
 */
const PUBLIC_PATHS = ["/login", "/api/diag"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!req.cookies.get("it_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // 정적 파일과 내부 경로는 건너뛴다
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
