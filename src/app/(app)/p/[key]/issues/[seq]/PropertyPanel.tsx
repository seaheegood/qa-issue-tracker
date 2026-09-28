"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ProjectField } from "@/components/ProjectField";
import { toast } from "@/components/Toast";

import {
  Avatar, byTeam, CLOSE_NEEDS_NOTE, CLOSE_REASON_LABEL, CLOSE_REASONS, type CloseReason,
  directionParticle, objectParticle, REPRO_RATE_LABEL, REPRO_RATES, type ReproRate, StatusDot,
} from "@/lib/ui";

import { changeStatus, setField, setPlatforms, type EditState } from "./actions";

type Status = {
  id: number; name: string; color: string; isClosed: boolean;
  /// ★ 전이별로 다르다. `Fixed` 라도 어디서 왔느냐에 따라 적을 것이 갈린다 (docs/13 §5).
  requireNote: boolean; noteLabel: string | null; noteHint: string | null;
  /// 이 상태로 갈 때 반영 버전을 아직 안 받았는가 (docs/13 §5 · D-50)
  needsVersion: boolean;
};
/**
 * 드롭다운 한 줄.
 *
 * ★ `id` 가 숫자만이 아니게 됐다 (FB-008). 재현율은 enum 이라 값이 **문자열**이다.
 *   컴포넌트를 하나 더 만드는 대신 값 타입만 넓혔다 — 안쪽은 어차피
 *   `useState` 로 **문자열을 들고 있었고** FormData 도 문자열로 보낸다.
 */
type Opt = { id: number | string; name: string; color?: string };
type Person = { id: number; name: string; team: { name: string; color: string } | null };

/**
 * 상태 변경.
 *
 * ★ 갈 수 있는 상태만 목록에 넣는다 (docs/13 D-01).
 *   고를 수 있게 해놓고 나중에 거부하는 것보다, 처음부터 안 보이는 게 낫다.
 *   `allowed` 는 서버가 status_transitions 를 보고 계산해서 내려준다.
 *
 * 사유가 필요한 전이나 Closed 를 고르면 바로 저장하지 않고 그 자리에서
 * 사유(종결이면 사유 코드도)를 받는다. 취소하면 원래 상태로 되돌아간다.
 *
 * ★ **Reason 5종** (docs/13 §5) — 칸 이름과 적을 내용이 전이마다 다르다.
 *   `Developer Reason` 은 원인·조치를, `QA Reason` 은 확인한 케이스를 받는다.
 *   빈 칸만 주면 "확인함" 세 글자가 들어온다 — 무엇을 적어야 하는지를 같이 띄운다.
 */
