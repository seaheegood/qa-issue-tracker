/**
 * **`@이름` 을 찾는 한 곳** (2026-09-11).
 *
 * ── 왜 이 파일이 생겼나 ─────────────────────────────────────
 * 같은 판단을 **세 곳이 각자 다르게** 하고 있었다:
 *
 * | 어디 | 규칙 |
 * |---|---|
 * | 서버 알림 (`notify.ts`) | `body.includes("@" + 이름)` — 경계 없음 |
 * | 본문 강조 (`CommentList`) | 인덱스를 전진시키며 훑음 — 경계 없음 |
 * | 입력 팝업 (`CommentForm`) | `@` 앞이 줄 처음·공백·`(` 일 때만 (N-55, 메일 주소 방지) |
 *
 * 그래서 `foo@사용자A` 은 **알림은 가는데 팝업은 안 뜨고 강조는 됐다.**
 * 세 곳이 다르면 *"왜 나한테 알림이 왔지"* 를 화면으로 설명할 수 없다.
 *
 * ★ **경계 규칙은 팝업 쪽을 채택했다.** 셋 중 그것만 이유가 있다 —
 *   메일 주소(`qa@example.com`)를 멘션으로 읽지 않기 위해서다(`N-55`).
 *
 * ★ **`prisma` 를 쓰지 않는다.** 강조는 클라이언트 컴포넌트에서 돈다 —
 *   `notify.ts`(prisma 를 쓴다)에 두면 클라이언트가 못 가져간다.
 */

/** 본문에서 찾은 `@이름` 하나. `start` 는 `@` 의 자리다. */
export type MentionHit = { name: string; start: number; end: number };

/**
 * `@` 앞에 올 수 있는 글자 — 줄 처음 · 공백 · `(`.
 * `CommentForm.tsx` 의 `/(^|[\s(])@…/` 와 **같은 규칙이어야 한다.**
 */
const canStart = (prev: string | undefined) =>
  prev === undefined || prev === "(" || /\s/.test(prev);

/**
 * 본문을 훑어 `@이름` 을 **겹치지 않게** 찾는다.
 *
 * ★ **긴 이름부터 맞춘다.** `사용자` 를 먼저 맞추면 `@사용자A` 가 `@사용자` + `A` 로 잘린다.
 * ⚠️ 그리고 **찾은 만큼 건너뛴다.** 예전 서버 코드는 사람마다 따로 `includes` 만 해서
 *   정렬이 **아무 일도 하지 않았다** — `사용자` 와 `사용자A` 가 함께 있으면
 *   `@사용자A` 한 번에 **두 사람 모두** 알림을 받았다. 지금 접두 관계 이름이
 *   없어서 안 드러났을 뿐이다.
 */
export function scanMentions(body: string, names: string[]): MentionHit[] {
  const sorted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return [];

  const hits: MentionHit[] = [];
  let i = 0;
  while (i < body.length) {
    if (body[i] === "@" && canStart(body[i - 1])) {
      const name = sorted.find((n) => body.startsWith(n, i + 1));
      if (name) {
        hits.push({ name, start: i, end: i + name.length + 1 });
        i += name.length + 1;
        continue;
      }
    }
    i += 1;
  }
  return hits;
}
