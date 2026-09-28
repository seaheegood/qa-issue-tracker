"use client";

import { useActionState } from "react";

import { ProjectField } from "@/components/ProjectField";
import { JIRA_PRIORITIES } from "@/lib/jira-const";

import { saveJiraSettings, type AdminState } from "../actions";

type Setting = {
  baseUrl: string;
  jiraProjectKey: string;
  issueTypeId: string;
  labels: string | null;
  categoryFieldId: string | null;
  categoryValue: string | null;
  defaultParentKey: string | null;
};

/**
 * 지라 설정 폼 (`J-02`~`J-09`).
 *
 * ⚠️ **토큰 칸이 없다.** 일부러 없다 — 있으면 누군가 넣고, 넣으면 DB·백업에 평문으로 남는다.
 */
export function JiraForm({
  setting, priorities, priorityMap,
}: {
  setting: Setting | null;
  priorities: { id: number; name: string; isActive: boolean }[];
  priorityMap: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<AdminState, FormData>(saveJiraSettings, {});

  return (
    <form action={action} className="team-new">
      <ProjectField />

      <div className="row-fields">
        <label className="field grow">
          <span>지라 주소</span>
          <input
            name="baseUrl" defaultValue={setting?.baseUrl ?? ""}
            placeholder="https://your-company.atlassian.net" required suppressHydrationWarning
          />
        </label>
        <label className="field">
          <span>지라 프로젝트 키</span>
          <input
            name="jiraProjectKey" defaultValue={setting?.jiraProjectKey ?? ""}
            placeholder="WEB" maxLength={20} required suppressHydrationWarning
          />
        </label>
        <label className="field">
          <span>이슈 타입 ID</span>
          <input
            name="issueTypeId" defaultValue={setting?.issueTypeId ?? ""}
            placeholder="10355" maxLength={20} required suppressHydrationWarning
          />
        </label>
      </div>

      <div className="row-fields">
        <label className="field">
          <span>라벨 (쉼표로 여럿)</span>
          <input
            name="labels" defaultValue={setting?.labels ?? ""}
            placeholder="이슈" maxLength={200} suppressHydrationWarning
          />
        </label>
        <label className="field">
          <span>기본 Epic (비워도 됩니다)</span>
          <input
            name="defaultParentKey" defaultValue={setting?.defaultParentKey ?? ""}
            placeholder="WEB-123" maxLength={30} suppressHydrationWarning
          />
        </label>
      </div>

      <div className="row-fields">
        <label className="field">
          <span>커스텀 필드 ID</span>
          <input
            name="categoryFieldId" defaultValue={setting?.categoryFieldId ?? ""}
            placeholder="customfield_10100" maxLength={40} suppressHydrationWarning
          />
        </label>
        <label className="field">
          <span>그 필드에 넣을 값</span>
          <input
            name="categoryValue" defaultValue={setting?.categoryValue ?? ""}
            placeholder="QA" maxLength={100} suppressHydrationWarning
          />
        </label>
      </div>
      <p className="admin-hint">
        <b>Category</b> 처럼 단일 선택 필드 하나를 함께 채울 수 있습니다.
        <b> 둘 다 적거나 둘 다 비우세요</b> — 반쪽으로 보내면 지라가 거부합니다.
      </p>

      <div className="jira-pri">
        <span className="field-label">우선순위 짝짓기</span>
        <p className="admin-hint">
          우리 우선순위를 지라의 다섯 등급 중 무엇으로 보낼지입니다.
          <b> 비워 두면 우선순위를 보내지 않습니다</b> — 지라의 기본값이 들어갑니다.
        </p>
        <div className="jira-pri-rows">
          {priorities.map((p) => (
            <label key={p.id} className="field">
              <span>{p.name}{p.isActive ? "" : " (안 씀)"}</span>
              <select
                name={`jiraPri_${p.id}`}
                defaultValue={priorityMap[String(p.id)] ?? ""}
                suppressHydrationWarning
              >
                <option value="">— 안 보냄</option>
                {JIRA_PRIORITIES.map((j) => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      {state.error && <p className="login-error">{state.error}</p>}
      {state.ok && <p className="ok-msg">{state.ok}</p>}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}
