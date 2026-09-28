"use client";

import { useActionState, useEffect, useRef } from "react";
import { ProjectField } from "@/components/ProjectField";
import { toast } from "@/components/Toast";

import { createRound, updateRound, type AdminState } from "../actions";

/**
 * 새 차수. 이름만 필수다 — 시작할 때 끝날 날을 아는 경우가 드물다.
 *
 * ★ **칸은 `.row-fields` 로 감싼다** (2026-08-24 제보 — *"차수 입력하는 부분만 다르게 노출돼"*).
 *   `.team-new` 는 **세로로 쌓는 카드**다. 팀 추가가 가로로 보이는 건 안에서 칸을
 *   `.row-fields` 로 한 번 더 감싸기 때문인데, 여기만 그걸 빠뜨려서
 *   칸 넷이 **850px 폭으로 하나씩** 쌓였다. 이 화면만 다른 앱처럼 보였다.
 */
export function CreateRoundForm() {
  const [state, action, pending] = useActionState<AdminState, FormData>(createRound, {});
  return (
    <form action={action} className="team-new">
      <ProjectField />
      <div className="row-fields">
        <label className="field">
          <span>이름</span>
          <input name="name" required placeholder="예: 3차" maxLength={50} suppressHydrationWarning />
        </label>
        <label className="field">
          <span>코드</span>
          <input name="code" required placeholder="예: R3" maxLength={30} suppressHydrationWarning />
        </label>
        <label className="field">
          <span>시작 <em>선택</em></span>
          <input name="startedOn" type="date" suppressHydrationWarning />
        </label>
        <label className="field">
          <span>종료 <em>선택</em></span>
          <input name="endedOn" type="date" suppressHydrationWarning />
        </label>
      </div>

      {state.error && <p className="login-error">{state.error}</p>}
      {state.ok && <p className="ok-msg">{state.ok}</p>}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "추가 중…" : "차수 추가"}
      </button>
    </form>
  );
}

/**
 * 기존 차수 한 줄. 바꾸면 바로 저장된다.
 *
 * ★ **표의 칸을 그대로 쓴다** — `<td>` 를 넷 돌려주고, 폼은 첫 칸에 한 번만 둔 뒤
 *   나머지 칸의 입력은 `form={id}` 로 그 폼에 붙인다(HTML 표준).
 *
 *   예전에는 네 칸을 `colSpan={4}` 로 합치고 그 안에서 grid 로 다시 나눴다. 두 가지가 틀렸다.
 *   ① 자식이 **넷**(이름·코드·시작·종료)인데 열이 **셋**(`1fr 130px 130px`)이라
 *      `종료` 가 **다음 줄로 넘쳐** 한 차수가 두 줄로 보였다.
 *   ② 그 grid 는 **표의 칸 너비와 아무 상관이 없어서**, 열을 맞춰도 값이
 *      머리글(이름·코드·시작·종료) 아래에 오지 않는다.
 *   합친 칸 안에서 열을 흉내내는 대신 **표에게 맡긴다.**
 */
export function RoundRow({ id, name, code, startedOn, endedOn }: {
  id: number; name: string; code: string; startedOn: string; endedOn: string;
}) {
  const formId = `round-${id}`;
  const [state, action, pending] = useActionState<AdminState, FormData>(updateRound, {});

  // ★ 저장됐다는 말 (C-25). 이 줄도 **고치면 바로 저장**이라, 아무 말이 없으면
  //   저장이 된 건지 알 수 없다 — 이슈 화면 드롭다운과 같은 문제다.
  //   `ok` 문구는 매번 같아서 값으로는 "방금 됐다"를 알 수 없다.
  //   그래서 `pending` 이 **참 → 거짓으로 떨어지는 순간**을 본다.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) {
      if (state.error) toast(state.error, "error");
      else toast("차수를 저장했습니다");
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  const save = (e: { currentTarget: { form: HTMLFormElement | null } }) =>
    e.currentTarget.form?.requestSubmit();

  return (
    <>
      <td>
        {/* 폼은 여기 한 번만. 숨은 칸만 들어 있어 자리를 차지하지 않는다 */}
        <form id={formId} action={action} className="rowform">
          <ProjectField />
          <input type="hidden" name="id" value={id} />
        </form>
        <input
          form={formId} name="name" className="rin" defaultValue={name} maxLength={50}
          aria-label="차수 이름" aria-busy={pending}
          onBlur={save} suppressHydrationWarning
        />
      </td>
      {/* 코드는 만든 뒤 못 바꾼다 (A-39). 읽기 전용으로 보여준다 — URL 의 ?round= 가 이 값이다 */}
      <td><span className="rcode" title="만든 뒤에는 바꿀 수 없습니다">{code}</span></td>
      <td>
        <input
          form={formId} name="startedOn" type="date" className="rin" defaultValue={startedOn}
          aria-label="시작일" onChange={save} suppressHydrationWarning
        />
      </td>
      <td>
        <input
          form={formId} name="endedOn" type="date" className="rin" defaultValue={endedOn}
          aria-label="종료일" onChange={save} suppressHydrationWarning
        />
      </td>
    </>
  );
}
