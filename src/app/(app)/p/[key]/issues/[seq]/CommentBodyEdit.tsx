"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { markMentions } from "@/lib/MentionText";

import { ProjectField } from "@/components/ProjectField";

import { deleteComment, editComment, type CommentState } from "./actions";
import { useMentions } from "./CommentForm";

/**
 * 코멘트 본문 — **읽기와 편집이 같은 자리**에서 일어난다 (`D-100` 개정 · 2026-09-11).
 *
 * ⚠️ 어제는 `<details>` 로 **본문 아래에 폼을 하나 더** 열었다. 제보가 바로 왔다 —
 *   *"수정 버튼 눌렀을때 해당 화면에서 바로 편집하게. 밑에 내용 나오는거 너무 구려."*
 *   같은 글이 두 번 보이니 어느 쪽을 고치는 건지도 헷갈렸다.
 *
 * ★ 그래서 **본문부터 액션 줄까지**를 이 조각으로 옮겼다. 편집은 상태가 필요한데
 *   서버 컴포넌트는 상태를 못 가진다.
 * ★ 답글 폼(`reply`)과 첨부(`attachments`)는 **서버가 그려서 넘긴다** — 여기서
 *   다시 만들면 두 벌이 된다.
 *
 * ⚠️ **JS 가 꺼져 있으면 편집 토글이 안 열린다.** 이 프로젝트는 `<details>` 를
 *   고집해 왔지만(답글·첨부), 여기서는 *"밑에 나오는 게 구리다"* 가 제보였다.
 *   두 판을 다 두면 같은 폼이 둘이 된다 — 인라인 하나로 간다 (`docs/09`).
 */
export function CommentBodyEdit({
  seq, commentId, body, people, canEdit, replyCount, attachmentCount,
  attachments, reply,
}: {
  seq: number;
  commentId: number;
  body: string;
  people: string[];
  /** 자기가 쓴 코멘트인가 — 수정·삭제는 작성자만 (`D-100-1` · `D-102-1`) */
  canEdit: boolean;
  /** 답글 수. ★ **0보다 크면 삭제 버튼이 아예 안 나온다** (2026-09-16) */
  replyCount: number;
  attachmentCount: number;
  attachments?: React.ReactNode;
  reply?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      {editing ? (
        <EditInline
          seq={seq} commentId={commentId} body={body} people={people}
          done={() => setEditing(false)}
        />
      ) : (
        body && <div className="cmt-body">{markMentions(body, people)}</div>
      )}

      {attachments}

      {/* ★ `flex-wrap` 이 걸려 있어 자리가 모자라면 **줄이 바뀐다** — 예전엔
          열린 폼이 100% 를 요구해 옆 버튼이 0px 로 찌그러졌고, 그래서 `답글` 이
          한 글자씩 세로로 접혔다 (`D-101`). */}
      {(reply || canEdit) && (
        <div className="cmt-actions">
          {reply}
          {canEdit && !editing && (
            <button type="button" className="reply-btn" onClick={() => setEditing(true)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
              수정
            </button>
          )}
          {/* ★★ **답글이 달린 코멘트는 못 지운다** (2026-09-16 제보).
              예전엔 지워지면서 답글이 Cascade 로 같이 사라졌다 —
              **남이 쓴 글을 내가 지우는** 셈이었다. 경고를 띄우는 것보다
              아예 막는 게 맞다.
              ⚠️ 서버도 따로 막는다 (`deleteComment`) — 화면만 감추면
                액션 직접 호출로 뚫린다 (`C-09`). */}
          {canEdit && !editing && (
            replyCount > 0 ? (
              <span className="cmt-nodel" title="답글을 먼저 지워야 이 코멘트를 지울 수 있습니다">
                답글 {replyCount}개가 달려 지울 수 없습니다
              </span>
            ) : (
              <DeleteConfirm
                seq={seq} commentId={commentId}
                attachmentCount={attachmentCount}
              />
            )
          )}
        </div>
      )}
    </>
  );
}

/** 본문 자리에 그대로 열리는 편집 폼. */
function EditInline({ seq, commentId, body, people, done }: {
  seq: number; commentId: number; body: string; people: string[]; done: () => void;
}) {
  const [state, action, pending] = useActionState<CommentState, FormData>(editComment, {});
  const ref = useRef<HTMLFormElement>(null);
  // ★ Esc 를 훅에 **맡긴다** (`N-70`). 예전엔 여기서 직접 받아서, 멘션 목록이 떠 있어도
  //   Esc 한 번에 수정 폼까지 닫혀 **쓰던 글이 날아갔다.**
  //   ⚠️ `stopPropagation` 으로는 못 고친다 — 두 핸들러가 **같은 엘리먼트**에 달려 있었다.
  const mention = useMentions(people, { form: ref, onEscape: done });

  // 저장이 끝나면 읽기로 돌아간다. `state.ok` 는 저장할 때마다 새 값이 온다.
  // ⚠️ 렌더 중에 ref 를 보면 안 된다 (React 규칙) — 효과에서 본다.
  useEffect(() => { if (state.ok) done(); }, [state.ok]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form ref={ref} action={action} className="cmt-form cmt-inline">
      <ProjectField />
      <input type="hidden" name="seq" value={seq} />
      <input type="hidden" name="commentId" value={commentId} />
      <div className="cmt-input">
        <textarea
          name="body"
          rows={3}
          defaultValue={body}
          required
          autoFocus
          {...mention.bind}
          suppressHydrationWarning
        />
        {mention.mirror}
        {mention.list}
      </div>
      {mention.summary}
      {state.error && <p className="login-error">{state.error}</p>}
      <div className="cmt-form-foot">
        <span className="cmt-hint">Enter 저장 · Esc 취소 · @ 뒤 ↑↓ 선택, Enter 멘션</span>
        <button type="button" className="btn-ghost" onClick={done}>취소</button>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}

/**
 * 삭제 — **무엇이 함께 사라지는지 먼저 말한다** (`D-102-2`).
 *
 * ★ `confirm()` 을 쓰지 않는다. 이 코드베이스에 한 곳도 없고, 팝업은 **문구를
 *   우리가 못 정한다** — 답글 건수와 작성자 이름을 적을 수가 없다.
 *   `<details>` 라 **JS 가 없어도** 펼쳐지고, 두 번 눌러야 지워진다.
 */
/**
 * 두 번 눌러야 지워진다. `confirm()` 을 안 쓰는 이유는 `<details>` 라
 * **자바스크립트가 없어도 열리기** 때문이다.
 *
 * ★ **답글이 없는 코멘트에만 나온다** (2026-09-16). 그래서 예전에 있던
 *   *"답글 N건도 함께 사라집니다"* 경고가 **없어졌다** — 그런 경우가 더는 없다.
 */
function DeleteConfirm({ seq, commentId, attachmentCount }: {
  seq: number; commentId: number; attachmentCount: number;
}) {
  return (
    <details className="reply-wrap del-wrap">
      <summary className="reply-btn del">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
        </svg>
        삭제
      </summary>

      <div className="imp-danger del-box">
        <p>
          <b>이 코멘트를 지웁니다. 되돌릴 수 없습니다.</b>
          {attachmentCount > 0 && (
            <>
              <br />
              첨부 <b>{attachmentCount}개</b>도 같이 지워집니다
            </>
          )}
        </p>
        <form action={deleteComment} className="del-btns">
          <ProjectField />
          <input type="hidden" name="seq" value={seq} />
          <input type="hidden" name="commentId" value={commentId} />
          <button type="submit" className="btn-ghost danger">지웁니다</button>
        </form>
      </div>
    </details>
  );
}

