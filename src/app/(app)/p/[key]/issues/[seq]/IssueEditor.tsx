"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { autosize } from "@/lib/autosize";
import { ProjectField } from "@/components/ProjectField";
import { toast } from "@/components/Toast";

import { updateIssueText, type EditState } from "./actions";

type Issue = {
  seq: number;
  /** ★ 한 줄 제목. 목록이 보여주는 건 이것뿐이다 (2026-09-16 신설) */
  title: string;
  content: string | null;
  testPath: string | null;
  expected: string | null;
  legacyScreenName: string | null;
  externalRef: string | null;
  foundVersion: string | null;
  fixedVersion: string | null;
};

/**
 * 긴 글 편집.
 *
 * 드롭다운과 달리 저장 버튼을 둔다. 쓰다 만 문장이 저장되면 안 되고,
 * 이력에도 중간 과정이 다 남으면 읽을 수 없게 된다.
 *
 * ── 2026-08-24 피드백 2·4번으로 다시 짬 ──────────────────────────
 * *"수정 버튼 누르면 버튼 위치가 갑자기 이상하게 바뀌질 않나, 이미 수정화면에 있는
 *   테스트 경로랑 테스트기대값은 밑에 왜뜨는거야"*
 *
 * 재현해서 재보니 버튼이 **(908, 136) → (244, 176)** 으로 뛰었다. 제목과 한 줄에
 * 놓여 있었는데, 열리면 그 줄 안에서 폼이 부풀어 **줄이 접히면서** 버튼이 아래로
 * 내려간 것이다. 누른 것이 어디로 갔는지 눈으로 쫓을 수 없다.
 *   → 버튼을 제목 줄에서 **떼어내 오른쪽 위에 고정**했다. 열고 닫아도 안 움직인다.
 *
 * 그리고 폼이 열리면 아래에 **읽기용 테스트 경로·기대값이 그대로 남아** 같은 내용이
 * 두 벌 보였다. 어느 쪽이 진짜인지 알 수 없다.
 *   → 여는 순간 읽기 영역(`.dread`)을 숨긴다. **읽던 자리에서 그대로 고친다.**
 *     `details[open]` 을 CSS 로 보고 숨기므로 자바스크립트가 없어도 똑같이 동작한다.
 *
 * ── 왜 `<details>` 인가 ──────────────────────────────────────────
 * `useState` 로 감추면 자바스크립트가 없을 때 폼 자체가 DOM 에 없어서 편집할 수 없다.
 * 접는 건 브라우저 기본 기능으로 충분하다. (docs/09 — 답글에서 같은 함정)
 */
