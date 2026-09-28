/**
 * 이슈 **수정 폼이 열려 있는가.**
 *
 * ★ 왜 함수 하나로 두는가 — **⌘V 의 주인을 정하는 판정**이기 때문이다.
 *
 *   이 화면에는 붙여넣기를 받을 수 있는 곳이 둘이다.
 *     · 이슈 첨부 (`Attachments` — window 리스너)
 *     · 코멘트 첨부 (`CommentForm` 의 `FilePicker primary`)
 *
 *   둘이 **서로 다른 기준**으로 판단하면 창이 생긴다 —
 *   같은 순간에 **둘 다 받거나(파일이 두 벌 올라간다)**, **아무도 안 받는다**
 *   (스크린샷을 붙였는데 아무 일도 안 일어난다). 그래서 한 곳에서만 정한다.
 *
 * ⚠️ DOM 을 직접 본다. 수정 폼이 `<details className="edit-wrap">` 라
 *   열림 상태가 **React 상태가 아니라 DOM 속성**에 있고, 두 컴포넌트가
 *   서로 다른 트리에 있어 prop 으로 내려줄 길이 없다.
 *   (`IssueEditor.tsx` 의 `.edit-wrap` · `globals.css` 의 `.dedit:has(.edit-wrap[open])`
 *    가 같은 값을 본다 — 셋이 어긋나면 화면과 동작이 따로 논다)
 */
export function isIssueEditOpen(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector(".edit-wrap[open]") !== null;
}
