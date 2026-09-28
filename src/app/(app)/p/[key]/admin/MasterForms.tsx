"use client";

import { useActionState, useEffect, useRef } from "react";

import { ProjectField } from "@/components/ProjectField";
import { toast } from "@/components/Toast";

import { createMaster, updateMaster, type AdminState, type MasterKind } from "./actions";

/**
 * 우선순위 · 환경 · 플랫폼 — **한 벌로 만든다** (A-74).
 *
 * ★ 셋은 `코드 · 이름 · 순서 · 사용` 으로 모양이 같다 (우선순위만 색이 하나 더).
 *   차수 탭과도 같다. 화면을 셋 따로 쓰면 셋이 조금씩 달라지고, 그때부터
 *   *"환경만 왜 다르게 생겼지"* 가 시작된다 (차수 추가 폼이 실제로 그랬다 — 2026-08-24).
 *
 * ★ 표의 칸을 그대로 쓴다 — `<td>` 를 돌려주고, 폼은 첫 칸에 한 번만 둔 뒤
 *   나머지 칸의 입력을 `form={id}` 로 그 폼에 붙인다(HTML 표준, A-57).
 *   합친 칸 안에서 grid 로 열을 흉내내면 값이 머리글 아래에 오지 않는다.
 */
const LABEL: Record<MasterKind, string> = {
  priority: "우선순위", environment: "환경", platform: "플랫폼",
};
const PLACEHOLDER: Record<MasterKind, { name: string; code: string }> = {
  priority: { name: "예: Blocker", code: "예: BLOCKER" },
  environment: { name: "예: 운영(Prod)", code: "예: PROD" },
  platform: { name: "예: 태블릿", code: "예: TABLET" },
};

export function CreateMasterForm({ kind }: { kind: MasterKind }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(createMaster, {});
  const label = LABEL[kind];
  const ph = PLACEHOLDER[kind];

  return (
    <form action={action} className="team-new">
      <ProjectField />
      <input type="hidden" name="kind" value={kind} />
      {/* ★ `.row-fields` 로 감싸야 가로로 놓인다. `.team-new` 는 세로로 쌓는 카드다 */}
      <div className="row-fields">
        <label className="field">
          <span>이름</span>
          <input name="name" required placeholder={ph.name} maxLength={50} suppressHydrationWarning />
        </label>
        <label className="field">
          <span>코드 <em>만든 뒤 못 바꿈</em></span>
          <input name="code" required placeholder={ph.code} maxLength={30}
            style={{ textTransform: "uppercase" }} suppressHydrationWarning />
        </label>
        {kind === "priority" && (
          <label className="field" style={{ flex: "0 0 90px" }}>
            <span>색</span>
            <input name="color" type="color" defaultValue="#94a3b8"
              aria-label="색" suppressHydrationWarning />
          </label>
        )}
      </div>

      {state.error && <p className="login-error">{state.error}</p>}
      {state.ok && <p className="ok-msg">{state.ok}</p>}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "추가 중…" : `${label} 추가`}
      </button>
    </form>
  );
}

export function MasterRow({ kind, id, name, code, color, sortOrder }: {
  kind: MasterKind;
  id: number; name: string; code: string; color?: string; sortOrder: number;
}) {
  const formId = `master-${kind}-${id}`;
  const [state, action, pending] = useActionState<AdminState, FormData>(updateMaster, {});
  const label = LABEL[kind];

  // 저장됐다는 말 (C-25). `ok` 문구는 매번 같아서 값으로는 "방금 됐다"를 알 수 없다 —
  // `pending` 이 참 → 거짓으로 떨어지는 순간을 본다 (차수·시스템과 같은 방식).
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) {
      if (state.error) toast(state.error, "error");
      else toast(`${label}을 저장했습니다`);
    }
    wasPending.current = pending;
  }, [pending, state.error, label]);

  const save = (e: { currentTarget: { form: HTMLFormElement | null } }) =>
    e.currentTarget.form?.requestSubmit();

  return (
    <>
      <td>
        <form id={formId} action={action} className="rowform">
          <ProjectField />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
        </form>
        <input
          form={formId} name="name" className="rin" defaultValue={name} maxLength={50}
          aria-label={`${label} 이름`} aria-busy={pending} onBlur={save} suppressHydrationWarning
        />
      </td>
      {/* ★ 코드는 만든 뒤 못 바꾼다 (A-77) — `?priority=` 링크·저장된 필터·엑셀이 물고 있다 */}
      <td>
        <span className="rcode" title="공유 링크와 저장된 필터가 이 값을 물고 있습니다. 만든 뒤에는 바꿀 수 없습니다">
          {code}
        </span>
      </td>
      {kind === "priority" && (
        <td>
          <input
            form={formId} name="color" type="color" className="rin" defaultValue={color ?? "#94a3b8"}
            aria-label="색" onChange={save} suppressHydrationWarning
            style={{ width: 48, padding: 2 }}
          />
        </td>
      )}
      <td>
        <input
          form={formId} name="sortOrder" type="number" className="rin" defaultValue={sortOrder}
          aria-label="순서" onChange={save} suppressHydrationWarning
          style={{ width: 64 }}
        />
      </td>
    </>
  );
}