function StatusField({
  seq, statuses, current, allowed,
}: { seq: number; statuses: Status[]; current: Status; allowed: number[] }) {
  const [state, action, pending] = useActionState<EditState, FormData>(changeStatus, {});
  const [picked, setPicked] = useState<Status | null>(null); // 사유 대기 중인 선택
  const [reason, setReason] = useState<CloseReason>("QA_CONFIRMED");
  const formRef = useRef<HTMLFormElement>(null);

  // 현재 상태 + 갈 수 있는 곳. 현재 상태를 빼면 select 가 무엇을 보여줄지 알 수 없다.
  const options = statuses.filter((s) => s.id === current.id || allowed.includes(s.id));

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = options.find((s) => s.id === Number(e.target.value));
    if (!next || next.id === current.id) return;
    if (next.requireNote || next.isClosed || next.needsVersion) {
      setPicked(next);          // 사유를 받아야 하므로 아직 저장하지 않는다
      setReason("QA_CONFIRMED");
      return;
    }
    setPicked(null);
    e.currentTarget.form?.requestSubmit();
  };

  // ★ 저장이 끝나 **서버가 그 상태를 내려주면** 사유칸을 닫는다.
  //   effect 로 닫지 않는 이유는 PickField 와 같다 — 렌더 중에 정리하면 깜빡이지 않는다.
  //   이걸 안 하면 저장한 뒤에도 사유칸이 화면을 덮은 채 남아 "안 된 것" 처럼 보인다.
  if (picked && picked.id === current.id) setPicked(null);

  useEffect(() => {
    if (state.ok) toast(`상태를 ${current.name} ${directionParticle(current.name)} 바꿨습니다`);
  }, [state.ok, current.name]);

  // 사유가 필요한 조건 둘. **둘 중 하나만 걸려도 필요하다.**
  //   ① 전이 자체가 요구한다 (Reason 5종)
  //   ② 종결 사유가 요구한다 (이슈 아님 · 중복 · 보류)
  const needNote = picked
    ? picked.requireNote || (picked.isClosed && CLOSE_NEEDS_NOTE[reason])
    : false;

  return (
    <form ref={formRef} action={action} onReset={(e) => e.preventDefault()} className="pf">
      <ProjectField />
      <input type="hidden" name="seq" value={seq} />
      <select
        name="statusId"
        value={picked?.id ?? current.id}
        onChange={onChange}
        disabled={pending}
        suppressHydrationWarning
      >
        {options.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {/*
        ★★ **왼쪽으로 펼쳐지는 팝오버** (`D-103` · 2026-09-11).
          예전엔 사이드바 값 칸(`62px + 1fr`, 실폭 140px) **안에** 그렸다.
          거기에 설명문 + 사유 select + 반영 버전 + textarea + 버튼 둘을 다 넣으니
          칸마다 두 글자씩 접히고 `확인` 이 화면 밖으로 나갔다 — *"저거 너무 구리잖아"*.
          자리를 넓히는 게 아니라 **자리에서 벗어난다.** 누른 칸에 붙어 있어
          맥락은 안 끊기고, 폭은 360px 로 2.5배가 된다.
        ★ Esc·바깥 클릭은 이미 있는 `PopupClose` 가 처리한다 (`.dd` 와 같은 규칙).
      */}
      {picked && (
        <div className="notebox popover">
          {/* ★ 긴 설명 대신 **무엇이 어디로 바뀌는지**를 굵게 보여준다 (`D-103-1`).
              좁은 칸에서 설명문이 절반을 먹고 있었다. 사유 칸 라벨이 이미
              무엇을 적을지 말해 준다. */}
          <p className="stx-head">
            <b>{current.name}</b>
            <span className="stx-arrow">→</span>
            <b>{picked.name}</b>
          </p>

          {picked.isClosed ? (
            <>
              <select
                name="closeReason"
                value={reason}
                onChange={(e) => setReason(e.target.value as CloseReason)}
                suppressHydrationWarning
              >
                {CLOSE_REASONS.map((r) => (
                  <option key={r} value={r}>{CLOSE_REASON_LABEL[r]}</option>
                ))}
              </select>
              {/* 중복이면 원본을 가리켜야 한다. 코멘트에 '#2358로 해소' 라고 적던 것을 대신한다 —
                  텍스트로 적으면 틀린 번호를 아무도 못 잡는다. */}
              {reason === "DUPLICATE" && (
                <label className="dupof">
                  <span>원본 이슈 번호</span>
                  <input
                    name="dupOf" type="number" min={1} required
                    placeholder="예: 2358" autoFocus suppressHydrationWarning
                  />
                </label>
              )}
            </>
          ) : picked.requireNote ? (
            <p className="stx-why">
              <b>{picked.noteLabel ?? `${picked.name} 로 바꾸는 이유`}</b>
              {picked.noteHint && <span>{picked.noteHint}</span>}
            </p>
          ) : null}

          {/* 종결일 때도 전이에 Reason 이 걸려 있으면 그 이름을 띄운다 —
              Fixed → Closed 는 사유 코드(QA확인완료)와 QA Reason 을 둘 다 받는다 */}
          {picked.isClosed && picked.noteLabel && (
            <p className="reason-of">
              <b>{picked.noteLabel}</b>
              <span>{picked.noteHint}</span>
            </p>
          )}

          {/* 반영 버전 — "이거 배포된 거 맞나요?" 왕복을 없애는 칸.
              여기서 안 받으면 취소하고 본문 폼까지 올라갔다 와야 한다. */}
          {picked.needsVersion && (
            <label className="dupof">
              <span>어느 버전에 반영됐나요?</span>
              <input
                name="fixedVersion" required maxLength={50}
                placeholder="예: v1.2.0" autoFocus suppressHydrationWarning
              />
            </label>
          )}

          <textarea
            name="note"
            rows={picked.noteHint ? 3 : 2}
            required={needNote}
            autoFocus={!picked.isClosed && !picked.needsVersion}
            placeholder={needNote ? "" : "확인한 환경·케이스 (선택)"}
            suppressHydrationWarning
          />
          <div className="notebtns">
            <button type="button" className="btn-ghost" onClick={() => setPicked(null)}>취소</button>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "저장 중…" : "확인"}
            </button>
          </div>
        </div>
      )}

      {state.error && <p className="login-error sm">{state.error}</p>}
    </form>
  );
}

