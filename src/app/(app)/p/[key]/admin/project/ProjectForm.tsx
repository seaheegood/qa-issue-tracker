"use client";

import { useActionState, useState } from "react";
import { ProjectField } from "@/components/ProjectField";

import { updateProject } from "../actions";
import type { AdminState } from "../actions";

export function ProjectForm({
  projectKey,
  name,
  issuePrefix,
  lastSeq,
}: {
  projectKey: string;
  name: string;
  issuePrefix: string | null;
  lastSeq: number;
}) {
  const [state, action, pending] = useActionState<AdminState, FormData>(updateProject, {});
  const [prefix, setPrefix] = useState(issuePrefix ?? "");

  const sample = prefix ? `${prefix}-${lastSeq}` : String(lastSeq);

  return (
    <form action={action} className="team-new">
      <ProjectField />
      <input type="hidden" name="key" value={projectKey} />

      <div className="row-fields">
        <label className="field grow">
          <span>프로젝트 이름</span>
          <input name="name" defaultValue={name} required suppressHydrationWarning />
        </label>
        <label className="field">
          <span>이슈번호 약자 (비우면 숫자만)</span>
          <input
            name="issuePrefix"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            placeholder="예: SP"
            maxLength={10}
            suppressHydrationWarning
          />
        </label>
      </div>

      <div className="preview-box">
        <span className="pv-label">이렇게 보입니다</span>
        <span className="pv-value">{sample}</span>
        {prefix === "" && <span className="pv-note">약자 없음 — 기본값</span>}
      </div>

      {state.error && <p className="login-error">{state.error}</p>}
      {state.ok && <p className="ok-msg">{state.ok}</p>}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}
