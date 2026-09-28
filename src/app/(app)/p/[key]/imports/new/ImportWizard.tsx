"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { importAction } from "../actions";
import { WIZARD_START, type SheetSummary } from "../wizard-types";

/**
 * 엑셀 업로드 마법사 — 두 걸음.
 *
 *   1) 파일 고르기        → 서버가 열어서 시트 목록과 앞부분을 돌려준다
 *   2) 시트 · 헤더 행 · 데이터 시작 행 고르기 → 저장
 *
 * ★ **폼이 하나다.** `<input type=file>` 을 계속 살려 두고 걸음만 바꾼다.
 *   그래서 2걸음에서도 같은 파일이 함께 올라가고, 서버에 임시 파일을 둘 필요가 없다.
 *
 * ⚠️⚠️ **그런데 React 19 는 폼 액션이 끝나면 폼을 스스로 되돌린다(reset).**
 *   1걸음이 끝나는 순간 파일 칸이 **비워졌다.** 그 칸은 `required` 이고 이때는 `hidden`
 *   이라, 2걸음에서 `가져오기` 를 누르면 브라우저가 *"invalid form control is not
 *   focusable"* 로 제출을 **조용히 막는다** — 화면에는 아무 일도 안 일어난다.
 *   **버튼이 죽은 것처럼 보이고 왜인지 알 방법이 없다** (2026-09-11 점검에서 발견).
 *
 *   그래서 고른 파일을 **React 가 들고 있다가** 렌더 뒤에 다시 꽂는다 (`IM-41`).
 *   `required` 도 1걸음에서만 건다 — 혹시 다시 꽂는 데 실패해도
 *   **말없이 막히는 대신 서버가 사람 말로 된 오류를 돌려주게** 한다 (`IM-42`).
 *
 * ★ **헤더 행을 1행으로 박지 않는다.** 실파일 32개 시트를 훑어 보니 1행인 쪽이
 *   오히려 소수였다 — 제목·담당자 블록이 위에 얹힌 시트가 흔하다.
 *   그래서 앞부분을 **보여주고 고르게** 한다. 짐작한 값은 기본값일 뿐이다.
 */
export function ImportWizard({ projectKey }: { projectKey: string }) {
  const [state, action, pending] = useActionState(importAction, WIZARD_START);
  const configuring = state.step === "configure";

  // ★ 고른 파일을 React 가 들고 있는다. 폼이 되돌려져도 이 값은 살아남는다.
  const [picked, setPicked] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 렌더가 끝날 때마다 파일 칸이 비었으면 다시 꽂는다.
  // 의존성 배열을 일부러 두지 않는다 — 폼이 언제 되돌려지는지는 우리가 정하지 않는다.
  useEffect(() => {
    const el = fileRef.current;
    if (!el || !picked || el.files?.length) return;
    const dt = new DataTransfer();
    dt.items.add(picked);
    el.files = dt.files;
  });

  return (
    <form action={action} className="imp-wiz">
      <input type="hidden" name="projectKey" value={projectKey} />
      <input type="hidden" name="step" value={configuring ? "save" : "analyze"} />

      {/* ★ 지우지 않고 감춘다. 없애면 2걸음에서 파일이 함께 안 올라간다. */}
      <div hidden={configuring}>
        <FilePick pending={pending} inputRef={fileRef} onPick={setPicked} required={!configuring} />
      </div>

      {configuring && <Configure sheets={state.sheets} fileName={state.fileName} pending={pending} />}

      {state.error && <p className="imp-err">{state.error}</p>}

      {configuring && (
        <p className="imp-back">
          <Link href={`/p/${projectKey}/imports/new`}>← 다른 파일로 다시 시작</Link>
        </p>
      )}
    </form>
  );
}

function FilePick({ pending, inputRef, onPick, required }: {
  pending: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (f: File | null) => void;
  required: boolean;
}) {
  const [name, setName] = useState<string | null>(null);

  return (
    <>
      <label className="imp-drop">
        <input
          type="file"
          name="file"
          accept=".xlsx"
          ref={inputRef}
          required={required}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onPick(f);
            setName(f?.name ?? null);
          }}
        />
        <span className="imp-drop-ico" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 3v5h5M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M12 18v-6M9 15l3-3 3 3" />
          </svg>
        </span>
        <span className="imp-drop-t">{name ?? "엑셀 파일 고르기"}</span>
        <span className="imp-drop-s">
          {name ? "다시 누르면 바꿉니다" : "고객사가 준 .xlsx 파일을 그대로 올리세요"}
        </span>
      </label>

      <div className="imp-actions">
        <button className="btn-primary" disabled={pending || !name}>
          {pending ? "여는 중…" : "파일 열기"}
        </button>
      </div>

      <p className="admin-hint imp-note">
        올리면 <b>바로 저장되지 않습니다.</b> 먼저 시트와 머리글 줄을 고른 뒤,
        다음 화면에서 <b>가져올 열과 순서</b>를 정합니다.
      </p>
    </>
  );
}