/**
 * 플랫폼 (여러 개).
 *
 * `PickField` 는 값이 하나라는 전제로 만들어져 있어 여기에 못 쓴다.
 * 체크박스를 쓰는 이유는 등록 폼과 같다 — 드롭다운이면 "하나만 고르는 것"처럼 읽힌다.
 * 체크하는 즉시 저장한다. 확인 버튼을 하나 더 누르게 하면 그만큼 느려진다 (P-3).
 */
function PlatformField({ seq, all, picked }: {
  seq: number; all: { code: string; name: string }[]; picked: string[];
}) {
  const [state, action, pending] = useActionState<EditState, FormData>(setPlatforms, {});

  // ★ 체크박스도 `PickField` 와 똑같은 병에 걸려 있었다 — `defaultChecked` 는
  //   폼이 리셋될 때 **갱신 전 값**으로 돌아간다. 여기도 우리가 들고 있는다.
  const server = picked.join(",");
  const [on, setOn] = useState<string[]>(picked);
  const [seen, setSeen] = useState(server);
  if (seen !== server) {
    setSeen(server);
    setOn(picked);
  }
  const shown = state.error ? picked : on;

  useEffect(() => {
    if (state.ok) toast("플랫폼을 바꿨습니다");
  }, [state.ok]);
  useEffect(() => {
    if (state.error) toast(state.error, "error");
  }, [state.error]);

  // 체크박스도 같은 이유로 리셋을 막는다 (PickField 의 `keepValues` 주석 참조)
  return (
    <form action={action} onReset={(e) => e.preventDefault()} className="pf platrow">
      <ProjectField />
      <input type="hidden" name="seq" value={seq} />
      {all.map((p) => (
        <label key={p.code} className="platbox sm">
          <input
            type="checkbox" name="platform" value={p.code}
            checked={shown.includes(p.code)}
            aria-busy={pending}
            onChange={(e) => {
              const next = e.target.checked
                ? [...shown, p.code]
                : shown.filter((c) => c !== p.code);
              setOn(next);
              e.currentTarget.form?.requestSubmit();
            }}
            suppressHydrationWarning
          />
          <span>{p.name}</span>
        </label>
      ))}
      {state.error && <p className="login-error sm">{state.error}</p>}
    </form>
  );
}

/**
 * 바꾸면 바로 저장된다.
 *
 * ★ **왜 제어 컴포넌트인가** (2026-08-24 피드백 1·3번)
 *   예전엔 `<select defaultValue={current}>` 였다. 고르면 저장은 **됐는데**
 *   드롭다운만 옛 값으로 되돌아갔다 — DB 는 `Stage`, 화면은 `개발(Dev)`.
 *   그래서 *"우선순위·차수·환경·시스템이 등록 후에 수정되지 않는다"* 로 보였다.
 *
 *   범인은 React 19 다. `<form action={서버액션}>` 은 제출이 끝나면 폼을
 *   **자동으로 리셋**한다(폼에 `reset` 이벤트가 실제로 찍힌다). 비제어 칸은
 *   그때 `defaultValue` 로 돌아가는데, 그 값은 **아직 갱신 전 옛 props** 다.
 *   그래서 되돌아간 뒤 새 props 가 와도 비제어 select 는 `defaultValue` 를
 *   다시 보지 않아 **영원히 옛 값**이 남는다.
 *
 *   ⚠️ 같은 화면의 상단 뱃지는 잘 바뀌고 있었다. 서버가 그리는 곳은 멀쩡한데
 *     이 칸만 틀리니 *"가끔 되는 것 같다"* 로 읽혔다. 한 화면 안에서 두 값이
 *     다르게 보이면 사람들은 **화면 전체를 못 믿는다.**
 *
 *   고친 방법: 고른 값을 우리가 들고 있다가(`value`), 서버가 새 값을 내려주면
 *   그쪽으로 맞춘다. 실패하면 서버 값으로 되돌린다 — 화면이 거짓말을 하면 안 된다.
 */
