"use client";

import { useActionState, useEffect, useState } from "react";
import { ProjectField } from "@/components/ProjectField";

import { bulkEdit, type BulkState } from "./bulk-actions";

/**
 * 여러 건 한꺼번에 바꾸기 (요구사항서 09).
 *
 * ★ **JS 가 없어도 동작한다.**
 *   체크박스는 목록 안(서버 컴포넌트)에 있고, HTML 의 `form="bulk"` 속성으로
 *   멀리 있는 이 폼에 붙는다. 폼 제출은 브라우저가 한다 —
 *   JS 가 없을 때 사라지는 건 **고른 개수 표시**뿐이다.
 *   (`/admin/transitions` 의 Reason 표가 쓰는 것과 같은 패턴이다)
 *
 * ★ 목록 542줄은 **서버 컴포넌트 그대로** 둔다. 클라이언트는 이 바 하나뿐이다.
 *
 * ★ **상태는 여기 없다.** 담당자·차수·우선순위·플랫폼 넷만이다 —
 *   이 넷은 전이 규칙도 Reason 도 안 걸려서 10건이든 100건이든 똑같이 동작한다.
 */
type Opt = { id: number; code?: string; name: string };

export function BulkBar({
  members, rounds, priorities, platforms,
}: {
  members: { id: number; name: string }[];
  rounds: Opt[];
  priorities: Opt[];
  platforms: { code: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<BulkState, FormData>(bulkEdit, {});
  const [field, setField] = useState("assignee");
  const [n, setN] = useState(0);

  // 고른 개수. 체크박스는 이 컴포넌트 밖(목록)에 있어서 document 에서 센다.
  useEffect(() => {
    const count = () =>
      setN(document.querySelectorAll<HTMLInputElement>("input.row-check:checked").length);
    count();
    document.addEventListener("change", count);
    return () => document.removeEventListener("change", count);
  }, [state.done]);

  const opts: Opt[] =
    field === "assignee" ? members : field === "round" ? rounds : priorities;

  return (
    <details className="dd bulk">
      <summary title="여러 건 한꺼번에 바꾸기">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
        일괄
        {n > 0 && <span className="bk-n">{n}</span>}
      </summary>

      <div className="dd-menu bulk-menu">
        <p className="bk-head">
          {n > 0 ? <><b>{n}건</b> 을 한꺼번에 바꿉니다.</> : <>왼쪽에서 <b>이슈를 고르세요.</b></>}
          <span>상태는 여기서 못 바꿉니다 — 전이 규칙과 사유가 건마다 달라서입니다.</span>
        </p>

        <form action={action} id="bulk" className="bk-form">
      <ProjectField />
          <select
            name="field" value={field}
            onChange={(e) => setField(e.target.value)}
            suppressHydrationWarning
          >
            <option value="assignee">담당자</option>
            <option value="round">차수</option>
            <option value="priority">우선순위</option>
            <option value="platform">플랫폼</option>
          </select>

          {field === "platform" ? (
            <fieldset className="bk-plats">
              {platforms.map((p) => (
                <label key={p.code}>
                  <input type="checkbox" name="platform" value={p.code} suppressHydrationWarning />
                  {p.name}
                </label>
              ))}
            </fieldset>
          ) : (
            /* ★ 첫 항목을 '고르세요' 로 둔다.
               담당자에 '— 담당자 없음' 이 기본으로 걸려 있으면, 아무것도 안 고르고
               누른 사람이 12건의 담당자를 통째로 지운다. 비우는 건 일부러 골라야 한다. */
            <select name="value" defaultValue="" required suppressHydrationWarning>
              <option value="" disabled>— 고르세요</option>
              {opts.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
              {field === "assignee" && <option value="__none">담당자 없음으로 비우기</option>}
              {field === "round" && <option value="__none">미분류로 되돌리기</option>}
            </select>
          )}

          <button type="submit" className="btn-primary sm" disabled={pending || n === 0}>
            {pending ? "바꾸는 중…" : n > 0 ? `${n}건 바꾸기` : "바꾸기"}
          </button>
        </form>

        {state.error && <p className="login-error sm">{state.error}</p>}
        {state.done && <p className="bk-done">{state.done}</p>}

        <p className="bk-note">
          바뀐 건마다 <b>변경 이력</b>이 남고, 구독자에게는 <b>묶어서 한 통</b>만 갑니다.
        </p>
      </div>
    </details>
  );
}
