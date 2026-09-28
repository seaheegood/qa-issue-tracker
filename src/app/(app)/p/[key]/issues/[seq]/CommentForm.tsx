"use client";

import { useActionState, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

/** 바뀔 일이 없는 구독 — `live` 는 "서버냐 브라우저냐" 한 번만 답하면 된다 */
const NEVER = () => () => {};

/** 목록이 떠 있을 때 `scan()` 을 태우면 안 되는 키 (고른 자리가 되돌아간다) */
const NAV = new Set(["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"]);

import { autosize } from "@/lib/autosize";
import { scanMentions } from "@/lib/mention";
import { markMentions } from "@/lib/MentionText";
import { Avatar } from "@/lib/ui";
import { ProjectField } from "@/components/ProjectField";

import { FilePicker } from "@/components/FilePicker";

import { addComment, type CommentState } from "./actions";

/**
 * 새 코멘트 작성. 작성자와 시각은 서버가 자동으로 넣는다.
 *
 * ★ **멘션** — `@` 를 치면 이름 후보가 뜬다 (요구사항서 05).
 *   `@아이디` 가 아니라 `@이름` 을 넣는다. 읽는 사람이 코멘트를 그대로 읽어야 한다.
 *   이름을 불린 사람은 구독 여부와 무관하게 알림을 받고, 그 이슈를 지켜보게 된다.
 */

/**
 * `@` 멘션 — **코멘트와 답글이 같은 것을 쓴다** (`D-98-2` · 2026-09-11).
 *
 * ⚠️ 예전엔 이 로직이 **본문 폼 안에만** 있었다. 그래서 답글에서는 `@` 를 쳐도
 *   아무 일도 안 일어났다 — *"답글 시 멘션 동작 안됨"* (파일럿 제보 3-②·4번).
 *   같은 일을 하는 코드를 두 곳에 두면 **한쪽만 고쳐지고 끝난다.**
 */
export function useMentions(
  people: string[],
  opts: {
    /** Enter 로 제출할 폼 (`D-96`). 없으면 제출하지 않는다 */
    form?: React.RefObject<HTMLFormElement | null>;
    /** 목록이 **안 떠 있을 때**의 Esc — 인라인 수정의 '취소' */
    onEscape?: () => void;
  } = {},
) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const pop = useRef<HTMLUListElement>(null);
  const uid = useId();
  // 지금 @ 뒤에 치고 있는 글자. null 이면 후보를 띄우지 않는다.
  const [query, setQuery] = useState<string | null>(null);
  // 방향키로 고른 자리 (`N-68`). **입력값이 아니라 목록의 상태**라 여기 둔다 —
  // textarea 는 비제어로 남는다.
  const [sel, setSel] = useState(0);
  /**
   * 지금 입력칸에 있는 글. **요약 줄이 쓴다** (`N-72`).
   *
   * ⚠️ textarea 는 **비제어로 남는다** — `value` 를 주면 등록 후 비우는 방식
   *   (`key={state.ok}` 리마운트)이 깨진다. 여기서는 *읽기만* 한다.
   *   값이 바뀌는 길이 넷이라 **ref 콜백**까지 써서 전부 덮는다:
   *   타이핑(`onInput`) · `pick()` 직접 쓰기 · 리마운트(등록 후) · `defaultValue`(수정 폼).
   */
  const [text, setText] = useState("");
  // 마지막으로 연 질의. `scan()` 이 같은 글자에 대해 선택을 되돌리지 않게 붙든다.
  const qRef = useRef<string | null>(null);

  /** 거울 — 입력칸과 **같은 상자에 같은 글**을 그려 `@이름` 만 칠한다 (`N-73`). */
  const mir = useRef<HTMLDivElement>(null);
  /**
   * ★ **하이드레이션이 끝난 뒤에만 켠다** (`D-106`).
   *
   * ⚠️ 서버 HTML 에 `.live` 를 넣으면, 자바스크립트가 꺼진 브라우저에서
   *   **글자가 투명한 채로 남는다** — 입력칸이 통째로 안 보인다.
   *   `D-96-4`(*"JS 없어도 등록 버튼은 그대로"*)가 지키던 자리가 여기다.
   *   꺼져 있으면 거울을 아예 그리지 않고 입력칸이 제 글자를 그린다.
   *
   * ★ `useState` + `useEffect` 가 아니라 **`useSyncExternalStore`** 다
   *   (`IssueNav` 와 같은 방식). 서버 스냅샷은 `false`, 클라이언트는 `true` —
   *   *"서버와 다른 값을 그린다"* 를 React 에 **정식으로 말하는** 훅이다.
   *   효과에서 `setState` 하면 한 번 더 그리고, 린트도 그걸 막는다.
   */
  const live = useSyncExternalStore(NEVER, () => true, () => false);

  /**
   * 커서 **바로 앞**의 `@글자` 를 찾는다.
   *
   * ★ 본문 아무 데나 있는 `@` 를 잡으면 안 된다. 지금 치고 있는 자리만이다.
   *   메일 주소(`a@b.com`)에 걸리지 않게 `@` 앞이 공백이거나 줄 처음일 때만 연다.
   *
   * ⚠️ **글자가 그대로면 고른 자리도 그대로 둔다.** `onKeyUp` 이 **모든 키업**에서
   *   이걸 부르기 때문에, 무심코 `setSel(0)` 하면 ↓ 로 고른 직후 키업이 0으로
   *   되돌린다 — **방향키가 먹통인데 원인은 다른 핸들러에 있는** 종류의 버그다.
   */
  const scan = (el: HTMLTextAreaElement) => {
    const upto = el.value.slice(0, el.selectionStart);
    const m = /(^|[\s(])@([^\s@]{0,20})$/.exec(upto);
    const next = m ? m[2] : null;
    if (next === qRef.current) return;
    qRef.current = next;
    setQuery(next);
    setSel(0);
  };

  /** 목록을 닫고 **다음 `scan()` 이 다시 열 수 있게** 한다 (고르기·포커스 이탈). */
  const close = () => { qRef.current = null; setQuery(null); setSel(0); };

  /**
   * ★ **Esc 로 접는다 — 다시 열리지 않게.**
   *
   * ⚠️ `close()` 를 쓰면 안 된다. 커서 앞에 `@` 가 **그대로 남아 있어서**
   *   바로 뒤따라오는 `keyup` 의 `scan()` 이 **같은 자리에서 다시 연다.**
   *   (실제로 그렇게 만들었더니 Esc 가 아무 일도 안 하는 것처럼 보였다)
   *   그래서 `qRef` 는 **접은 질의를 그대로 붙들고** 있는다 — `scan()` 이
   *   *"글자가 그대로면 아무것도 안 한다"* 로 걸러 준다. 한 글자라도 더 치면 다시 열린다.
   */
  const dismiss = () => { setQuery(null); setSel(0); };

  /**
   * ★ **여섯 명으로 자르지 않는다** (`D-98`). 예전엔 `.slice(0, 6)` 이었다 —
   *   후보가 전체 사용자(14명)로 늘어난 순간 나머지를 **볼 방법이 없어졌다.**
   *
   * ★ **앞글자가 맞는 사람을 먼저** 둔다 (`N-68`). 방향키의 기본값이 맨 위라
   *   첫 칸이 정답이어야 Enter 한 번으로 끝난다 — `@사` 를 쳤는데 `사용자A` 가
   *   세 번째면 방향키가 있으나 마나다.
   */
  const hits = query === null ? [] :
    people.filter((n) => n.includes(query))
          .sort((a, b) => Number(b.startsWith(query)) - Number(a.startsWith(query)));
  const open = hits.length > 0;
  // 사람이 줄어들면 인덱스가 범위를 넘는다. 파생값이라 여기서 좁힌다.
  const cur = Math.min(sel, Math.max(0, hits.length - 1));

  /**
   * ★ **열리면 남은 공간에 맞춰 줄이고 화면 안으로 끌어온다** (`D-98-1`).
   *   목록은 입력칸 **아래로** 연다(위로 띄우면 *"누가 쓰는지"* 를 가린다).
   *   그런데 코멘트 칸은 대체로 화면 아래쪽이라 그냥 두면 **화면 밖으로 흐른다.**
   *
   * ⚠️ deps 가 `[hits.length]` 였다 — **후보 수가 같은 채로 내용만 바뀌면 재측정을 안 했다.**
   */
  useEffect(() => {
    const el = pop.current;
    if (!hits.length || !el) return;
    el.style.maxHeight = "";
    const room = window.innerHeight - el.getBoundingClientRect().top - 12;
    el.style.maxHeight = `${Math.max(96, Math.min(el.scrollHeight, room))}px`;
    el.scrollIntoView({ block: "nearest" });
  }, [query, hits.length]);

  /**
   * 고른 항목이 목록 밖으로 나가면 **목록만** 굴린다 (`N-68`).
   *
   * ⚠️ `scrollIntoView` 를 쓰지 않는다. `block:"nearest"` 라도 **문서까지 굴려서**
   *   방금 화면 안으로 끌어온 팝업이 튄다 (`D-98-1` 을 되돌린다).
   */
  useEffect(() => {
    const ul = pop.current;
    const li = ul?.children[cur] as HTMLElement | undefined;
    if (!ul || !li) return;
    if (li.offsetTop < ul.scrollTop) ul.scrollTop = li.offsetTop;
    else if (li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight)
      ul.scrollTop = li.offsetTop + li.offsetHeight - ul.clientHeight;
  }, [cur, query]);

  /** 고른 이름을 `@` 자리에 끼워 넣는다. */
  const pick = (name: string) => {
    const el = ta.current;
    if (!el) return;
    const cut = el.selectionStart;
    const before = el.value.slice(0, cut).replace(/@[^\s@]{0,20}$/, `@${name} `);
    el.value = before + el.value.slice(cut);
    close();
    setText(el.value);
    // ⚠️ 값을 **직접** 썼으므로 `onInput` 이 안 난다 — 높이를 여기서 다시 잰다 (`D-95-1`)
    autosize(el, { keep: true });
    el.focus();
    el.setSelectionRange(before.length, before.length);
  };

  /**
   * ★★ **키 처리는 여기 한 곳이다** (`D-105`).
   *
   * ⚠️ 예전엔 세 폼이 각자 `onKeyDown` 을 정의했고, `{...bind}` **뒤에** 쓰여서
   *   훅이 키를 다룰 방법 자체가 없었다. 그래서 `D-96-2`(*"목록이 떠 있으면 Enter 는
   *   사람을 고르는 키"*)가 **문서에만 있고 코드에는 없었다** — 실제로는 줄바꿈이 들어갔고,
   *   확정하는 유일한 방법이 마우스 클릭이었다.
   *
   * **순서: 조합 → 멘션 → 폼(Esc) → 제출.** 위에서 아래로 읽으면 그대로다.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ① 한글 조합 중에는 **아무것도 하지 않는다** (`D-96-1`).
    //    조합 중의 방향키·Enter 는 IME 의 것이다. 이 줄이 맨 위여야 한다.
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;

    // ② 목록이 떠 있으면 **목록의 키다** (`D-96-2` · `N-68` · `N-69`)
    if (open) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((v) => (v + 1) % hits.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSel((v) => (v - 1 + hits.length) % hits.length); return; }
      // ⌘/Ctrl+Enter 는 '무조건 등록' 으로 배운 사람이 있다 — ④ 로 흘려보낸다
      if (e.key === "Enter" && !e.shiftKey && !(e.metaKey || e.ctrlKey)) {
        e.preventDefault(); pick(hits[cur]); return;
      }
      if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); pick(hits[cur]); return; }
      // ★ Esc 는 **목록만** 닫는다 (`N-70`). 여기서 멈추지 않으면 인라인 수정 폼이
      //   같이 닫혀 **쓰던 글이 날아간다.**
      if (e.key === "Escape") { e.preventDefault(); dismiss(); return; }
    }

    // ③ 목록이 없을 때의 Esc 는 폼의 몫 (인라인 수정 취소)
    if (e.key === "Escape") {
      if (!opts.onEscape) return;
      e.preventDefault(); opts.onEscape(); return;
    }

    // ④ 제출 (`D-96`)
    submitOnEnter(e, opts.form?.current ?? null);
  };

  /** textarea 에 그대로 펼쳐 넣는 이벤트들. */
  const bind = {
    // 거울은 **입력칸 뒤가 아니라 위**에 깔린다 — 아래 `mirror` 주석 참고
    className: live ? "live" : undefined,
    // ★ 조합이 **끝나는** 순간의 값은 `onInput` 보다 늦게 오는 브라우저가 있다.
    //   여기서 한 번 더 읽는다. ⚠️ 조합 **중**에는 아무것도 끄지 않는다 —
    //   한글은 글자마다 조합이 시작·종료돼서, 끄고 켜면 **매 글자 깜빡인다** (`N-74`).
    onCompositionEnd: (e: React.CompositionEvent<HTMLTextAreaElement>) => {
      setText(e.currentTarget.value);
    },
    // 입력칸이 굴러가면 거울도 같이 굴러야 한다 (사용자가 칸을 줄였을 때)
    onScroll: (e: React.UIEvent<HTMLTextAreaElement>) => {
      const m = mir.current;
      if (m) m.scrollTop = e.currentTarget.scrollTop;
    },
    // ★ ref 를 콜백으로 둔다. 리마운트로 입력칸이 새로 생기는 그 순간을 잡아
    //   '등록 후 비우기' 와 '수정 폼의 defaultValue' 를 **둘 다** 덮는다.
    ref: (el: HTMLTextAreaElement | null) => { ta.current = el; setText(el?.value ?? ""); },
    onInput: (e: React.FormEvent<HTMLTextAreaElement>) => {
      scan(e.currentTarget);
      setText(e.currentTarget.value);
      autosize(e.currentTarget, { keep: true });
    },
    onClick: (e: React.MouseEvent<HTMLTextAreaElement>) => scan(e.currentTarget),
    onKeyDown,
    onKeyUp: (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // ⚠️ 목록을 움직이는 키는 `scan()` 을 태우지 않는다 — 고른 자리가 되돌아간다
      if (open && NAV.has(e.key)) return;
      scan(e.currentTarget);
    },
    onBlur: () => setTimeout(close, 150),
    "aria-expanded": open,
    "aria-autocomplete": "list" as const,
    "aria-controls": open ? `${uid}-pop` : undefined,
    "aria-activedescendant": open ? `${uid}-o${cur}` : undefined,
  };

  /** 후보 목록. 없으면 아무것도 안 그린다. */
  const list = open && (
    <ul className="mention-pop" ref={pop} role="listbox" id={`${uid}-pop`}>
      {hits.map((n, i) => (
        // ★ 마우스로 가리킨 것과 키보드로 고른 것이 **같아야** 한다 —
        //   하이라이트가 둘이면 *"지금 Enter 를 누르면 누가 들어오나"* 를 화면이 둘로 말한다
        <li key={n} id={`${uid}-o${i}`} role="option" aria-selected={i === cur}
            onMouseEnter={() => setSel(i)}>
          {/* onMouseDown 이어야 한다 — onClick 은 blur 가 먼저 나서 목록이 닫힌다 */}
          <button type="button" tabIndex={-1}
                  onMouseDown={(e) => { e.preventDefault(); pick(n); }}>
            {n}
          </button>
        </li>
      ))}
    </ul>
  );

  /**
   * ★★ **거울** — 입력 중인 `@이름` 을 그 자리에서 칠한다 (`N-73`).
   *
   *   *"멘션이 걸리면 강조 컬러로 표시됐으면. 제대로 걸렸는지 파악하기가 쉽지않아."*
   *   `<textarea>` 는 **글자마다 색을 줄 수 없다.** 그래서 같은 상자에 같은 글을
   *   그린 `<div>` 를 겹치고, 입력칸 글자는 투명으로 둔다.
   *
   * ★ **위에 깐다** (계획의 *"뒤에"* 에서 바꿨다). 뒤에 깔려면 입력칸 배경을
   *   투명으로 내려야 하는데 배경이 **세 벌**(코멘트·답글·인라인 수정)이라
   *   한 벌만 고치면 거울이 안 보인다. 위에 깔아도 **번지지 않는다** —
   *   아래 글자가 `color: transparent` 라 비칠 것이 없다. 거울 배경도 투명이라
   *   커서와 `::placeholder` 는 그대로 보인다.
   *
   * ⚠️ 끝의 `\n` 은 장식이 아니다. `white-space: pre-wrap` 은 **마지막 줄바꿈을
   *   높이로 세지 않는다** — 없으면 빈 줄에서 거울이 한 줄 짧아진다.
   *
   * ★ 칠할 대상은 `markMentions()` 가 정한다 — **본문 강조와 같은 함수**다
   *   (`N-58-1`). 입력칸에서 파랬는데 등록하면 검게 나오는 일이 없다.
   */
  const mirror = live && (
    <div className="cmt-mirror" ref={mir} aria-hidden="true">
      {markMentions(text, people)}{"\n"}
    </div>
  );

  /**
   * ★ **부른 사람** — 입력칸 아래 한 줄 (`N-72`).
   *
   *   *"멘션이 제대로 걸렸는지 파악하기가 쉽지않아"* 에 직접 답한다.
   *   강조가 안 보이는 화면(좁은 폭·한글 조합 중)에서도 이 줄은 남는다.
   *
   * ★ **`scanMentions()` 를 그대로 쓴다** (`N-58-1`). 서버가 알림을 보낼 때
   *   쓰는 것과 **같은 함수**라야 이 줄이 거짓말을 안 한다 —
   *   절반만 친 `@안소` 는 여기에도 안 뜨고, 알림도 안 간다. 그게 사실이다.
   */
  const called = [...new Set(scanMentions(text, people).map((h) => h.name))];
  const summary = called.length > 0 && (
    <p className="cmt-called">부른 사람: <b>{called.join(" · ")}</b></p>
  );

  return { bind, list, open, summary, mirror };
}

export function CommentForm({
  seq,
  authorName,
  teamName,
  teamColor,
  people,
}: {
  seq: number;
  authorName: string;
  teamName: string | null;
  teamColor: string | null;
  /** 멘션 후보 — 프로젝트 전원의 이름 */
  people: string[];
}) {
  const [state, action, pending] = useActionState<CommentState, FormData>(addComment, {});
  const ref = useRef<HTMLFormElement>(null);
  const mention = useMentions(people, { form: ref });

  return (
    // 서버 액션을 그대로 넘긴다. 래퍼 함수를 끼우면 자바스크립트가 없을 때 폼이 죽는다.
    <form ref={ref} action={action} className="cmt-form">
      <ProjectField />
      <input type="hidden" name="seq" value={seq} />
      <div className="cmt-form-head">
        {/* ★ 손으로 만들지 않고 `Avatar` 를 쓴다 (C-51).
            여기만 따로 만들어 두는 바람에 **대비 보정이 안 닿아** 이니셜이 3.5 였다 —
            목록·상세의 아바타는 다 고쳐졌는데 여기만 남았다. 조각은 한 곳에서 만든다. */}
        <Avatar name={authorName} color={teamColor} size={20} />
        <b>{authorName}</b>
        {teamName && <span className="team-tag">{teamName}</span>}
        <span className="auto-note">작성자·시각은 자동으로 기록됩니다</span>
      </div>
      {/* key 가 바뀌면 React 가 새로 그리므로 등록 성공 후 입력칸이 비워진다 */}
      {/* ★ key 리마운트로 등록 후 입력칸을 비운다. 제어 컴포넌트로 바꾸지 않은 이유가
          이것이다 — value 를 들면 이 방식이 깨져서 등록 후 글이 안 지워진다.
          멘션은 ref 로 값을 직접 만진다. */}
      <div className="cmt-input">
        <textarea
          key={state.ok ?? 0}
          name="body"
          rows={3}
          placeholder="코멘트를 입력하세요.  @ 를 치면 사람을 부를 수 있습니다"
          required
          {...mention.bind}
          /* 멘션 목록이 떠 있으면 Enter 는 사람을 고르는 키다 */
          suppressHydrationWarning
        />
        {mention.mirror}
        {mention.list}
      </div>
      {mention.summary}
      {/* ★ **평소 포커스 없는 ⌘V 의 주인은 여기다** (2026-09-16 사용자 결정).
          예전엔 `Attachments`(이슈 첨부)가 늘 가져갔고 여기는 일부러 양보했다.
          업로드 칸을 수정 중일 때만 보이게 바꾸면서 주인이 뒤집혔다 —
          **스크린샷을 붙여 바로 코멘트를 다는 게 실제로 제일 흔한 흐름**이다.
          ⚠️ 수정 폼이 열려 있으면 이쪽이 도로 양보한다 (`FilePicker` 안에서 판정). */}
      <FilePicker key={`p${state.ok ?? 0}`} scopeRef={ref} compact primary />
      {state.error && <p className="login-error">{state.error}</p>}
      <div className="cmt-form-foot">
        {/* ★ 안 적으면 아무도 모른다. 단축키는 **보이는 곳에 적어야** 기능이 된다 */}
        <span className="cmt-hint">Enter 등록 · Shift+Enter 줄바꿈 · @ 뒤 ↑↓ 선택, Enter 멘션</span>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "등록 중…" : "코멘트 등록"}
        </button>
      </div>
    </form>
  );
}

