/**
 * 의견에 붙는 «보던 화면» 주소를 **우리 사이트 안의 경로로만** 받는다.
 *
 * ★ 이 값은 관리자 화면에서 **링크로** 그려진다. `javascript:…` 나 `//다른사이트` 가 들어오면
 *   관리자가 누르는 순간 남의 코드가 돈다. 로그인의 `next` 와 같은 규칙이다 (`C-02`).
 */
export function safeInternalPath(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().slice(0, 500) : "";
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\")) return null;
  return s;
}
