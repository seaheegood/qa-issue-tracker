"use client";

import Link from "next/link";
import { useActionState } from "react";

import { commitImport } from "../../actions";
import type { CommitState } from "../../wizard-types";

/**
 * ⑤ 등록 — 진짜로 이슈를 만든다.
 *
 * ★ **되돌리기 어려운 일**이라 버튼 옆에 몇 건이 만들어지는지 적어 둔다.
 *   `240행 중 236건` 을 누르기 전에 읽게 하는 게 확인창보다 낫다 —
 *   확인창은 두 번째부터 아무도 안 읽는다.
 *
 * ★ 다시 눌러도 **이미 만든 행은 건너뛴다** (`imported_rows.issue_id`).
 *   그래서 실패한 행을 고친 뒤 그냥 다시 누르면 된다.
 */
export function CommitForm({
  projectKey, listId, targetKey, willCreate, willFail,
}: {
  projectKey: string;
  listId: number;
  targetKey: string;
  willCreate: number;
  willFail: number;
}) {
  const [state, action, pending] = useActionState<CommitState, FormData>(commitImport, {});

  return (
    <form action={action} className="imp-commit">
      <input type="hidden" name="projectKey" value={projectKey} />
      <input type="hidden" name="listId" value={listId} />

      <button className="btn-primary" disabled={pending || willCreate === 0}>
        {pending ? "만드는 중…" : `이슈 ${willCreate.toLocaleString()}건 등록`}
      </button>
      <span className="admin-hint">
        {willCreate === 0
          ? "새로 만들 행이 없습니다."
          : <>누르면 바로 만들어집니다. {willFail > 0 && <>실패하는 {willFail.toLocaleString()}건은 <b>원본에 그대로 남습니다.</b></>}</>}
      </span>

      {state.error && <p className="imp-err">{state.error}</p>}
      {state.ok && (
        <p className="ok-msg imp-wide">
          {state.ok}{" "}
          <Link className="link" href={`/p/${targetKey}/issues`}>이슈 목록에서 보기 →</Link>
        </p>
      )}
    </form>
  );
}
