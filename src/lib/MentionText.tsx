import { scanMentions } from "@/lib/mention";

/**
 * **본문에서 불린 이름만 강조한다** (`N-56`).
 *
 * ★ 아무 `@` 나 칠하면 안 된다 — 메일 주소가 통째로 파래진다.
 *   **실제 사용자 이름과 맞는 것만** 칠하고 나머지는 평범한 글자로 둔다.
 *
 * ★ **찾는 일은 `lib/mention` 의 `scanMentions()` 가 한다** (`N-58-1`).
 *   서버 알림(`findMentions`)·입력 팝업·이 강조가 **같은 함수**를 쓴다 —
 *   예전엔 세 곳이 각자 판단해서 `foo@사용자A` 이 *알림은 가는데 팝업은 안 뜨는* 상태였다.
 *
 * ── 왜 `lib/` 로 나왔나 (2026-09-16) ────────────────────────
 * 원래 `CommentList`(서버)에 있던 것을 `CommentBodyEdit` 으로 옮겼었다.
 * 그런데 **입력 중 강조**(거울)를 `CommentForm` 의 훅이 쓰려면 거꾸로 가져와야 하는데,
 * `CommentBodyEdit` → `CommentForm` 의존이 이미 있어서 **순환 참조**가 된다.
 * 그래서 양쪽이 함께 보는 자리로 내렸다.
 *
 * ⚠️ `lib/mention.ts` 에 합치지 않는다 — 그쪽은 **서버(`notify.ts`)도 쓰는** 파일이라
 *   JSX 를 섞으면 안 된다. 찾는 규칙은 거기, 그리는 일은 여기.
 */
export function markMentions(body: string, people: string[]) {
  const hits = scanMentions(body, people);
  if (hits.length === 0) return body;

  const out: React.ReactNode[] = [];
  let at = 0;
  for (const h of hits) {
    if (h.start > at) out.push(body.slice(at, h.start));
    out.push(<mark key={h.start} className="mention">@{h.name}</mark>);
    at = h.end;
  }
  if (at < body.length) out.push(body.slice(at));
  return out;
}
