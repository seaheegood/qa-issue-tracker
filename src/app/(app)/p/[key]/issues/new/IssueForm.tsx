"use client";

import Link from "next/link";
import { ProjectField } from "@/components/ProjectField";
import { useActionState, useEffect, useRef } from "react";

import { FilePicker } from "@/components/FilePicker";
import { TcPaste } from "@/components/TcPaste";
import { byTeam, REPRO_RATE_LABEL, REPRO_RATES } from "@/lib/ui";

import { createIssue, type NewIssueState } from "./actions";

type Opt = { code: string; name: string; color?: string };
type Member = { id: number; name: string; team: { name: string; color: string } | null };

export function IssueForm({
  priorities,
  environments,
  systems,
  rounds,
  platforms,
  members,
  screens,
  defaults,
  reporterName,
  projectKey,
}: {
  projectKey: string;
  priorities: Opt[];
  environments: Opt[];
  systems: Opt[];
  rounds: Opt[];
  platforms: Opt[];
  members: Member[];
  screens: string[];
  defaults: {
    priority: string; environment: string; system: string; screen: string | null;
    round: string; foundVersion: string; platforms: string[];
    /** ★ 템플릿이 채우는 긴 글 둘. 직전값 채움에는 없던 것이다 */
    testPath: string; expected: string;
  };
  reporterName: string;
}) {
  const [state, action, pending] = useActionState<NewIssueState, FormData>(createIssue, {});

  /**
   * 화면에 채워 넣을 값.
   *
   * 서버가 오류와 함께 **적었던 값을 돌려주면** 그걸 쓰고, 아니면 직전값 기본 채움(N-02)을 쓴다.
   * React 19 는 `<form action={서버액션}>
      <ProjectField />` 이 끝나면 폼을 비우기 때문에,
   * 이게 없으면 필수값에 걸릴 때마다 길게 적은 재현 경로를 다시 쳐야 한다.
   */
  const v = state.values;
  const init = {
    title: v?.title ?? "",
    content: v?.content ?? "",
    testPath: v?.testPath ?? defaults.testPath,
    expected: v?.expected ?? defaults.expected,
    foundVersion: v?.foundVersion ?? defaults.foundVersion,
    screen: v?.screen ?? defaults.screen ?? "",
    externalRef: v?.externalRef ?? "",
    repro: v?.repro ?? "",
    round: v?.round || defaults.round,
    priority: v?.priority || defaults.priority,
    environment: v?.environment || defaults.environment,
    system: v?.system || defaults.system,
    assignee: v?.assignee ?? "",
    platforms: v?.platforms ?? defaults.platforms,
  };

  // 오류가 올 때마다 값을 다시 심어야 하므로 폼을 새로 마운트한다.
  const formKey = state.error ? `e${state.error}` : "new";
  const formRef = useRef<HTMLFormElement>(null);
  const pathRef = useRef<HTMLTextAreaElement>(null);
  const expectedRef = useRef<HTMLTextAreaElement>(null);

  // ⌘Enter / Ctrl+Enter 로 등록. 엑셀은 Enter 한 번이면 다음 줄로 넘어간다 —
  // 마우스로 버튼을 찾아 누르게 하면 그만큼 느려진다 (P-3).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form key={formKey} ref={formRef} action={action} className="newissue">
      <ProjectField />

      {/* ★ **맨 위가 제목이다** (2026-09-16 · N-01 개정).
          목록·알림·엑셀·관련 이슈가 전부 이 한 줄로 이슈를 부른다. 그전에는
          `이슈 내용` 이 그 노릇을 해서, 본문이 길면 목록에서 줄이 잘려
          무슨 이슈인지 알 수 없었다.
          `<input>` 인 이유 — 여러 줄을 허용하면 그 순간 제목이 아니라 본문이 된다. */}
      <label className="field">
        <span>이슈타이틀 <b className="req">필수</b></span>
        <input
          name="title" type="text" required maxLength={200}
          defaultValue={init.title}
          placeholder="한 줄로 — 목록에서 이 이슈를 부르는 이름입니다"
          suppressHydrationWarning
        />
      </label>

      <div className="ni-grid">
        <label className="field">
          <span>차수 <b className="req">필수</b></span>
          <select name="round" defaultValue={init.round} suppressHydrationWarning>
            {rounds.map((r) => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>우선순위 <b className="req">필수</b></span>
          <select name="priority" defaultValue={init.priority} suppressHydrationWarning>
            {priorities.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
        </label>

        {/* ★ 재현율 — 우선순위 **바로 옆**이다 (FB-008).
            둘 다 "이걸 얼마나 급하게 봐야 하나" 를 정하는 값이라 같이 읽혀야 한다.
            개발이 재현을 못 해서 되돌아오는 왕복이 여기서 줄어든다. */}
        <label className="field">
          <span>재현율 <b className="req">필수</b></span>
          <select name="repro" required defaultValue={init.repro} suppressHydrationWarning>
            {/* 기본값을 두지 않는다. `항상` 이 미리 골라져 있으면 **안 고르고 넘긴 것**과
                **정말 항상 재현되는 것**이 같은 값이 되어 이 칸으로 아무것도 못 거른다 (U-05). */}
            <option value="">— 고르세요</option>
            {REPRO_RATES.map((r) => (
              <option key={r} value={r}>{REPRO_RATE_LABEL[r]}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>환경</span>
          <select name="environment" defaultValue={init.environment} suppressHydrationWarning>
            {environments.map((e) => (
              <option key={e.code} value={e.code}>{e.name}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>시스템 <b className="req">필수</b></span>
          {/* ★ 제어 컴포넌트로 만들지 **않는다.** `defaultValue` 를 그대로 두고
              값만 엿본다 — React 19 의 폼 자동 리셋에 물리는 걸 피하려는 것이다 (C-24 · FB-003). */}
          <select name="system" defaultValue={init.system} suppressHydrationWarning>
            {systems.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>담당자 <em>선택</em></span>
          <select name="assignee" defaultValue={init.assignee} suppressHydrationWarning>
            <option value="">미지정</option>
            {/* ★ 팀으로 묶는다 — 후보가 **활성 사용자 전원**이 됐다 (2026-09-11) */}
            {byTeam(members).map((g) => (
              <optgroup key={g.team} label={g.team}>
                {g.people.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="field">
          <span>검출 버전 <b className="req">필수</b></span>
          <input
            name="foundVersion"
            required
            defaultValue={init.foundVersion}
            placeholder="예: v0.7"
            autoComplete="off"
            maxLength={50}
            suppressHydrationWarning
          />
        </label>
      </div>

      {/*
        플랫폼은 여러 개를 고를 수 있다.
        같은 현상이 PC·MO 양쪽에서 나면 이슈를 쪼개지 말고 둘 다 체크한다 —
        한 건으로 관리하면서 "모바일만" 필터도 그대로 된다.
      */}
      <fieldset className="field platset">
        <legend>플랫폼 <b className="req">최소 1개</b> <em>재현된 것만</em></legend>
        <div className="platrow">
          {platforms.map((pf) => (
            <label key={pf.code} className="platbox">
              <input
                type="checkbox"
                name="platform"
                value={pf.code}
                defaultChecked={init.platforms.includes(pf.code)}
                suppressHydrationWarning
              />
              <span>{pf.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>
          이슈 발생 화면
          <em>이미 쓰인 이름이 있으면 골라 주세요 — 표기가 갈리면 나중에 묶을 수 없습니다</em>
        </span>
        <input
          name="screen"
          list="screen-options"
          defaultValue={init.screen}
          placeholder="예: 상품 목록"
          autoComplete="off"
          suppressHydrationWarning
        />
        <datalist id="screen-options">
          {screens.map((s) => <option key={s} value={s} />)}
        </datalist>
      </label>

      <div className="field">
        <span>
          TC 붙여넣기 <em>테스트 경로와 기대값이 자동으로 채워집니다</em>
        </span>
        <TcPaste pathRef={pathRef} expectedRef={expectedRef} />
      </div>

      <label className="field">
        <span>테스트 경로 <b className="req">필수</b></span>
        <textarea ref={pathRef} name="testPath" rows={4} required defaultValue={init.testPath} placeholder="메뉴 진입 경로부터 — 개발이 그대로 따라할 수 있게" suppressHydrationWarning />
      </label>

      <label className="field">
        <span>이슈 내용 <b className="req">필수</b></span>
        <textarea
          name="content"
          defaultValue={init.content}
          rows={4}
          required
          autoFocus
          placeholder="무엇이 잘못됐는지"
          suppressHydrationWarning
        />
      </label>

      <label className="field">
        <span>테스트 기대값 <b className="req">필수</b></span>
        <textarea ref={expectedRef} name="expected" rows={3} required defaultValue={init.expected} placeholder="원래 어떻게 동작해야 하는지" suppressHydrationWarning />
      </label>

      <label className="field ni-half">
        <span>QAI # <em>선택</em></span>
        <input name="externalRef" defaultValue={init.externalRef} placeholder="#2735" autoComplete="off" suppressHydrationWarning />
      </label>

      <div className="field">
        <span>
          첨부 <em>스크린샷 하나가 설명 열 줄보다 낫습니다</em>
        </span>
        <FilePicker scopeRef={formRef} primary />
      </div>

      {state.error && <p className="login-error">{state.error}</p>}

      <div className="ni-foot">
        <p className="ni-auto">
          작성자 <b>{reporterName}</b> · 발생일 <b>오늘</b> · 상태 <b>Open</b>
          <br />
          <span>이 셋은 자동으로 기록됩니다. 입력할 필요가 없습니다.</span>
        </p>
        <div className="ni-btns">
          <Link href={`/p/${projectKey}/issues`} className="btn-ghost">취소</Link>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "등록 중…" : "등록"}
            <kbd>⌘↵</kbd>
          </button>
        </div>
      </div>
    </form>
  );
}
