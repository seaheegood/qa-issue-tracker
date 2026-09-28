import { GlobalAdminFrame } from "../GlobalAdminFrame";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Avatar, formatFull } from "@/lib/ui";

import { ActiveToggleForm, CreateUserForm, ResetPasswordForm } from "./UserForms";
import { RoleSelect, TeamSelect } from "./UserRow";

export const metadata = { title: "사용자 관리 · IssueTracker" };

export default async function UsersPage({ searchParams }: {
  /** ★ 걸치고 있는 프로젝트 — 프로젝트 설정에서 건너올 때 따라온다 (A-87) */
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const me = await requireAdmin();

  const [users, teams] = await Promise.all([
    prisma.user.findMany({
      where: { loginId: { not: "_migration" } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        team: { select: { id: true, name: true, color: true } },
        _count: { select: { reportedIssues: true, assignedIssues: true } },
      },
    }),
    prisma.team.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const noPassword = users.filter((u) => u.isActive && !u.passwordHash).length;

  return (
    <GlobalAdminFrame from={from}>
    <main className="admin">
      <section className="admin-sec">
        <h2>사용자 추가</h2>
        <p className="admin-hint">
          추가하면 <b>임시 비밀번호</b>가 한 번 뜹니다. 본인에게 전하고, 첫 로그인 뒤
          사이드바의 <b>열쇠 아이콘(내 계정)</b>에서 바꾸라고 알려 주세요.
        </p>
        <div style={{ marginTop: 10 }}>
          <CreateUserForm teams={teams} />
        </div>
      </section>

      <section className="admin-sec">
        <h2>사용자 {users.length}명</h2>
        <p className="admin-hint">
          팀을 바꾸면 <b>바로 저장</b>됩니다. 프로필 색이 그 팀 색으로 바뀝니다.
          <br />
          나간 사람은 <b>비활성</b>으로 돌립니다 — 지우지 않습니다. 쓴 이슈·코멘트·이력이 그 이름으로 남아야 합니다.
          {noPassword > 0 && (
            <>
              <br />
              <b>비밀번호가 없는 계정 {noPassword}명</b>은 아직 로그인할 수 없습니다 — <b>비밀번호 발급</b>을 누르세요.
            </>
          )}
        </p>

        <div className="tablewrap" style={{ marginTop: 10 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>아이디</th>
                <th>팀</th>
                <th>권한</th>
                <th style={{ textAlign: "right" }}>작성</th>
                <th style={{ textAlign: "right" }}>담당</th>
                <th>로그인</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.isActive ? "" : "off"}>
                  <td>
                    <span className="uname">
                      <Avatar name={u.name} color={u.team?.color} />
                      {u.name}
                      {u.id === me.id && <span className="me-tag">나</span>}
                    </span>
                  </td>
                  <td className="mono">{u.loginId}</td>
                  <td>
                    <TeamSelect userId={u.id} teamId={u.teamId} teams={teams} />
                  </td>
                  <td>
                    <RoleSelect userId={u.id} systemRole={u.systemRole} isMe={u.id === me.id} />
                  </td>
                  <td className="num">{u._count.reportedIssues.toLocaleString()}</td>
                  <td className="num">{u._count.assignedIssues.toLocaleString()}</td>
                  <td className="dim">
                    {u.passwordHash ? (
                      u.lastLoginAt
                        ? formatFull(u.lastLoginAt)
                        : "미접속"
                    ) : (
                      <span className="soon">비밀번호 없음</span>
                    )}
                    {!u.isActive && <span className="soon" style={{ marginLeft: 6 }}>비활성</span>}
                  </td>
                  <td>
                    <div className="user-actions">
                      {u.isActive && (
                        <ResetPasswordForm userId={u.id} name={u.name} hasPassword={!!u.passwordHash} />
                      )}
                      <ActiveToggleForm userId={u.id} name={u.name} isActive={u.isActive} isMe={u.id === me.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </main>
    </GlobalAdminFrame>
  );
}
