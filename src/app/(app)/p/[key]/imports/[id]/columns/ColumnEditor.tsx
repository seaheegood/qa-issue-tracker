"use client";

import { useActionState, useState } from "react";

import { saveColumns } from "../../actions";
import type { ColumnState } from "../../wizard-types";

export type EditorColumn = {
  id: number;
  sourceIndex: number;
  sourceHeader: string;
  label: string;
  isSelected: boolean;
  /** 이 열의 실제 값 몇 개. 무엇을 고를지는 이름보다 **값**을 봐야 정해진다 */
  samples: string[];
  /** 값이 하나도 없는 열인가 */
  blank: boolean;
};

/**
 * 가져올 열과 그 **순서**를 정한다 (사용자 요구의 핵심).
 *
 * ★ 여기서 정한 순서가 **목록 화면과 엑셀 내보내기 양쪽**에 그대로 쓰인다.
 *   한 번 정하면 두 곳이 같다 — 파일을 받은 쪽이 화면과 다른 표를 보는 일이 없다.
 *
 * ★ **고르지 않은 열도 사라지지 않는다.** 원본은 전부 DB 에 남아 있고 여기서
 *   체크만 꺼 둔 것이다. 그래서 나중에 "그 열도 보고 싶다" 가 나와도
 *   파일을 다시 올릴 필요가 없다.
 */
export function ColumnEditor({
  projectKey, listId, listName, columns, justImported,
}: {
  projectKey: string;
  listId: number;
  listName: string;
  columns: EditorColumn[];
  justImported: boolean;
}) {
  const [state, action, pending] = useActionState<ColumnState, FormData>(saveColumns, {});
  const [order, setOrder] = useState(columns);
  const [picked, setPicked] = useState(() => new Set(columns.filter((c) => c.isSelected).map((c) => c.id)));

  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const toggle = (id: number) => {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    setPicked(next);
  };

  const chosen = order.filter((c) => picked.has(c.id));

  return (
    /* ★ 오류가 올 때마다 폼을 새로 마운트해 되돌려받은 값을 다시 심는다
       (`MappingEditor` 와 같은 이야기 — 거긴 제어 칸이라 key 만으로 돈다) */
    <form key={state.at ? `r${state.at}` : "cols"} action={action} className="imp-cols">
      <input type="hidden" name="projectKey" value={projectKey} />
      <input type="hidden" name="listId" value={listId} />
      <input type="hidden" name="order" value={order.map((c) => c.id).join(",")} />
      <input type="hidden" name="selected" value={[...picked].join(",")} />

      {justImported && (
        <p className="ok-msg">
          가져왔습니다. 이제 <b>보여줄 열과 순서</b>를 정하세요 — 언제든 다시 바꿀 수 있습니다.
        </p>
      )}

      <label className="field">
        <span>목록 이름</span>
        <input name="name" defaultValue={state.values?.name ?? listName} maxLength={120} />
      </label>

      {/* 고른 결과를 순서대로 보여준다. 표를 안 봐도 지금 어떤 표가 나올지 알 수 있게. */}
      <div className="imp-chosen">
        <span className="imp-chosen-l">보이는 순서</span>
        {chosen.length === 0
          ? <span className="imp-dim">고른 열이 없습니다</span>
          : chosen.map((c, i) => (
              <span key={c.id} className="chip">
                <span className="imp-chosen-n">{i + 1}</span>{c.label}
              </span>
            ))}
      </div>

      <div className="tablewrap">
        <table className="admin-table imp-coltable">
          <thead>
            <tr>
              <th style={{ width: 54 }}>가져옴</th>
              <th style={{ width: 74 }}>순서</th>
              <th style={{ width: 78 }}>원본 열</th>
              <th style={{ width: 200 }}>원본 머리글</th>
              <th style={{ width: 220 }}>표시 이름</th>
              <th>값 예시</th>
            </tr>
          </thead>
          <tbody>
            {order.map((c, i) => {
              const on = picked.has(c.id);
              return (
                <tr key={c.id} className={on ? undefined : "imp-off"}>
                  <td>
                    <input
                      type="checkbox" checked={on} onChange={() => toggle(c.id)}
                      aria-label={`${c.label} 가져오기`}
                    />
                  </td>
                  <td className="imp-move">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                      aria-label={`${c.label} 위로`} title="위로">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1}
                      aria-label={`${c.label} 아래로`} title="아래로">↓</button>
                  </td>
                  <td className="imp-dim">{colName(c.sourceIndex)}</td>
                  <td className="imp-srch">
                    {c.sourceHeader || <span className="imp-dim">(머리글 없음)</span>}
                  </td>
                  <td>
                    <input
                      name={`label_${c.id}`}
                      defaultValue={state.values?.labels[String(c.id)] ?? c.label}
                      maxLength={255}
                      aria-label={`${c.label} 표시 이름`}
                    />
                  </td>
                  <td className="imp-samples">
                    {c.blank
                      ? <span className="imp-dim">값이 없는 열</span>
                      : c.samples.map((s, k) => <span key={k} className="imp-sample">{s}</span>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {state.error && <p className="imp-err">{state.error}</p>}
      {state.ok && <p className="ok-msg">{state.ok}</p>}

      <div className="imp-actions">
        <button className="btn-primary" disabled={pending || picked.size === 0}>
          {pending ? "저장 중…" : "저장"}
        </button>
        <span className="admin-hint">
          고르지 않은 열도 <b>지워지지 않습니다.</b> 원본은 그대로 남아 있어 언제든 다시 켤 수 있습니다.
        </span>
      </div>
    </form>
  );
}

/** 0 → A. 원본 엑셀에서 몇 번째 열이었는지 보여주려고 쓴다. */
function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}
