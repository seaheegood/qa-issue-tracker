"use client";

import { setUserRole, setUserTeam } from "../actions";

type Team = { id: number; name: string; color: string; isActive: boolean };

/**
 * 셀렉트를 바꾸면 바로 저장한다. '저장' 버튼을 따로 누르게 하지 않는다.
 * 13명을 배정하는데 매번 두 번 클릭하면 그것만으로 지친다 (P-3).
 */
export function TeamSelect({
  userId,
  teamId,
  teams,
}: {
  userId: number;
  teamId: number | null;
  teams: Team[];
}) {
  return (
    <form action={setUserTeam}>
      <input type="hidden" name="userId" value={userId} />
      <select
        name="teamId"
        defaultValue={teamId ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        suppressHydrationWarning
      >
        <option value="">— 미배정 —</option>
        {teams
          .filter((t) => t.isActive || t.id === teamId)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.isActive ? "" : " (비활성)"}
            </option>
          ))}
      </select>
    </form>
  );
}

export function RoleSelect({
  userId,
  systemRole,
  isMe,
}: {
  userId: number;
  systemRole: string;
  isMe: boolean;
}) {
  if (isMe) {
    // 마지막 관리자가 스스로를 강등하면 아무도 이 화면에 못 들어온다
    return <span className="self-role">관리자 (본인)</span>;
  }
  return (
    <form action={setUserRole}>
      <input type="hidden" name="userId" value={userId} />
      <select
        name="systemRole"
        defaultValue={systemRole}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        suppressHydrationWarning
      >
        <option value="MEMBER">일반</option>
        <option value="ADMIN">관리자</option>
      </select>
    </form>
  );
}