export function IssueEditor(
  { issue, screens }:
  { issue: Issue; screens: string[] },
) {
  const [state, action, pending] = useActionState<EditState, FormData>(updateIssueText, {});
  const box = useRef<HTMLDetailsElement>(null);

  /**
   * ★ 칸을 **제어 컴포넌트**로 둔다 (PropertyPanel 의 드롭다운과 같은 이유).
   *   React 19 는 서버 액션 폼이 끝나면 폼을 자동으로 리셋한다. `defaultValue` 로 두면
   *   저장한 **뒤에 다시 열었을 때 옛 글**이 들어있다 — 그 상태로 저장하면 방금 쓴 게 날아간다.
   *   서버가 새 값을 내려주면 렌더 중에 그쪽으로 맞춘다.
   */
  const server = {
    title: issue.title,
    content: issue.content ?? "",
    testPath: issue.testPath ?? "",
    expected: issue.expected ?? "",
    screen: issue.legacyScreenName ?? "",
    externalRef: issue.externalRef ?? "",
    foundVersion: issue.foundVersion ?? "",
    fixedVersion: issue.fixedVersion ?? "",
  };
  const stamp = JSON.stringify(server);
  const [form, setForm] = useState(server);
  const [seen, setSeen] = useState(stamp);
  if (seen !== stamp) {
    setSeen(stamp);
    setForm(server);
  }
  // 드롭다운(기능)도 같은 헬퍼를 쓴다. 셋 다 `value` 만 읽으면 되므로 타입만 넓힌다.
  const set = (k: keyof typeof server) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  /**
   * ★ 긴 글 칸을 **글 길이에 맞춰** 연다 (2026-08-25 피드백).
   *
   * `rows` 는 글과 아무 상관이 없는 고정값이라, 한 줄짜리 글에도 네 줄 칸이 열리고
   * 셋의 높이가 제각각이었다. 바닥(두 줄)은 CSS 가 잡고, 그보다 긴 글은 여기서 키운다.
   *
   * ★ 재는 시점은 마운트가 아니라 **열리는 순간**(`onToggle`) 이다.
   *   크로뮴은 닫힌 `<details>` 안도 재어 주지만(직접 확인: 닫힌 채로 `scrollHeight` 1302),
   *   그건 찾아보기(find-in-page) 때문에 살려둔 것이라 브라우저마다 다르다 —
   *   `display: none` 으로 감추는 쪽에서는 0 이 나온다. **열린 뒤에 재면 어디서나 맞다.**
   */
  const boxes = useRef<(HTMLTextAreaElement | null)[]>([]);

  // 구현은 `src/lib/autosize.ts` 한 곳에 있다 — 코멘트 입력란과 같은 규칙으로 자란다 (D-95)
  const fit = (el: HTMLTextAreaElement | null, keep = false) => autosize(el, { keep });

  const fitAll = () => { for (const el of boxes.current) fit(el); };

  /**
   * ⚠️ `toggle` 은 **거품처럼 올라오지 않는(non-bubbling)** 이벤트다.
   *   리액트는 대부분의 이벤트를 뿌리에 한 번만 달고 올라오는 걸 받아서 처리하는데,
   *   올라오지 않는 이벤트는 그 방식으로 못 받는다. `onToggle` 이 리액트 버전에 따라
   *   붙기도 하고 안 붙기도 하는 이유다. **안 붙으면 이 기능 전체가 조용히 죽는다** —
   *   오류도 안 나고 칸만 안 늘어난다.
   *   → 리액트에 맡기지 말고 **요소에 직접 단다.** 어느 버전에서나 확실하다.
   */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onToggle = () => { if (el.open) fitAll(); };
    el.addEventListener("toggle", onToggle);
    if (el.open) fitAll();   // 이미 열린 채로 그려졌을 때 (되돌아오기 등)
    return () => el.removeEventListener("toggle", onToggle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 저장 뒤 서버가 새 글을 내려주면 칸도 다시 맞춘다 (열려 있을 때만 잴 수 있다)
  useEffect(() => {
    if (box.current?.open) fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);

  // 저장되면 **닫고 알린다.** 닫히면서 바뀐 글이 읽기 화면에 그대로 보이는 것이
  //  가장 확실한 "됐다" 다. 토스트는 그걸 말로 한 번 더 확인해 준다.
  useEffect(() => {
    if (state.ok) {
      if (box.current) box.current.open = false;
      toast("저장했습니다");
    }
  }, [state.ok]);

  useEffect(() => {
    if (state.error) toast(state.error, "error");
  }, [state.error]);

  return (
    <details className="edit-wrap" ref={box}>
      <summary className="btn-ghost edit-btn">
        <span className="e-lbl e-open">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
          수정
        </span>
        {/* 열려 있을 때는 같은 자리에서 **닫는 버튼**이 된다.
            열어놓고 "수정" 이라고 적혀 있으면 한 번 더 눌러야 하는 줄 안다. */}
        <span className="e-lbl e-close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
          닫기
        </span>
      </summary>

      {/* onReset — 칸을 우리가 들고 있으므로 React 19 의 자동 리셋을 막는다.
          막지 않으면 저장 직후 DOM 만 옛 글로 되돌아가고 React 는 그걸 모른다
          (PropertyPanel 의 `keepValues` 주석에 자세히). */}
      <form action={action} onReset={(e) => e.preventDefault()} className="issue-edit">
      <ProjectField />
      <input type="hidden" name="seq" value={issue.seq} />

      {/* ★ 제목이 맨 위다. 목록·알림·엑셀이 전부 이 한 줄로 이슈를 부른다 (2026-09-16).
          `<input>` 이다 — 여러 줄을 쓰면 그게 곧 제목이 아니라 본문이 된다 */}
      <label className="field">
        <span>이슈타이틀 <b className="req">필수</b></span>
        <input
          name="title" type="text" value={form.title} required maxLength={200}
          onChange={set("title")}
          suppressHydrationWarning
        />
      </label>

      {/* rows 는 셋 다 2 로 통일한다 (CSS 의 min-height 와 같은 값) — 자바스크립트가
          늦게 붙거나 안 붙어도 최소한 **셋의 크기가 같다.** 키우는 건 `fit` 이 한다 */}
      <label className="field">
        <span>이슈 내용</span>
        <textarea
          name="content" rows={2} value={form.content}
          ref={(el) => { boxes.current[0] = el; }}
          onChange={(e) => { set("content")(e); fit(e.target, true); }}
          suppressHydrationWarning
        />
      </label>

      <label className="field">
        <span>테스트 경로</span>
        <textarea
          name="testPath" rows={2} value={form.testPath}
          ref={(el) => { boxes.current[1] = el; }}
          onChange={(e) => { set("testPath")(e); fit(e.target, true); }}
          suppressHydrationWarning
        />
      </label>

      <label className="field">
        <span>테스트 기대값</span>
        <textarea
          name="expected" rows={2} value={form.expected}
          ref={(el) => { boxes.current[2] = el; }}
          onChange={(e) => { set("expected")(e); fit(e.target, true); }}
          suppressHydrationWarning
        />
      </label>

      <div className="ie-row">
        <label className="field">
          <span>이슈 발생 화면</span>
          <input
            name="screen"
            list="edit-screen-options"
            value={form.screen}
            onChange={set("screen")}
            autoComplete="off"
            suppressHydrationWarning
          />
          <datalist id="edit-screen-options">
            {screens.map((s) => <option key={s} value={s} />)}
          </datalist>
        </label>
        <label className="field">
          <span>QAI #</span>
          <input name="externalRef" value={form.externalRef} onChange={set("externalRef")} autoComplete="off" suppressHydrationWarning />
        </label>
      </div>

      {/* even — 같은 종류(버전)라 폭을 반씩 나눈다. 위 줄의 QAI # 는 짧아서 그대로 둔다 */}
      <div className="ie-row even">
        <label className="field">
          <span>검출 버전</span>
          <input name="foundVersion" value={form.foundVersion} onChange={set("foundVersion")}
                 placeholder="예: v0.7" maxLength={50} autoComplete="off" suppressHydrationWarning />
        </label>
        <label className="field">
          <span>반영 버전 <em>수정배포완료로 바꿀 때 받습니다</em></span>
          <input name="fixedVersion" value={form.fixedVersion} onChange={set("fixedVersion")}
                 placeholder="예: v0.8 · PR #2431" maxLength={50} autoComplete="off" suppressHydrationWarning />
        </label>
      </div>

      {state.error && <p className="login-error">{state.error}</p>}

      <div className="ie-foot">
        <span className="ni-auto">
          <span>
            우선순위·차수·환경·시스템·담당자는 <b>오른쪽 칸</b>에서 고르는 즉시 저장됩니다.
            여기 있는 칸은 저장을 눌러야 반영됩니다.
          </span>
          <span>바꾼 항목이 변경 이력에 남습니다. 긴 글은 &ldquo;수정함&rdquo;만 기록됩니다.</span>
        </span>
        <div className="ni-btns">
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
      </form>
    </details>
  );
}
