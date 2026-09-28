"use client";

import { useActionState, useMemo, useState } from "react";

import { saveMapping } from "../../actions";
import type { MappingState } from "../../wizard-types";
import {
  autoMap, FIELDS, isMasterField, MASTER_FIELDS,
  type Choice, type MasterField, type TargetField,
} from "@/lib/import-map";

export type EditorColumn = {
  id: number;
  label: string;
  sourceHeader: string;
  sourceIndex: number;
  isSelected: boolean;
  targetField: string | null;
  valueMap: Record<string, string> | null;
  /** 이 열에 실제로 들어 있는 값들 (가짓수가 적을 때만) */
  values: string[];
  /** 값이 너무 많아 대조할 수 없는 열인가 — 자유 입력 칸이다 */
  tooMany: boolean;
};

type Person = { id: number; name: string; loginId: string };

/**
 * ③ 매핑 — **열을 이슈의 어느 칸으로** 넣을 것인가.
 *
 * ★ **칸을 기준으로 놓는다.** 열을 기준으로 놓으면(열마다 "어느 칸?") 35열짜리
 *   파일에서 *"이슈타이틀은 골랐나"* 를 눈으로 훑어야 한다. 반대로 놓으면
 *   **필수 칸이 비었다는 게 한눈에** 보인다.
 *
 * ★ **라디오를 두지 않았다.** `엑셀 열에서 / 전부 이 값으로` 를 라디오로 두면
 *   *"열에서 를 골랐는데 열은 안 고른"* 상태가 만들어진다. 대신 칸마다
 *   **열 고르기**와 **기본값** 둘을 나란히 두고, 규칙을 한 줄로 적었다 —
 *   *열이 있으면 열이 이기고, 그 칸이 비었으면 기본값.*
 *
 * ★ 못 맞춘 값은 **사람이 고른다.** 가장 비슷한 것에 자동으로 붙이지 않는다 —
 *   `Minor` 가 `Major` 로 들어가면 **아무도 틀린 줄 모른다**.
 */
