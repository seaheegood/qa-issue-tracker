"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * 서버에서 예외가 났을 때의 화면.
 *
 * ★ 이 파일이 없으면 프로덕션에서 *"Application error: a server-side exception has occurred"* 만
 *   덩그러니 뜬다. 쓰는 사람은 **무엇이 잘못됐는지도, 다음에 무엇을 할지도** 알 수 없다.
 *
 * ★ `digest` 를 화면에 보여준다. 프로덕션은 오류 메시지를 지우고 이 해시만 남기는데,
 *   서버 로그의 같은 해시와 맞춰야 원인을 찾을 수 있다. 사람에게 "이 글자를 알려달라"고
 *   부탁할 수 있어야 그게 가능해진다 — 지금 서버는 내 노트북이고, 로그를 보는 사람도 나다.
 *
 * ⚠️ 에러 화면은 **클라이언트 컴포넌트여야 한다** (Next.js 규칙). 그래서 여기서는
 *    DB 를 읽지 않는다 — 읽으려다 또 터지면 이 화면조차 못 뜬다.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 콘솔에라도 남겨 둔다. 프로덕션에서는 message 가 지워지고 digest 만 남는다.
    console.error("[IssueTracker] 화면을 그리다 실패:", error);
  }, [error]);

  return (
    <div className="msg-page">
      <div className="msg-card">
        <div className="msg-brand">
          <span className="logo" />
          <span>IssueTracker</span>
        </div>

        <p className="msg-code msg-code-bad">오류</p>
        <h1>화면을 여는 데 실패했습니다</h1>

        <p className="msg-sub">
          <b>저장한 내용이 사라지지는 않습니다.</b> 다시 시도해 보시고,
          그래도 안 되면 아래 코드를 담당자에게 알려주세요.
        </p>

        {error.digest && <p className="msg-digest">{error.digest}</p>}

        <div className="msg-actions">
          <button className="btn-primary" onClick={() => reset()}>
            다시 시도
          </button>
          <Link className="btn-ghost" href="/">
            이슈 목록으로
          </Link>
        </div>
      </div>
    </div>
  );
}
