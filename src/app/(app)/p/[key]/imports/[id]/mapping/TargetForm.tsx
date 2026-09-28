"use client";

import { useActionState, useState } from "react";

import { saveTarget } from "../../actions";
import type { TargetState } from "../../wizard-types";

export type TargetProject = {
  key: string;
  name: string;
  rounds: { id: number; name: string }[];
};

/**
 * ④ 대상 — **어느 프로젝트의 어느 차수**로 넣을 것인가.
 *
 * ★ **올린 프로젝트와 달라도 된다** (팀장 지시). 고객사 파일을 여기서 열었다고
 *   이슈까지 여기로 들어가야 할 이유는 없다.
 *
 * ★ 차수 목록을 **프로젝트 전부의 것으로** 들고 있는다. 프로젝트를 고르는 순간
 *   차수가 같이 바뀌어야 하는데, 서버에 한 번 다녀오게 하면
 *   *"프로젝트는 바꿨는데 차수는 아직 저쪽 것"* 인 순간이 화면에 생긴다.
 *   차수는 프로젝트당 한둘이라 전부 실어 보내도 가볍다.
 */
export function TargetForm({
  projectKey, listId, projects, targetKey, roundId, committedAt,
}: {
  projectKey: string;
  listId: number;
  projects: TargetProject[];
  targetKey: string;
  roundId: number | null;
  committedAt: string | null;
}) {
  const [state, action, pending] = useActionState<TargetState, FormData>(saveTarget, {});
  const [key, setKey] = useState(targetKey);
  const picked = projects.find((p) => p.key === key) ?? null;

  return (
    <form action={action} className="imp-target">
      <input type="hidden" name="projectKey" value={projectKey} />
      <input type="hidden" name="listId" value={listId} />

      <label className="field">
        <span>프로젝트</span>
        <select
          name="target"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-label="이슈를 넣을 프로젝트"
        >
          <option value="">— 고르세요 —</option>
          {projects.map((p) => (
            <option key={p.key} value={p.key}>{p.name} ({p.key})</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>차수</span>
        <select
          name="round"
          defaultValue={roundId ? String(roundId) : ""}
          key={key}
          disabled={!picked}
          aria-label="발견 차수"
        >
          <option value="">— 없음 —</option>
          {picked?.rounds.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </label>

      <button className="btn-primary" disabled={pending || !key}>
        {pending ? "저장 중…" : "대상 저장"}
      </button>

      {state.error && <p className="imp-err">{state.error}</p>}
      {state.ok && <p className="ok-msg">{state.ok}</p>}
      {committedAt && (
        <p className="admin-hint imp-wide">
          이 목록은 <b>{committedAt}</b> 에 한 번 등록했습니다. 다시 눌러도 이미 만든 행은 건너뜁니다.
        </p>
      )}
      {targetKey && key !== targetKey && (
        <p className="admin-hint imp-wide">
          ⚠️ 프로젝트를 바꾸고 저장하면 <b>값 대조를 새로 합니다.</b>
          우선순위·환경 같은 값은 프로젝트마다 따로라, 그대로 두면
          화면은 이어 놨다고 하는데 등록이 실패합니다.
        </p>
      )}
    </form>
  );
}
