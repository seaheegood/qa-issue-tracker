"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ProjectField } from "@/components/ProjectField";
import { isIssueEditOpen } from "@/lib/edit-open";

import { formatBytes } from "@/lib/format";

import { deleteAttachment, uploadAttachments, type UploadState } from "./actions";

export type AttachmentRow = {
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: { name: string };
};

const isImage = (t: string) => t.startsWith("image/");

/**
 * 첨부파일.
 *
 * ★ 붙여넣기(⌘V)를 최우선으로 만들었다.
 *   엑셀에서 스크린샷 첨부가 0.9% 에 그친 이유는 "파일로 저장 → 찾아서 첨부"가 번거로웠기 때문이다.
 *   화면을 캡처하면 클립보드에 들어가므로, 그대로 붙일 수 있으면 단계가 두 개 사라진다.
 *   드래그앤드롭과 파일 선택도 함께 지원한다.
 */
export function Attachments({
  seq,
  rows,
}: {
  seq: number;
  rows: AttachmentRow[];
}) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadAttachments, {});
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [dragging, setDragging] = useState(false);

  // 파일이 정해지면 바로 올린다. '업로드' 버튼을 또 누르게 하지 않는다.
  const submitWith = (files: FileList | File[]) => {
    if (!inputRef.current || files.length === 0) return;
    const dt = new DataTransfer();
    for (const f of Array.from(files)) dt.items.add(f);
    inputRef.current.files = dt.files;
    formRef.current?.requestSubmit();
  };

  // ⌘V 로 붙여넣으면 올라간다 — 단 **수정 폼이 열려 있을 때만.**
  //
  // ★ 2026-09-16 개정. 예전엔 이 리스너가 **포커스 없는 ⌘V 를 늘 독차지**했다.
  //   업로드 칸을 수정할 때만 보이게 바꾸면서(사용자 지시), **보이지도 않는 칸으로
  //   파일이 올라가는** 꼴이 된다. 닫혀 있으면 코멘트 첨부에 양보한다.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // 다른 칸이 이미 가져갔다. 같은 파일을 두 번 올리지 않는다.
      if (e.defaultPrevented) return;
      // 업로드 칸이 안 보이면 내 것이 아니다 (판정은 한 곳에서 — edit-open.ts)
      if (!isIssueEditOpen()) return;
      const t = e.target as HTMLElement | null;
      // 글을 쓰는 중이면 가로채지 않는다
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length > 0) {
        e.preventDefault();
        submitWith(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // 이미지가 먼저, 그 외 파일은 아래 리스트로 (D-64)
  const images = rows.filter((a) => isImage(a.mimeType));
  const files = rows.filter((a) => !isImage(a.mimeType));

  return (
    <div className="att">
      {/* ★ **업로드 칸은 수정 중일 때만 보인다** (2026-09-16 제보 —
          *"이부분은 수정을 하거나 새 이슈를 작성할때만 노출되어야할거같아"*).
          숨기는 건 CSS 가 한다(`.att-upload`) — 수정 폼이 `<details>` 라
          `:has(.edit-wrap[open])` 로 닿고, **자바스크립트가 필요 없다.**
          ⚠️ 마크업까지 지우면 안 된다. 폼이 없으면 수정 중에 열 것도 없다. */}
      <div className="att-upload">
      <form ref={formRef} action={action}>
      <ProjectField />
        <input type="hidden" name="seq" value={seq} />
        <input
          ref={inputRef}
          type="file"
          name="files"
          multiple
          hidden
          onChange={(e) => e.target.files && submitWith(e.target.files)}
          suppressHydrationWarning
        />
        <div
          className={`dropzone${dragging ? " over" : ""}${pending ? " busy" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            submitWith(e.dataTransfer.files);
          }}
        >
          {pending ? (
            <span>올리는 중…</span>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              <span>
                <b>스크린샷을 찍고 ⌘V</b> 로 바로 붙일 수 있습니다
                <em>클릭해서 고르거나 끌어다 놓아도 됩니다 · 10MB 까지</em>
              </span>
            </>
          )}
        </div>
      </form>
      </div>

      {state.error && <p className="login-error">{state.error}</p>}

      {/*
        ★ **이미지와 그 외를 나눠서 보여준다** (`D-64` · 2026-09-11 · 파일럿 제보 3-③).
          예전엔 한 격자에 섞어 놨다 — 이미지는 미리보기가 뜨고 문서는 아이콘이라
          **구분은 됐지만 줄이 들쭉날쭉**했고, 스크린샷을 훑어보려면 문서 카드를
          건너뛰며 봐야 했다. 기대값은 *"이미지는 미리보기, 그 외는 파일 리스트"* 였다.
          ★ 스크린샷이 먼저다 — QA 가 첨부를 여는 이유의 대부분이 그림이기 때문이다.
      */}
      {images.length > 0 && (
        <div className="att-list">
          {images.map((a) => (
            <div className="att-item" key={a.id}>
              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="att-main">
                {isImage(a.mimeType) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/attachments/${a.id}`} alt={a.fileName} loading="lazy" />
                ) : (
                  <span className="att-file">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                  </span>
                )}
                <span className="att-meta">
                  <span className="att-name">{a.fileName}</span>
                  <span className="att-sub">
                    {formatBytes(a.sizeBytes)} · {a.uploadedBy.name}
                  </span>
                </span>
              </a>
              <form action={deleteAttachment}>
      <ProjectField />
                <input type="hidden" name="seq" value={seq} />
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className="att-del" title="삭제" aria-label="첨부 삭제">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="att-files">
          {files.map((a) => (
            <li className="att-row" key={a.id}>
              {/* 올린 사람은 툴팁으로 — 줄에는 **이름과 크기만** 남긴다 (D-64-1) */}
              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer"
                 title={`${a.fileName} · ${formatBytes(a.sizeBytes)} · ${a.uploadedBy.name}`}>
                {/* ⚠️ `.att-file` 을 쓰면 안 된다 — 그건 **격자용 104px 타일**(회색 배경)이라
                    리스트 줄 뒤에 세로로 긴 상자가 깔린다 (D-64-2) */}
                <span className="att-ico">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                </span>
                <span className="att-name">{a.fileName}</span>
                <span className="att-sub">{formatBytes(a.sizeBytes)}</span>
              </a>
              <form action={deleteAttachment}>
                <ProjectField />
                <input type="hidden" name="seq" value={seq} />
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className="att-del" title="삭제" aria-label="첨부 삭제">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
