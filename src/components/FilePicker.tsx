"use client";

import { useEffect, useRef, useState } from "react";

import { isIssueEditOpen } from "@/lib/edit-open";

import { formatBytes } from "@/lib/format";

/**
 * 아직 저장되지 않은 파일을 고르는 칸.
 *
 * 이슈 등록·코멘트 작성처럼 **대상이 아직 없는** 화면에서 쓴다.
 * 고른 파일을 브라우저가 들고 있다가 폼과 함께 보낸다.
 * (이미 있는 이슈에 붙이는 건 `issues/[seq]/Attachments.tsx` — 그건 바로 올라간다)
 *
 * ⌘V 붙여넣기를 최우선으로 둔 이유는 첨부와 같다 —
 * 화면을 캡처하면 클립보드에 들어가므로 "저장 → 찾기" 두 단계가 사라진다.
 */
export function FilePicker({
  name = "files",
  /**
   * 이 요소 안에서 붙여넣었을 때만 받는다. 여러 폼이 한 화면에 있을 때 서로 뺏지 않게.
   * **반드시 준다.** 없으면 그 칸이 화면의 모든 붙여넣기를 가져간다 —
   * 답글칸에 빠뜨렸다가 메인 코멘트에 붙인 이미지가 답글칸 3곳에 함께 들어갔다.
   */
  scopeRef,
  /**
   * 아무 입력칸에도 포커스가 없을 때(페이지를 막 열었을 때) 받을 칸.
   * 화면당 하나만 켠다. 캡처하고 바로 ⌘V 하는 흐름을 살리기 위한 것이다 —
   * 요구사항서가 "이게 안 되면 아무도 안 씁니다" 라고 한 지점이다.
   */
  primary,
  compact,
}: {
  name?: string;
  scopeRef?: React.RefObject<HTMLElement | null>;
  primary?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  // 실제 <input type=file> 에 반영한다. 폼이 제출될 때 이 값이 함께 간다.
  const sync = (next: File[]) => {
    setFiles(next);
    if (!inputRef.current) return;
    const dt = new DataTransfer();
    for (const f of next) dt.items.add(f);
    inputRef.current.files = dt.files;
  };

  const add = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    if (list.length === 0) return;
    sync([...files, ...list]);
  };

  /**
   * ★ 붙여넣기 핸들러가 **항상 최신 `add`** 를 보게 한다 (2026-09-04).
   *
   *   예전엔 effect 의존성이 `[files, scopeRef]` 였다. `add` 가 `files` 를 닫아 잡으니
   *   파일이 하나 늘 때마다 **window 리스너를 떼었다 다시 붙였다.** 동작은 맞지만
   *   붙여넣는 중에 리스너가 갈리는 구조라, `add`·`primary` 를 의존성에서 빠뜨렸다고
   *   `exhaustive-deps` 가 계속 경고했다.
   *
   *   ref 에 최신 함수를 담아 두면 **리스너는 한 번만 붙이고** 내용만 갱신된다.
   */
  const addRef = useRef(add);
  useEffect(() => {
    addRef.current = add;
  });

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // 다른 칸이 이미 가져갔다. 핸들러가 window 에 여러 개 붙어 있어 전부 호출된다.
      if (e.defaultPrevented) return;

      const t = e.target as HTMLElement | null;
      const inScope = !!(scopeRef?.current && t && scopeRef.current.contains(t));

      // 아무 입력칸에도 포커스가 없는 상태. 페이지를 막 열고 바로 ⌘V 한 경우다.
      const noFocus = !t || t === document.body || t === document.documentElement;

      // 이 폼 안에서 붙여넣었거나, 포커스가 없을 때의 대표 칸이거나.
      if (!inScope && !(primary && noFocus)) return;

      // ★ **대표 칸이어도 이슈 수정 폼이 열려 있으면 양보한다** (2026-09-16).
      //   그때는 이슈 첨부 업로드 칸이 화면에 보이고, 사람이 보는 칸이 받아야 한다.
      //   판정은 `edit-open.ts` 한 곳에서만 한다 — 두 곳이 서로 다른 기준으로 보면
      //   같은 파일이 두 번 올라가거나 아무 데도 안 간다.
      //   ⚠️ `inScope`(이 폼 안에서 직접 붙여넣기)는 막지 않는다. 사람이 그 칸을
      //     찍어서 붙여넣은 것이므로 의도가 분명하다.
      if (!inScope && isIssueEditOpen()) return;

      const got = Array.from(e.clipboardData?.files ?? []);
      if (got.length > 0) {
        e.preventDefault();   // 다른 칸이 같은 파일을 또 가져가지 않게
        addRef.current(got);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [scopeRef, primary]);

  return (
    <div className="picker">
      <input ref={inputRef} type="file" name={name} multiple hidden
             onChange={(e) => e.target.files && add(e.target.files)} suppressHydrationWarning />

      <div
        className={`dropzone${compact ? " compact" : ""}${dragging ? " over" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}
      >
        <svg width={compact ? 13 : 15} height={compact ? 13 : 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.4 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
        <span>
          <b>⌘V 로 붙여넣기</b>
          {compact ? " · 끌어놓기 · 클릭" : <em>끌어다 놓거나 클릭해서 골라도 됩니다 · 10MB 까지</em>}
        </span>
      </div>

      {files.length > 0 && (
        <ul className="picked">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span className="pf-name">{f.name}</span>
              <span className="pf-size">{formatBytes(f.size)}</span>
              <button type="button" onClick={() => sync(files.filter((_, j) => j !== i))}
                      aria-label="빼기" title="빼기">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
