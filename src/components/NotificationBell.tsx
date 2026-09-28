import { NotifAllLink } from "@/components/NotifAllLink";
import { NotifWatch } from "@/components/NotifWatch";

import { openNotification, readAllNotifications } from "@/app/(app)/notifications/actions";
import { requireUser } from "@/lib/auth";
import { KIND_LABEL } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { Avatar, formatDateTime } from "@/lib/ui";

/**
 * 상단바의 알림 벨 (요구사항서 07 · docs/05 §16.5).
 *
 * ★ `<details>` 무JS 드롭다운. 목록 툴바·저장된 필터와 같은 방식이라 새로 배울 게 없다.
 * ★ 상단바가 두 곳이다 — `PageHeader` 와 `admin/AdminTabs`. 둘 다 이걸 쓴다.
 *   안 그러면 설정 화면에서 벨이 사라져서 "알림이 없어졌다" 로 읽힌다.
 *
 * 메일은 없다 (`docs/13` D-11). 서버가 개인 맥이라 꺼져 있는 동안의 알림이 사라진다.
 */
export async function NotificationBell({ projectKey }: {
  /** 프로젝트 밖 화면(전역 설정)에서 쓸 기본 프로젝트 — `전부 보기` 가 데려간다 (A-87) */
  projectKey?: string | null;
} = {}) {
  const user = await requireUser();

  const [unread, rows] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { id: "desc" },
      take: 10,
      include: {
        issue: { select: { seq: true } },
        actor: { select: { name: true, team: { select: { color: true } } } },
      },
    }),
  ]);

  return (
    <details className="dd nb">
      {/* ★ 열어둔 화면에서도 새 알림이 도착하게 한다 (2026-09-11).
          아무것도 그리지 않는다 — 숫자만 지켜보다 달라지면 벨을 다시 받는다. */}
      <NotifWatch unread={unread} />
      <summary title={unread > 0 ? `안 읽은 알림 ${unread}건` : "알림"} aria-label="알림">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
        </svg>
        {unread > 0 && <span className="nb-badge">{unread > 99 ? "99+" : unread}</span>}
      </summary>

      <div className="dd-menu nb-menu">
        <div className="nb-head">
          <b>알림</b>
          {/* ★ `전부 보기` 는 **머리글 오른쪽**에 둔다 (2026-09-11).
              예전엔 목록 맨 아래에 있어서, 알림이 많으면 끝까지 내려야 보였다 —
              *"전체 보는 페이지가 없나?"* 가 나온 이유다. */}
          <span className="nb-acts">
            {unread > 0 && (
              <form action={readAllNotifications}>
                <button type="submit" className="nb-all">모두 읽음</button>
              </form>
            )}
            <NotifAllLink fallbackKey={projectKey} />
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="nb-empty">
            아직 알림이 없습니다.
            <br />
            지켜보는 이슈의 <b>상태·코멘트·담당 배정</b>이 여기 뜹니다.
          </p>
        ) : (
          <ul className="nb-list">
            {rows.map((n) => (
              <li key={n.id} className={n.readAt ? "read" : ""}>
                {/* 링크가 아니라 폼이다 — GET 이 읽음 처리를 하면 안 된다 (actions.ts 참조) */}
                <form action={openNotification}>
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit">
                    <span className="nb-dot" aria-hidden="true" />
                    <span className="nb-body">
                      <span className="nb-t">
                        <span className="nb-seq">{n.issue.seq}</span>
                        {n.title}
                      </span>
                      <span className="nb-m">
                        <Avatar name={n.actor.name} color={n.actor.team?.color} size={15} />
                        {n.actor.name}
                        <span className="nb-k">{KIND_LABEL[n.kind]}</span>
                        <span>{formatDateTime(n.createdAt)}</span>
                      </span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
