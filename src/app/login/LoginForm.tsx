"use client";

import { useActionState } from "react";

import { login, type LoginState } from "./actions";

export function LoginForm({ next, demo }: { next?: string; demo?: boolean }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="login-form">
      <input type="hidden" name="next" value={next ?? ""} />

      {/*
        suppressHydrationWarning:
        비밀번호 관리자·번역기 같은 브라우저 확장이 입력란에 속성을 몰래 끼워 넣는다.
        그러면 서버가 그린 HTML과 브라우저의 DOM이 달라져서 React 가 hydration 오류를 내고,
        개발 모드에서는 빨간 오류 화면이 떠서 폼을 못 쓰게 된다.
        입력란은 원래 사용자가 값을 바꾸는 요소이므로 이 경고를 꺼도 안전하다.
      */}
      <label className="field">
        <span>아이디</span>
        <input
          name="loginId"
          autoComplete="username"
          autoFocus
          required
          /* 데모에서는 미리 채워 둔다 — 처음 온 사람이 계정을 옮겨 적지 않게 */
          defaultValue={demo ? "demo" : undefined}
          placeholder="아이디"
          suppressHydrationWarning
        />
      </label>

      <label className="field">
        <span>비밀번호</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          defaultValue={demo ? "demo1234" : undefined}
          suppressHydrationWarning
        />
      </label>

      {state.error && (
        <p className="login-error" role="alert">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending}>
        {pending ? "확인 중…" : "로그인"}
      </button>
    </form>
  );
}
