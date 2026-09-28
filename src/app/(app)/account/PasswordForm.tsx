"use client";

import { useActionState } from "react";

import { MIN_PASSWORD_LENGTH } from "@/lib/password-rule";

import { changePassword, type PasswordState } from "./actions";

/**
 * 비밀번호 변경 폼.
 *
 * `autoComplete` 를 칸마다 정확히 준다 — 브라우저 비밀번호 관리자가
 * `current-password` 칸엔 저장된 값을 채우고, `new-password` 칸엔 새 값을 제안·저장한다.
 * 틀리게 주면 **새 칸에 옛 비밀번호가 자동으로 채워지는** 흔한 사고가 난다.
 */
export function PasswordForm({ disabled }: { disabled?: boolean }) {
  const [state, formAction, pending] = useActionState<PasswordState, FormData>(changePassword, {});

  return (
    <form action={formAction} className="login-form account-form">
      <label className="field">
        <span>현재 비밀번호</span>
        <input name="current" type="password" autoComplete="current-password" required
               disabled={disabled} suppressHydrationWarning />
      </label>
      <label className="field">
        <span>새 비밀번호 <small className="dim">({MIN_PASSWORD_LENGTH}자 이상)</small></span>
        <input name="next" type="password" autoComplete="new-password" required
               minLength={MIN_PASSWORD_LENGTH} disabled={disabled} suppressHydrationWarning />
      </label>
      <label className="field">
        <span>새 비밀번호 확인</span>
        <input name="confirm" type="password" autoComplete="new-password" required
               minLength={MIN_PASSWORD_LENGTH} disabled={disabled} suppressHydrationWarning />
      </label>

      {state.error && <p className="login-error" role="alert">{state.error}</p>}

      <button type="submit" disabled={pending || disabled}>
        {pending ? "바꾸는 중…" : "비밀번호 바꾸기"}
      </button>
    </form>
  );
}
