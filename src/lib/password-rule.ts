/**
 * 비밀번호 규칙 — **한 곳**에서만 정한다.
 *
 * 쓰는 곳: `npm run user` (scripts/user.ts) · 내 계정 화면의 비밀번호 변경.
 * ★ 둘이 따로 숫자를 들고 있으면 언젠가 갈라진다 — 관리자가 발급한 비밀번호를
 *   본인이 같은 값으로 못 바꾸는 일이 생긴다.
 * ⚠️ `server-only` 를 붙이지 않는다. CLI(tsx)가 그대로 import 해야 한다.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** 규칙에 어긋나면 사람이 읽을 이유를, 맞으면 null. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`;
  return null;
}