function PickField({
  seq, field, label, current, options, allowEmpty, emptyLabel, people,
}: {
  seq: number;
  field: string;
  /** 토스트에 쓸 이름. `<dt>` 와 같은 말이어야 한다 — "우선순위를 Major 로 바꿨습니다" */
  label: string;
  current: number | string | null;
  options: Opt[];
  allowEmpty?: boolean;
  /**
   * 비웠을 때 뭐라고 부를지.
   * ★ 담당자는 `미지정`, 차수는 `미분류` 다. 한 단어로 뭉치면 안 된다 —
   *   사이드바·차수 관리·명세서(D-52)가 전부 `미분류` 라고 하는데
   *   여기만 `미지정` 이라 같은 것을 두 이름으로 부르고 있었다.
   */
  emptyLabel?: string;
  people?: Person[];
}) {
  const list = people ?? options;
  const [state, action, pending] = useActionState<EditState, FormData>(setField, {});

  const asStr = (v: number | string | null) => (v == null ? "" : String(v));
  const server = asStr(current);

  const [value, setValue] = useState(server);
  // 서버가 내려준 값이 바뀌면 그쪽을 따른다.
  // ★ effect 가 아니라 **렌더 중**에 맞춘다. effect 로 하면 옛 값으로 한 번 그린 뒤
  //   바뀌어 깜빡이고, `react-hooks/set-state-in-effect` 에도 걸린다 (MobileNav 와 같은 이유).
  const [seen, setSeen] = useState(server);
  if (seen !== server) {
    setSeen(server);
    setValue(server);
  }

  // 저장이 실패했으면 **서버 값이 진실**이다. 고른 값을 그대로 두면 화면이 거짓말을 한다.
  const shown = state.error ? server : value;

  // 방금 무엇으로 바꿨는지. 저장이 끝난 **뒤에** 알려야 하므로 들고 있는다.
  const justPicked = useRef("");

  useEffect(() => {
    if (state.ok) {
      const v = justPicked.current;
      toast(`${label}${objectParticle(label)} ${v} ${directionParticle(v)} 바꿨습니다`);
    }
  }, [state.ok, label]);

  useEffect(() => {
    if (state.error) toast(state.error, "error");
  }, [state.error]);

  /**
   * ★ **폼을 리셋하지 못하게 막는다.** 이게 이 병의 진짜 치료다.
   *
   *   React 19 는 서버 액션 폼이 끝나면 `form.reset()` 을 부른다. 문제는 그게
   *   **제어 컴포넌트한테도 통한다**는 것이다 — 리셋은 DOM 의 선택을 처음 HTML 에
   *   `selected` 로 박혀 있던 값(=서버가 처음 그린 옛 값)으로 되돌린다.
   *   그런데 React 쪽 state 는 그대로라 **다시 그릴 이유가 없다.**
   *   그래서 `React 는 Major, DOM 은 Critical` 로 갈라진 채 굳는다.
   *
   *   `reset` 이벤트는 취소할 수 있다(HTML 명세). 이 폼의 칸은 우리가 들고 있으니
   *   비울 이유가 없다 — 그냥 막는다.
   *
   *   ⚠️ 값을 비워야 하는 폼(코멘트 입력 등)에는 이걸 붙이면 안 된다.
   *     거기서는 리셋이 하는 일이 맞다.
   */
  const keepValues = (e: React.FormEvent<HTMLFormElement>) => e.preventDefault();

  return (
    <form action={action} onReset={keepValues} className="pf">
      <ProjectField />
      <input type="hidden" name="seq" value={seq} />
      <input type="hidden" name="field" value={field} />
      <select
        name="value"
        value={shown}
        aria-label={label}
        aria-busy={pending}
        className={pending ? "saving" : undefined}
        onChange={(e) => {
          justPicked.current = e.target.options[e.target.selectedIndex]?.text ?? "";
          setValue(e.target.value);
          e.currentTarget.form?.requestSubmit();
        }}
        suppressHydrationWarning
      >
        {allowEmpty && <option value="">{emptyLabel ?? "미지정"}</option>}
        {/* ★ 사람은 **팀으로 묶어** 보여준다 (2026-09-11 — 후보가 전원이 되면서
            한 줄로 늘어놓으면 찾기 어려워졌다). 마스터 목록은 그대로 평평하다. */}
        {people
          ? byTeam(people).map((g) => (
              <optgroup key={g.team} label={g.team}>
                {g.people.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </optgroup>
            ))
          : list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </form>
  );
}

export function PropertyPanel({
  seq, statuses, currentStatus, allowedStatusIds, priorities, environments, systems,
  rounds, platforms, members,
  current,
}: {
  seq: number;
  statuses: Status[];
  currentStatus: Status;
  /// 현재 상태에서 갈 수 있는 상태 id 들. 서버가 status_transitions 를 보고 계산한다.
  allowedStatusIds: number[];
  priorities: Opt[];
  environments: Opt[];
  systems: Opt[];
  rounds: Opt[];
  platforms: { code: string; name: string }[];
  members: Person[];
  current: {
    priorityId: number; environmentId: number; systemId: number; assigneeId: number | null;
    roundId: number | null; platformCodes: string[];
    /** 이관한 1,704건은 아직 비어 있다 (FB-008) */
    reproRate: ReproRate | null;
  };
}) {
  const assignee = members.find((m) => m.id === current.assigneeId);

  return (
    <dl className="props editable">
      <div>
        <dt>상태</dt>
        <dd>
          <StatusDot color={currentStatus.color} />
          <StatusField seq={seq} statuses={statuses} current={currentStatus} allowed={allowedStatusIds} />
        </dd>
      </div>
      <div>
        <dt>담당자</dt>
        <dd>
          <Avatar name={assignee?.name} color={assignee?.team?.color} />
          <PickField seq={seq} field="assignee" label="담당자" current={current.assigneeId} options={[]} people={members} allowEmpty />
        </dd>
      </div>
      <div>
        <dt>우선순위</dt>
        <dd><PickField seq={seq} field="priority" label="우선순위" current={current.priorityId} options={priorities} /></dd>
      </div>
      {/* ★ 재현율 (FB-008). 등록 폼과 **같은 자리**(우선순위 옆)에 둔다 —
          같은 값을 화면마다 다른 곳에서 찾게 하면 그때부터 안 고친다. */}
      <div>
        <dt>재현율</dt>
        <dd>
          <PickField
            seq={seq} field="repro" label="재현율" current={current.reproRate}
            options={REPRO_RATES.map((r) => ({ id: r, name: REPRO_RATE_LABEL[r] }))}
            /* ★ `— 안 적힘` 은 **아직 안 적은 이슈에서만** 보인다.
               한 번 고르고 나면 사라진다 — 적은 값을 다시 지우는 건 되돌리기가 아니라
               정보를 없애는 일이다. 잘못 골랐으면 다른 값으로 바꾸면 된다.
               서버도 같은 말을 한다 (`setField` 의 `nullable: false`). */
            allowEmpty={current.reproRate === null}
            emptyLabel="— 안 적힘"
          />
        </dd>
      </div>
      <div>
        <dt>차수</dt>
        <dd>
          <PickField
            seq={seq} field="round" label="차수" current={current.roundId} options={rounds}
            allowEmpty emptyLabel="미분류"
          />
        </dd>
      </div>
      <div>
        <dt>플랫폼</dt>
        <dd><PlatformField seq={seq} all={platforms} picked={current.platformCodes} /></dd>
      </div>
      <div>
        <dt>환경</dt>
        <dd><PickField seq={seq} field="environment" label="환경" current={current.environmentId} options={environments} /></dd>
      </div>
      <div>
        <dt>시스템</dt>
        <dd><PickField seq={seq} field="system" label="시스템" current={current.systemId} options={systems} /></dd>
      </div>
    </dl>
  );
}
