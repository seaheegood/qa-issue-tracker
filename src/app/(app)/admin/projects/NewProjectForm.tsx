"use client";

import { useActionState, useState } from "react";

import { addProject, type NewProjectState } from "./actions";

/** 새 프로젝트. 식별자는 만든 뒤 못 바꾸므로 미리보기로 보여준다. */
export function NewProjectForm({ projects }: { projects: { id: number; key: string; name: string }[] }) {
  const [state, action, pending] = useActionState<NewProjectState, FormData>(addProject, {});
  const [key, setKey] = useState("");
  const [prefix, setPrefix] = useState("");

  return (
    <form action={action} className="team-new">
      <div className="row2">
        <label className="field">
          <span>프로젝트 이름</span>
          <input name="name" required maxLength={100} placeholder="예: 쇼핑몰 리뉴얼" suppressHydrationWarning />
        </label>
        <label className="field">
          <span>식별자 <em>주소에 들어갑니다 · 나중에 못 바꿉니다</em></span>
          <input
            name="key" required maxLength={10} placeholder="예: MALL"
            value={key} onChange={(e) => setKey(e.target.value.toUpperCase())}
            suppressHydrationWarning
          />
        </label>
      </div>

      <div className="row2">
        <label className="field">
          <span>이슈번호 약자 <em>비우면 숫자만</em></span>
          <input
            name="issuePrefix" maxLength={10} placeholder="예: MA"
            value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            suppressHydrationWarning
          />
        </label>
        <label className="field">
          <span>설정을 복제할 프로젝트</span>
          <select name="copyFrom" defaultValue={projects[0]?.id ?? ""} required suppressHydrationWarning>
            {projects.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="admin-hint" style={{ margin: "4px 0 0" }}>
        주소는 <code>/p/{key || "MALL"}/issues</code>, 이슈번호는{" "}
        <code>{prefix ? `${prefix}-1` : "1"}</code> 로 보입니다.
      </p>

      {state.error && <p className="login-error">{state.error}</p>}

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "만드는 중…" : "프로젝트 만들기"}
      </button>
    </form>
  );
}
