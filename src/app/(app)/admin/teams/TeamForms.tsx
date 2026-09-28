"use client";

import { useActionState, useState } from "react";

import { TEAM_PALETTE, TEAM_ROLE_LABEL, TEAM_ROLES } from "@/lib/ui";

import { createTeam, toggleTeamActive, updateTeam, type AdminState } from "../actions";

/** 색 선택 — 팔레트에서 고르거나 직접 입력. */
function ColorPicker({ name, value }: { name: string; value: string }) {
  const [color, setColor] = useState(value);
  return (
    <div className="colorpick">
      <input type="hidden" name={name} value={color} />
      <span className="swatch-preview" style={{ background: color }} />
      <div className="swatches">
        {TEAM_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch${c.toLowerCase() === color.toLowerCase() ? " on" : ""}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={c}
            title={c}
          />
        ))}
      </div>
      <input
        className="hex"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        spellCheck={false}
        aria-label="색상 코드"
      />
    </div>
  );
}

/**
 * 팀의 **직군**. 이 칸이 코멘트 유형과 답변 주체를 정한다 (2026-09-11).
 *
 * ★ *"안 정함"* 을 남겨 둔다. 운영팀처럼 셋 중 어디도 아닌 팀이 실제로 있고,
 *   억지로 하나를 고르게 하면 **없는 사실을 적게** 된다. 안 정하면 코멘트는
 *   `QA` 로 적히고 이력의 역할 칸은 빈다.
 */
function RolePicker({ value }: { value: string | null }) {
  return (
    <label className="field">
      <span>직군</span>
      <select name="role" defaultValue={value ?? ""} suppressHydrationWarning>
        <option value="">— 안 정함</option>
        {TEAM_ROLES.map((r) => (
          <option key={r} value={r}>{TEAM_ROLE_LABEL[r]}</option>
        ))}
      </select>
    </label>
  );
}

export function CreateTeamForm() {
  const [state, action, pending] = useActionState<AdminState, FormData>(createTeam, {});
  return (
    <form action={action} className="team-new">
      <div className="row-fields">
        <label className="field">
          <span>팀 이름</span>
          <input name="name" required placeholder="예: 개발3팀" suppressHydrationWarning />
        </label>
        <label className="field grow">
          <span>설명 (선택)</span>
          <input name="description" placeholder="이 팀이 무엇을 하는지" suppressHydrationWarning />
        </label>
      </div>
      <div className="row-fields">
        <label className="field">
          <span>색상</span>
          <ColorPicker name="color" value={TEAM_PALETTE[0]} />
        </label>
        <RolePicker value={null} />
      </div>
      {state.error && <p className="login-error">{state.error}</p>}
      {state.ok && <p className="ok-msg">{state.ok}</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "추가 중…" : "팀 추가"}
      </button>
    </form>
  );
}

export function EditTeamForm({
  team,
}: {
  team: {
    id: number; name: string; color: string; description: string | null;
    isActive: boolean; role: string | null;
  };
}) {
  return (
    <form action={updateTeam} className="team-edit">
      <input type="hidden" name="id" value={team.id} />
      <input
        className="tname"
        name="name"
        defaultValue={team.name}
        required
        suppressHydrationWarning
      />
      <input
        className="tdesc"
        name="description"
        defaultValue={team.description ?? ""}
        placeholder="설명 없음"
        suppressHydrationWarning
      />
      <ColorPicker name="color" value={team.color} />
      <select className="trole" name="role" defaultValue={team.role ?? ""} suppressHydrationWarning>
        <option value="">직군 없음</option>
        {TEAM_ROLES.map((r) => (
          <option key={r} value={r}>{TEAM_ROLE_LABEL[r]}</option>
        ))}
      </select>
      <button type="submit" className="btn-ghost">저장</button>
    </form>
  );
}

export function ToggleTeamForm({ id, isActive }: { id: number; isActive: boolean }) {
  return (
    <form action={toggleTeamActive}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn-ghost" title={isActive ? "비활성으로" : "다시 활성으로"}>
        {isActive ? "비활성" : "활성화"}
      </button>
    </form>
  );
}
