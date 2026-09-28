"use client";

import { useActionState } from "react";

import { sendFeedback, type FeedbackState } from "./actions";

export function FeedbackForm({ page, from }: { page: string | null; from: string | null }) {
  const [state, action, pending] = useActionState<FeedbackState, FormData>(sendFeedback, {});
  return (
    <form action={action} className="login-form feedback-form">
      <input type="hidden" name="page" value={page ?? ""} />
      <input type="hidden" name="from" value={from ?? ""} />
      <label className="field">
        <span>무엇이 불편했나요? 무엇이 있었으면 하나요?</span>
        <textarea
          name="body" required rows={7} maxLength={5000} autoFocus
          placeholder={"예) 이슈 목록에서 담당자로 거를 때 매번 이름을 찾아야 해서 느려요.\n엑셀에서는 필터 한 번이면 됐어요."}
          suppressHydrationWarning
        />
      </label>
      {state.error && <p className="login-error" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>{pending ? "보내는 중…" : "보내기"}</button>
    </form>
  );
}
