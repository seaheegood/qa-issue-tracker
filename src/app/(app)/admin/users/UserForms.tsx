"use client";

import { useActionState, useState } from "react";

import { createUser, resetUserPassword, toggleUserActive, type UserState } from "../actions";

type Team = { id: number; name: string; isActive: boolean };

/**
 * 임시 비밀번호를 **한 번만** 보여 준다.
 *
 * ★ DB 에는 해시만 있어서 **다시 볼 방법이 없다.** 그래서 복사 버튼을 붙이고,
 *   놓쳤으면 초기화를 한 번 더 하라고 말한다. 다시 보여 주려면 평문을 저장해야 하는데
 *   그건 비밀번호를 해시로 두는 이유를 통째로 버리는 일이다.
 */
function TempPassword({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="temp-pw" role="status">
      <span>임시 비밀번호</span>
      <code>{value}</code>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => navigator.clipboard?.writeText(value).then(() => setCopied(true))}
      >
        {copied ? "복사됨" : "복사"}
      </button>
      <small>지금만 보입니다. 본인에게 전하고, 첫 로그인 뒤 <b>내 계정</b>에서 바꾸라고 알려 주세요.</small>
    </div>
  );
}

export function CreateUserForm({ teams }: { teams: Team[] }) {
  const [state, action, pending] = useActionState<UserState, FormData>(createUser, {});
  return (
    <form action={action} className="team-new">
      <div className="row-fields">
        <label className="field">
          <span>이름</span>
          <input name="name" required maxLength={50} placeholder="이름" suppressHydrationWarning />
        </label>
        <label className="field">
          <span>아이디</span>
          <input name="loginId" required maxLength={30} placeholder="영문 소문자·숫자·점"
                 autoCapitalize="none" spellCheck={false} suppressHydrationWarning />
        </label>
        <label className="field">
          <span>팀</span>
          <select name="teamId" defaultValue="" suppressHydrationWarning>
            <option value="">— 미배정 —</option>
            {teams.filter((t) => t.isActive).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>권한</span>
          <select name="systemRole" defaultValue="MEMBER" suppressHydrationWarning>
            <option value="MEMBER">일반</option>
            <option value="ADMIN">관리자</option>
          </select>
        </label>
      </div>
      {state.error && <p className="login-error">{state.error}</p>}
      {state.ok && <p className="ok-msg">{state.ok}</p>}
      {state.temp && <TempPassword value={state.temp} />}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "추가 중…" : "사용자 추가"}
      </button>
    </form>
  );
}

/** 한 줄의 `비밀번호 초기화` — 비밀번호가 없는 계정이면 `비밀번호 발급` 으로 읽힌다. */
export function ResetPasswordForm({ userId, name, hasPassword }: {
  userId: number; name: string; hasPassword: boolean;
}) {
  const [state, action, pending] = useActionState<UserState, FormData>(resetUserPassword, {});
  const label = hasPassword ? "비밀번호 초기화" : "비밀번호 발급";
  return (
    <form
      action={action}
      className="user-reset"
      onSubmit={(e) => {
        // 초기화는 그 사람의 로그인을 전부 끊는다 — 잘못 누르면 일하던 사람이 튕긴다
        if (hasPassword && !confirm(`${name} 님의 비밀번호를 초기화할까요?\n지금 로그인된 곳은 모두 로그아웃됩니다.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" className="btn-ghost" disabled={pending}>{pending ? "…" : label}</button>
      {state.error && <span className="login-error">{state.error}</span>}
      {state.temp && <TempPassword value={state.temp} />}
    </form>
  );
}

export function ActiveToggleForm({ userId, name, isActive, isMe }: {
  userId: number; name: string; isActive: boolean; isMe: boolean;
}) {
  if (isMe) return null; // 자기 자신은 못 끈다 (A-111)
  return (
    <form
      action={toggleUserActive}
      onSubmit={(e) => {
        if (isActive && !confirm(`${name} 님을 비활성으로 돌릴까요?\n로그인할 수 없게 되고, 담당자·멘션 후보에서 빠집니다.\n쓴 이슈와 코멘트는 그대로 남습니다.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" className="btn-ghost">{isActive ? "비활성" : "다시 활성"}</button>
    </form>
  );
}