/**
 * 답글.
 *
 * <details> 로 접었다 편다. useState 로 감추면 자바스크립트가 없을 때
 * 폼 자체가 DOM 에 없어서 답글을 달 수 없다 — 접는 건 브라우저 기본 기능으로 충분하다.
 */
/**
 * **Enter 로 등록 · Shift+Enter 로 줄바꿈** (`D-96` · FB-011 3번).
 *
 * ⚠️ **함정이 셋이고 셋 다 밟기 쉽다.**
 *
 * ① **한글 조합 중에는 아무것도 하지 않는다.** 한글은 조합을 Enter 로 확정한다.
 *    안 막으면 *"확인했습니"* 에서 잘려 등록된다 — **한국어 앱에서 이걸 빼면 못 쓴다.**
 *    `isComposing` 은 `nativeEvent` 에 있다. 옛 브라우저 대비로 `keyCode === 229` 도 본다.
 * ② **멘션 팝업이 떠 있으면 Enter 는 사람을 고르는 키**다. 등록으로 가로채면 못 고른다.
 * ③ **JS 가 없어도 살아야 한다.** 이건 덧붙이는 기능이고 `코멘트 등록` 버튼은 그대로다.
 *
 * ⌘Enter 도 같이 받는다 — 새 이슈 화면에서 그걸로 배운 사람이 여기서도 누른다.
 */
