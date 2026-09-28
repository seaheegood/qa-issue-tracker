"use client";

import { useState } from "react";

import { parseClipboardTable } from "@/lib/tsv";

type Result = { kind: "ok"; note?: string } | { kind: "warn"; message: string } | null;

/**
 * TC 붙여넣기.
 *
 * 회사 TC 양식에서 **Precondition · Description · Expected Result** 세 칸을 복사해
 * 여기에 붙이면 테스트 경로와 기대값이 채워진다.
 *
 * QA 동료 피드백(FB-001):
 *   "테스트 경로 = Precondition + Description, 기대값 = Expected Result 인데
 *    이게 거의 TC 복붙이다. 엑셀 로우를 복사해서 붙이면 알아서 들어갔으면 좋겠다."
 *
 * 지금은 세 칸만 받는다. 나머지 열(우선순위·기능ID)은 프로젝트마다 순서가 달라
 * 매핑 설정이 필요하고, 그건 다음 단계다.
 */
export function TcPaste({
  pathRef,
  expectedRef,
}: {
  pathRef: React.RefObject<HTMLTextAreaElement | null>;
  expectedRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [result, setResult] = useState<Result>(null);

  const apply = (text: string) => {
    const rows = parseClipboardTable(text);

    if (rows.length === 0) {
      setResult({ kind: "warn", message: "붙여넣은 내용이 비어 있습니다." });
      return;
    }

    const cells = rows[0].map((c) => c.trim());
    if (cells.length !== 3) {
      setResult({
        kind: "warn",
        message:
          `칸이 ${cells.length}개로 읽혔습니다. ` +
          `Precondition · Description · Expected Result **세 칸만** 선택해서 복사해 주세요.`,
      });
      return;
    }

    const [pre, desc, expected] = cells;

    // 두 칸을 그냥 이어 붙이면 "1." 이 두 번 나와 읽기 어렵다.
    // 실제 TC 가 둘 다 번호 목록으로 시작하기 때문이다. 그래서 머리말을 붙인다.
    const path = [
      pre && `[사전조건]\n${pre}`,
      desc && `[수행]\n${desc}`,
    ].filter(Boolean).join("\n\n");

    if (pathRef.current) pathRef.current.value = path;
    if (expectedRef.current) expectedRef.current.value = expected;

    setResult({
      kind: "ok",
      note: rows.length > 1 ? `${rows.length}행 중 첫 행만 넣었습니다.` : undefined,
    });
  };

  return (
    <div className="tcpaste">
      <textarea
        rows={2}
        value=""
        readOnly
        placeholder="여기에 TC 세 칸(Precondition · Description · Expected Result)을 붙여넣으세요 (⌘V)"
        onPaste={(e) => {
          e.preventDefault();
          apply(e.clipboardData.getData("text/plain"));
        }}
        suppressHydrationWarning
      />
      {result?.kind === "ok" && (
        <p className="tc-ok">
          ✅ 테스트 경로와 기대값을 채웠습니다. 아래에서 고칠 수 있습니다.
          {result.note && <span> {result.note}</span>}
        </p>
      )}
      {result?.kind === "warn" && <p className="login-error sm">{result.message}</p>}
    </div>
  );
}