function Configure({
  sheets, fileName, pending,
}: { sheets: SheetSummary[]; fileName: string; pending: boolean }) {
  // 행이 가장 많은 시트를 먼저 보여준다. 실제 데이터가 있는 시트일 확률이 가장 높다 —
  // 고객사 파일도 첫 시트는 14행짜리 `Summary` 였고 데이터는 두 번째 시트에 있었다.
  const initial = sheets.reduce((a, b) => (b.rowCount > a.rowCount ? b : a), sheets[0]);
  const [sheetName, setSheetName] = useState(initial.name);
  const sheet = sheets.find((s) => s.name === sheetName) ?? initial;

  const [headerRow, setHeaderRow] = useState(initial.headerGuess);
  const [dataRow, setDataRow] = useState(initial.headerGuess + 1);

  const pickSheet = (n: string) => {
    const s = sheets.find((x) => x.name === n);
    if (!s) return;
    setSheetName(n);
    setHeaderRow(s.headerGuess);
    setDataRow(s.headerGuess + 1);
  };

  const header = sheet.preview[headerRow - 1] ?? [];
  const cols = Math.max(sheet.colCount, header.length);

  return (
    <>
      <p className="imp-file">
        <b>{fileName}</b> · 시트 {sheets.length}개
      </p>

      <div className="imp-grid">
        <label className="field">
          <span>시트</span>
          <select name="sheet" value={sheetName} onChange={(e) => pickSheet(e.target.value)}>
            {sheets.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}{s.hidden ? " (숨김)" : ""} — {s.rowCount.toLocaleString()}행 × {s.colCount}열
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>목록 이름</span>
          <input
            name="name"
            maxLength={120}
            placeholder={`${fileName.replace(/\.xlsx$/i, "")} · ${sheetName}`}
          />
        </label>

        <label className="field imp-num">
          <span>머리글 줄</span>
          <input
            type="number" name="headerRow" min={1} max={Math.max(sheet.rowCount, 1)}
            value={headerRow}
            onChange={(e) => setHeaderRow(Number(e.target.value))}
          />
        </label>

        <label className="field imp-num">
          <span>데이터 시작 줄</span>
          <input
            type="number" name="dataRow" min={2} max={Math.max(sheet.rowCount, 2)}
            value={dataRow}
            onChange={(e) => setDataRow(Number(e.target.value))}
          />
        </label>
      </div>

      {/* ★ 데이터 시작 줄이 머리글 바로 아래라는 보장이 없다.
          고객사 파일은 2행이 `예시` 행이었다 — 그대로 가져오면 없는 이슈가 한 건 생긴다. */}
      <p className="admin-hint imp-note">
        아래 표에서 <b>줄을 눌러</b> 정할 수 있습니다. 머리글 바로 아래가 데이터가 아닐 수 있으니
        (<code>예시</code> 줄이 끼어 있는 파일이 실제로 있습니다) 눈으로 확인하세요.
      </p>

      <div className="tablewrap imp-prev">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="imp-rn">줄</th>
              <th className="imp-mark" />
              {Array.from({ length: cols }, (_, i) => (
                <th key={i}>{header[i] || <span className="imp-dim">—</span>}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.preview.map((row, i) => {
              const n = i + 1;
              const isHeader = n === headerRow;
              const isFirst = n === dataRow;
              return (
                <tr key={n} className={isHeader ? "imp-r-head" : isFirst ? "imp-r-first" : undefined}>
                  <td className="imp-rn">{n}</td>
                  <td className="imp-mark">
                    <button type="button" className="imp-tag" onClick={() => setHeaderRow(n)}
                      aria-pressed={isHeader} title="이 줄을 머리글로">머리글</button>
                    <button type="button" className="imp-tag" onClick={() => setDataRow(n)}
                      aria-pressed={isFirst} title="이 줄부터 데이터로">여기부터</button>
                  </td>
                  {Array.from({ length: cols }, (_, c) => (
                    <td key={c} className="imp-cell"><span className="imp-clamp">{row[c] ?? ""}</span></td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sheet.rowCount > sheet.preview.length && (
        <p className="admin-hint">
          앞 {sheet.preview.length}줄만 보여줍니다. 전체 {sheet.rowCount.toLocaleString()}줄 중
          <b> {Math.max(sheet.rowCount - dataRow + 1, 0).toLocaleString()}줄</b>을 가져옵니다.
        </p>
      )}

      <div className="imp-actions">
        <button className="btn-primary" disabled={pending}>
          {pending ? "가져오는 중…" : "가져오기"}
        </button>
      </div>
    </>
  );
}