export function MappingEditor({
  projectKey, listId, columns, masters, people, defaults,
}: {
  projectKey: string;
  listId: number;
  columns: EditorColumn[];
  masters: Record<MasterField, Choice[]>;
  people: Person[];
  defaults: Partial<Record<MasterField, string>>;
}) {
  const [state, action, pending] = useActionState<MappingState, FormData>(saveMapping, {});

  // 작성자도 값 대조가 필요하다. 사람 목록을 마스터와 **같은 모양**으로 만들어
  // 대조 규칙(`matchChoice`)을 한 벌만 쓴다.
  const peopleChoices: Choice[] = useMemo(
    () => people.map((p) => ({ id: p.id, code: String(p.id), name: p.name })),
    [people],
  );
  const choicesOf = (f: TargetField): Choice[] | null =>
    isMasterField(f) ? masters[f] : f === "reporter" ? peopleChoices : null;

  // 칸 → 열 id. 0 이면 안 씀.
  const [pick, setPick] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const c of columns) if (c.targetField) init[c.targetField] = c.id;
    return init;
  });
  const [def, setDef] = useState<Record<string, string>>(() => ({ ...defaults }));

  // 사람이 손으로 이은 값. 키는 `열id:엑셀값`.
  const [manual, setManual] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const c of columns) {
      for (const [k, v] of Object.entries(c.valueMap ?? {})) init[`${c.id}:${k}`] = v;
    }
    return init;
  });

  /** 한 열은 한 칸에만 걸린다. 다른 칸이 쓰고 있으면 거기서 뗀다. */
  const choose = (field: TargetField, colId: number) => {
    setPick((prev) => {
      const next = { ...prev };
      if (!colId) delete next[field];
      else {
        for (const [f, id] of Object.entries(next)) if (id === colId) delete next[f];
        next[field] = colId;
      }
      return next;
    });
  };

  const colOf = (field: TargetField) => columns.find((c) => c.id === pick[field]) ?? null;

  /** 이 열에서 **아직 못 이은 값**들. 화면은 이것만 물어본다. */
  const unmatchedOf = (col: EditorColumn, choices: Choice[]) => {
    if (col.tooMany) return [];
    const auto = autoMap(col.values, choices);
    return auto.unmatched.filter((v) => !manual[`${col.id}:${v}`]);
  };

  /** 저장할 대조표 — **자동으로 맞춘 것까지 전부** 담는다 (나중에 무엇으로 이었는지가 남아야 한다). */
  const mapFor = (col: EditorColumn, choices: Choice[]) => {
    const out: Record<string, string> = col.tooMany ? {} : autoMap(col.values, choices).map;
    for (const [k, v] of Object.entries(manual)) {
      const [cid, ...rest] = k.split(":");
      if (Number(cid) === col.id && v) out[rest.join(":")] = v;
    }
    return out;
  };

  const fieldOfCol = (colId: number): TargetField | "" => {
    for (const [f, id] of Object.entries(pick)) if (id === colId) return f as TargetField;
    return "";
  };

  const unused = columns.filter((c) => !fieldOfCol(c.id));

  /**
   * ★★ **저장을 누를 때마다 폼을 새로 마운트한다.**
   *
   * 2026-09-17 제보 — *"다 매핑했는데 이슈타이틀 안 골랐더니 싹 초기화됐어요"*.
   * 실제로 재현됐다 — 14칸을 골라 놓고 저장을 누르면 오류가 뜨면서
   * **전부 `— 안 쓴 —` 으로** 돌아갔다.
   *
   * —— 왜 그런가 —————————————————————————
   * React 19 는 `<form action={서버액션}>` 이 끝나면 **폼을 초기화한다.**
   * 그러면 `<select>` 의 DOM 값이 첫 옵션으로 돌아가는데,
   * React 는 **자기가 마지막으로 그린 값과 같다고 알고 있어서**
   * 다시 그릴 때 `value` 를 다시 안 심는다. 제어 캴포넌트인데도 값이 날아간다.
   *
   * ★ 그래서 **고른 값 자체는 멀짱하다** — `pick`/`def`/`manual` 은 React 상태라
   *   그대로 있다. 날아간 건 화면(DOM)뿐이다.
   *   `key` 를 바꿔 폼을 **새로 만들게** 하면 `<select>` 들이 상태에서
   *   다시 그려져 복구된다. 서버가 값을 되돌려줄 필요가 없다.
   *
   * ⚠️ `state.error` 를 키로 쓰면 **같은 오류가 연속으로 나면 키가 안 바뀜**
   *   두 번째부터 다시 날아간다. 그래서 서버가 `at`(매번 다른 값)을 돌려준다.
   *
   * ★ `issues/new` 는 **입력칸이 비제어**라 값이 DOM 에만 있었고,
   *   그래서 서버가 `state.values` 로 되돌려줘야 했다. 여기는 그게 필요 없다 —
   *   **같은 함정이지만 고치는 법이 다르다.**
   */
  const formKey = state.at ? `r${state.at}` : "map";

  return (
    <form key={formKey} action={action} className="imp-map">
      <input type="hidden" name="projectKey" value={projectKey} />
      <input type="hidden" name="listId" value={listId} />
      {columns.map((c) => {
        const f = fieldOfCol(c.id);
        const choices = f ? choicesOf(f) : null;
        return (
          <div key={c.id}>
            <input type="hidden" name={`field_${c.id}`} value={f} />
            {choices && (
              <input type="hidden" name={`map_${c.id}`} value={JSON.stringify(mapFor(c, choices))} />
            )}
          </div>
        );
      })}
      {MASTER_FIELDS.map((f) => (
        <input key={f} type="hidden" name={`default_${f}`} value={def[f] ?? ""} />
      ))}

      <p className="admin-hint">
        <b>열이 있으면 열이 이깁니다.</b> 그 열의 칸이 비어 있으면 오른쪽 기본값을 씁니다.
        값이 적혀 있는데 어느 값인지 못 정하면 <b>그 행만 실패</b>합니다 — 나머지는 들어갑니다.
      </p>

      <div className="tablewrap">
        <table className="admin-table imp-maptable">
          <thead>
            <tr>
              <th style={{ width: 150 }}>이슈 칸</th>
              <th style={{ width: 300 }}>엑셀 열에서</th>
              <th>전부 이 값으로 · 값 잇기</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map((fd) => {
              // ★ `const` 로 한 번 좁혀 둔다. 파라미터(`fd`)를 그때그때 좁히면
              //   **아래 콜백 안에서 좁힘이 풀린다** — TS 는 파라미터가 다시 대입될 수
              //   있다고 보기 때문이다.
              const mf: MasterField | null = isMasterField(fd.key) ? fd.key : null;
              const col = colOf(fd.key);
              const choices = choicesOf(fd.key);
              const required = fd.key === "title" || (!!mf && mf !== "platform" && mf !== "reproRate");
              const unmatched = col && choices ? unmatchedOf(col, choices) : [];
              return (
                <tr key={fd.key}>
                  <td>
                    <b>{fd.label}</b>
                    {required && <span className="imp-req" title="반드시 정해야 합니다"> *</span>}
                    {fd.hint && <div className="imp-dim imp-fhint">{fd.hint}</div>}
                  </td>
                  <td>
                    <select
                      value={col?.id ?? 0}
                      onChange={(e) => choose(fd.key, Number(e.target.value))}
                      aria-label={`${fd.label} 로 쓸 열`}
                    >
                      <option value={0}>— 안 씀 —</option>
                      {columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}{c.isSelected ? "" : " (감춘 열)"}
                        </option>
                      ))}
                    </select>
                    {col && col.tooMany && choices && (
                      <div className="imp-bad imp-fhint">
                        값이 너무 여러 가지라 미리 이어둘 수 없습니다. 맞는 값만 들어갑니다.
                      </div>
                    )}
                  </td>
                  <td>
                    {mf ? (
                      <>
                        <select
                          value={def[mf] ?? ""}
                          onChange={(e) => setDef({ ...def, [mf]: e.target.value })}
                          aria-label={`${fd.label} 기본값`}
                        >
                          <option value="">— 없음 —</option>
                          {masters[mf].map((m) => (
                            <option key={m.code} value={m.code}>{m.name}</option>
                          ))}
                        </select>
                        {unmatched.length > 0 && (
                          <div className="imp-unmatched">
                            <span className="imp-dim">못 맞춘 값 {unmatched.length}개</span>
                            {unmatched.map((v) => (
                              <label key={v} className="imp-pair">
                                <span className="imp-raw" title={v}>{v}</span>
                                <select
                                  value={manual[`${col!.id}:${v}`] ?? ""}
                                  onChange={(e) => setManual({ ...manual, [`${col!.id}:${v}`]: e.target.value })}
                                  aria-label={`'${v}' 를 어느 ${fd.label} 로`}
                                >
                                  <option value="">— 고르세요 —</option>
                                  {masters[mf].map((m) => (
                                    <option key={m.code} value={m.code}>{m.name}</option>
                                  ))}
                                </select>
                              </label>
                            ))}
                          </div>
                        )}
                      </>
                    ) : fd.key === "reporter" && col ? (
                      unmatched.length > 0 ? (
                        <div className="imp-unmatched">
                          <span className="imp-dim">
                            우리 계정에 없는 이름 {unmatched.length}개 — 안 고르면 <b>올린 사람</b>이 됩니다
                          </span>
                          {unmatched.slice(0, 12).map((v) => (
                            <label key={v} className="imp-pair">
                              <span className="imp-raw" title={v}>{v}</span>
                              <select
                                value={manual[`${col.id}:${v}`] ?? ""}
                                onChange={(e) => setManual({ ...manual, [`${col.id}:${v}`]: e.target.value })}
                                aria-label={`'${v}' 는 누구인가`}
                              >
                                <option value="">— 올린 사람 —</option>
                                {people.map((p) => (
                                  <option key={p.id} value={p.id}>{p.name} ({p.loginId})</option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <span className="imp-dim">이름이 전부 우리 계정과 맞습니다.</span>
                      )
                    ) : (
                      <span className="imp-dim">
                        {col ? `${col.label} 의 값을 그대로 넣습니다.` : "—"}
                      </span>
                    )}
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
        {/* ★ 제목을 안 고르면 **서버까지 가지 않는다.** 제일 흔한 오류고,
            안 갔다 오는 것보다 안 가는 게 확실하다.
            ⚠️ 다만 **서버가 여전히 다시 확인한다** — 화면이 막는 것과
              서버가 받아주는 것은 다른 이야기다 (`C-44` 와 같은 규칙). */}
        <button className="btn-primary" disabled={pending || !pick.title}>
          {pending ? "저장 중…" : "매핑 저장"}
        </button>
        {!pick.title && (
          <span className="imp-bad">
            <b>이슈타이틀</b> 로 쓸 열을 먼저 고르세요. 제목이 없으면 목록에서 아무것도 안 보입니다.
          </span>
        )}
        <span className="admin-hint">
          쓰지 않는 열 {unused.length}개는 <b>그대로 보관</b>됩니다. 이슈로만 안 갈 뿐입니다.
        </span>
      </div>
    </form>
  );
}