export function submitOnEnter(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  form: HTMLFormElement | null,
  blocked = false,
) {
  if (e.key !== "Enter") return;
  if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;   // ①
  if (e.shiftKey) return;                                                   // 줄바꿈
  if (blocked && !(e.metaKey || e.ctrlKey)) return;                         // ②
  e.preventDefault();
  form?.requestSubmit();
}

export function ReplyForm({ seq, parentId, people }: {
  seq: number; parentId: number;
  /** 멘션 후보 — 코멘트와 **같은 목록**을 쓴다 (`D-98-2`) */
  people: string[];
}) {
  const [state, action, pending] = useActionState<CommentState, FormData>(addComment, {});
  const ref = useRef<HTMLFormElement>(null);
  const mention = useMentions(people, { form: ref });

  return (
    <details className="reply-wrap">
      <summary className="reply-btn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 17l-5-5 5-5M4 12h11a5 5 0 0 1 5 5v2" />
        </svg>
        답글
      </summary>

      <form ref={ref} action={action} className="cmt-form reply">
      <ProjectField />
        <input type="hidden" name="seq" value={seq} />
        <input type="hidden" name="parentId" value={parentId} />
        {/* ★ 멘션도 코멘트와 **같은 훅**을 쓴다 — 예전엔 답글에서 `@` 가 아무 일도
            안 했다 (파일럿 제보 3-②·4번). `.cmt-input` 이 팝업의 기준 상자다. */}
        <div className="cmt-input">
          <textarea
            key={state.ok ?? 0}
            name="body"
            /* ★ 코멘트와 같은 크기로 연다 (D-95-2). 예전엔 2줄이라 절반만 했다 */
            rows={3}
            placeholder="답글을 입력하세요.  @ 를 치면 사람을 부를 수 있습니다"
            required
            {...mention.bind}
              suppressHydrationWarning
          />
          {mention.mirror}
          {mention.list}
        </div>
        {mention.summary}
        <FilePicker key={`r${state.ok ?? 0}`} scopeRef={ref} compact />
        {state.error && <p className="login-error">{state.error}</p>}
        <div className="cmt-form-foot">
          <span className="cmt-hint">Enter 등록 · Shift+Enter 줄바꿈 · @ 뒤 ↑↓ 선택, Enter 멘션</span>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "등록 중…" : "답글 등록"}
          </button>
        </div>
      </form>
    </details>
  );
}
