import { PageHeader } from "@/components/PageHeader";
import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { contextProjectKey } from "@/lib/project";
import { KIND_LABEL } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { Avatar, formatDateTime } from "@/lib/ui";

import { openNotification, readAllNotifications } from "./actions";

export const metadata = { title: "알림 · IssueTracker" };

/**
 * 알림 전체 목록.
 *
 * 벨 드롭다운은 최근 10건만 보여준다. 그걸 넘어가면 볼 곳이 필요하다 —
 * 없으면 사람들은 넘친 알림을 "사라졌다" 로 받아들인다.
 */
export default async function NotificationsPage({ searchParams }: {
  /** ★ 걸치고 있는 프로젝트 — 벨의 `전부 보기` 가 데려온다 (A-87) */
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await requireUser();
  const key = await contextProjectKey((await searchParams).from);

  /**
   * ★ **안 읽음 수는 따로 센다** (2026-09-11).
   *
   *   예전엔 `rows.filter(r => !r.readAt).length` 였다 — **가져온 200건 안에서만**
   *   세는 값이라 벨 배지(`notification.count`, 전체 기준)와 **숫자가 달랐다.**
   *   미읽음이 200건을 넘는 순간부터 어긋나는데, 지금 실제로 2,900건이 넘는다.
   *   화면의 두 숫자가 서로 다르면 그때부터 어떤 숫자도 못 믿는다.
   */
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { id: "desc" },
      take: 200,
      include: {
        issue: { select: { seq: true, title: true } },
        actor: { select: { name: true, team: { select: { color: true } } } },
      },
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return (
    <Shell projectKey={key}>
      <PageHeader title="알림" sub={unread > 0 ? `안 읽음 ${unread}건` : undefined} />

      <main className="notif">
        <div className="notif-top">
          <p className="notif-hint">
            <b>지켜보는 이슈</b>에 생긴 일이 여기 뜹니다 — 상태 변경 · 종결 ·
            코멘트 · 담당 배정 · 멘션.
            <br />
            받고 싶지 않으면 <b>이슈 화면에서 구독을 해제</b>하세요. 해제하면 코멘트를
            달아도 다시 붙지 않습니다.
            <br />
            <span className="dim">
              메일은 아직 없습니다 — 서버가 개인 PC 라 꺼져 있는 동안의 알림이
              사라집니다. 사내 서버로 옮기면 붙습니다.
            </span>
          </p>
          {unread > 0 && (
            <form action={readAllNotifications}>
              <button type="submit" className="btn-ghost">모두 읽음</button>
            </form>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="empty">아직 알림이 없습니다.</p>
        ) : (
          <ul className="notif-list">
            {rows.map((n) => (
              <li key={n.id} className={n.readAt ? "read" : ""}>
                <form action={openNotification}>
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit">
                    <span className="nb-dot" aria-hidden="true" />
                    <span className="nf-seq">{n.issue.seq}</span>
                    <span className="nf-body">
                      <span className="nf-t">{n.title}</span>
                      <span className="nf-issue">{n.issue.title}</span>
                    </span>
                    <span className="nf-meta">
                      <span className="nb-k">{KIND_LABEL[n.kind]}</span>
                      <Avatar name={n.actor.name} color={n.actor.team?.color} size={17} />
                      {n.actor.name}
                      <span className="nf-time">{formatDateTime(n.createdAt)}</span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {/* ★ **잘렸으면 잘렸다고 말한다** (2026-09-11).
            안 읽음이 2,900건인데 목록은 200건에서 끊긴다. 말하지 않으면
            *"나머지는 어디 갔지"* 가 된다 — 벨의 `전부 보기` 를 만든 이유와 같다. */}
        {/* ⚠️ 새 클래스를 안 만든다 — `globals.css` 는 지금 다른 작업이 고치는 중이다 */}
        {rows.length >= 200 && (
          <p className="notif-hint" style={{ marginTop: 12, textAlign: "center" }}>
            최근 <b>200건</b>만 보여줍니다. 지난 것은 이슈 화면에 그대로 남아 있습니다.
          </p>
        )}
      </main>
    </Shell>
  );
}
