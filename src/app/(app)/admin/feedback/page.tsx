import Link from "next/link";

import { GlobalAdminFrame } from "../GlobalAdminFrame";
import { safeInternalPath } from "@/lib/feedback";
import { prisma } from "@/lib/prisma";
import { Avatar, formatFull } from "@/lib/ui";

import { toggleFeedbackChecked } from "../actions";

export const metadata = { title: "의견 · IssueTracker" };

/**
 * 받은 의견 (`docs/11` `F-06`~`F-09`).
 *
 * ★ **안 읽은 것이 위.** 읽은 것은 아래로 내려가되 지우지 않는다 — 들은 것의 기록이다.
 * ★ 여기서 끝나지 않는다. 반영할 것은 `docs/피드백.md` 에 `FB-` 번호를 붙여 옮긴다 —
 *   이 화면은 **받는 곳**이고, 판단과 결과는 그쪽에 남는다.
 */
export default async function FeedbackAdminPage({ searchParams }: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const rows = await prisma.feedback.findMany({
    orderBy: [{ checkedAt: { sort: "asc", nulls: "first" } }, { id: "desc" }],
    take: 300,
    include: {
      user: { select: { name: true, loginId: true, team: { select: { name: true, color: true } } } },
      checkedBy: { select: { name: true } },
    },
  });
  const unread = rows.filter((r) => !r.checkedAt).length;

  return (
    <GlobalAdminFrame from={from}>
      <main className="admin">
        <section className="admin-sec">
          <h2>받은 의견 {rows.length}건{unread > 0 && ` · 안 읽음 ${unread}건`}</h2>
          <p className="admin-hint">
            사이드바의 <b>의견 보내기</b>로 들어온 것입니다. 보낸 사람·시각·<b>보던 화면</b>이 같이 옵니다.
            <br />
            반영할 것은 <b>docs/피드백.md</b> 에 번호를 붙여 옮기고, 여기서는 <b>읽음</b>으로 표시하세요.
          </p>
        </section>

        {rows.length === 0 ? (
          <p className="empty" style={{ padding: "0 18px" }}>아직 받은 의견이 없습니다.</p>
        ) : (
          <ul className="fb-list">
            {rows.map((r) => {
              const page = safeInternalPath(r.page);
              return (
                <li key={r.id} className={r.checkedAt ? "read" : ""}>
                  <div className="fb-meta">
                    <Avatar name={r.user.name} color={r.user.team?.color} size={17} />
                    <b>{r.user.name}</b>
                    <span className="fb-dim">{r.user.team?.name ?? r.user.loginId}</span>
                    <span className="fb-dim">{formatFull(r.createdAt)}</span>
                    {page && <Link href={page} className="fb-page" title="보내던 순간 보고 있던 화면">{page}</Link>}
                    <span className="spacer" />
                    <form action={toggleFeedbackChecked}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="btn-ghost">
                        {r.checkedAt ? "안 읽음으로" : "읽음"}
                      </button>
                    </form>
                  </div>
                  <p className="fb-body">{r.body}</p>
                  {r.checkedAt && (
                    <p className="fb-dim fb-checked">
                      {r.checkedBy?.name ?? "관리자"} · {formatFull(r.checkedAt)} 읽음
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </GlobalAdminFrame>
  );
}
