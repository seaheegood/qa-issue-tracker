"use client";

import { useActionState, useEffect, useRef } from "react";

import { ProjectField } from "@/components/ProjectField";
import { toast } from "@/components/Toast";

import { createSystem, updateSystem, type AdminState } from "../actions";

/**
 * 새 시스템.
 *
 * ★ **코드가 두 글자인 게 이 폼의 핵심이다.** 기능ID(`SVPR-01-01`)의 앞 두 글자가
 *   이 값이라, 여기서 흐트러지면 기능 축이 통째로 어긋난다 (`docs/04`).
 *   그래서 만든 뒤에는 못 바꾸고, 만들 때 형식을 막는다.
 *
 * ★ 받는 것은 **이름 · 코드 · 설명** 셋뿐이다 (A-68).
 *   `쓰는 사람`(운영자/셀러/고객)과 `어디서 도나`(웹/앱/API), `주소` 는 첫 프로젝트 IA 에서
 *   나온 축인데 **프로젝트마다 뜻이 다르고, 앱 어디서도 읽지 않았다.**
 *   컬럼과 첫 프로젝트의 기존 값은 그대로 남는다 (A-69).
 */
export function CreateSystemForm() {
  const [state, action, pending] = useActionState<AdminState, FormData>(createSystem, {});
  return (
    <form action={action} className="team-new">
      <ProjectField />
      <div className="row-fields">
        <label className="field">
          <span>이름</span>
          <input name="name" required placeholder="예: 관리자 콘솔" maxLength={50} suppressHydrationWarning />
        </label>
        <label className="field">
          <span>코드 <em>영문 2글자</em></span>
          <input name="code" required placeholder="예: SV" maxLength={2}
            style={{ textTransform: "uppercase", width: 90 }} suppressHydrationWarning />
        </label>
        <label className="field" style={{ flex: 2 }}>
          <span>설명 <em>선택</em></span>
          <input name="description" maxLength={500}
            placeholder="예: 내부 운영자가 쓰는 관리 콘솔" suppressHydrationWarning />
        </label>
      </div>

      {state.error && <p className="login-error">{state.error}</p>}
      {state.ok && <p className="ok-msg">{state.ok}</p>}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "추가 중…" : "시스템 추가"}
      </button>
    </form>
  );
}

/**
 * 기존 시스템 한 줄. 고치면 바로 저장된다.
 *
 * ★ 차수와 **같은 모양**이다 — `<td>` 를 셋 돌려주고, 폼은 첫 칸에 한 번만 둔 뒤
 *   나머지 칸을 `form={id}` 로 붙인다(HTML 표준). 합친 칸 안에서 grid 로 열을
 *   흉내내면 값이 머리글 아래에 오지 않는다 (2026-08-24 에 겪었다).
 */
export function SystemRow({ id, name, code, description }: {
  id: number; name: string; code: string; description: string;
}) {
  const formId = `system-${id}`;
  const [state, action, pending] = useActionState<AdminState, FormData>(updateSystem, {});

  // 저장됐다는 말 (C-25). `ok` 문구는 매번 같아서 값으로는 "방금 됐다"를 알 수 없다 —
  // `pending` 이 참 → 거짓으로 떨어지는 순간을 본다 (차수와 같은 방식).
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) {
      if (state.error) toast(state.error, "error");
      else toast("시스템을 저장했습니다");
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  const save = (e: { currentTarget: { form: HTMLFormElement | null } }) =>
    e.currentTarget.form?.requestSubmit();

  return (
    <>
      <td>
        <form id={formId} action={action} className="rowform">
          <ProjectField />
          <input type="hidden" name="id" value={id} />
        </form>
        <input
          form={formId} name="name" className="rin" defaultValue={name} maxLength={50}
          aria-label="시스템 이름" aria-busy={pending} onBlur={save} suppressHydrationWarning
        />
      </td>
      {/* ★ 코드는 만든 뒤 못 바꾼다 — 기능ID 의 앞 두 글자이고, `?system=` 링크가 이 값이다 */}
      <td>
        <span className="rcode" title="기능ID 의 앞 두 글자입니다. 만든 뒤에는 바꿀 수 없습니다">{code}</span>
      </td>
      <td>
        <input
          form={formId} name="description" className="rin" defaultValue={description} maxLength={500}
          aria-label="설명" placeholder="비워둬도 됩니다" onBlur={save} suppressHydrationWarning
        />
      </td>
    </>
  );
}
