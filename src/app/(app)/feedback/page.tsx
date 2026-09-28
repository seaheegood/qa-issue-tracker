import Link from "next/link";

import { PageHeader } from "@/components/PageHeader";
import { Shell } from "@/components/Shell";
import { safeInternalPath } from "@/lib/feedback";
import { contextProjectKey } from "@/lib/project";

import { FeedbackForm } from "./FeedbackForm";

export const metadata = { title: "의견 보내기 · IssueTracker" };

/**
 * 의견 보내기 (`docs/11` 2-2 · `F-01`~`F-09`).
 *
 * ★ 칸은 **하나**다. 분류(버그/요청/질문)·중요도를 고르게 하면 보내기 전에 고민하다 안 보낸다.
 *   나누는 건 받는 쪽(관리자)이 읽고 `docs/피드백.md` 로 옮길 때 한다.
 */
export default async function FeedbackPage({ searchParams }: {
  searchParams: Promise<{ from?: string; page?: string; sent?: string; back?: string }>;
}) {
  const sp = await searchParams;
  const key = await contextProjectKey(sp.from);
  const page = safeInternalPath(sp.page);
  const back = safeInternalPath(sp.back);

  return (
    <Shell projectKey={key}>
      <PageHeader title="의견 보내기" />
      <main className="account">
        {sp.sent === "1" ? (
          <>
            <p className="account-ok" role="status">✓ 보냈습니다. 고맙습니다 — 관리자가 읽고 반영 여부를 정합니다.</p>
            <p className="account-note">
              {back && <><Link href={back}>보던 화면으로 돌아가기</Link> · </>}
              <Link href={key ? `/feedback?from=${key}` : "/feedback"}>하나 더 보내기</Link>
            </p>
          </>
        ) : (
          <>
            <p className="account-note" style={{ marginTop: 0, marginBottom: 14 }}>
              불편한 점, 엑셀보다 느린 곳, 있었으면 하는 것 — <b>한 줄이어도 괜찮습니다.</b>
              <br />
              보낸 사람과 시각, {page ? <>지금 보던 화면(<code>{page}</code>)</> : "보던 화면"}이 함께 전달됩니다.
            </p>
            <FeedbackForm page={page} from={key} />
          </>
        )}
      </main>
    </Shell>
  );
}
