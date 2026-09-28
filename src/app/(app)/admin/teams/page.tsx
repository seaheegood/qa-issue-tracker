import { GlobalAdminFrame } from "../GlobalAdminFrame";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/lib/ui";

import { CreateTeamForm, EditTeamForm, ToggleTeamForm } from "./TeamForms";

export const metadata = { title: "팀 관리 · IssueTracker" };

export default async function TeamsPage({ searchParams }: {
  /** ★ 걸치고 있는 프로젝트 — 프로젝트 설정에서 건너올 때 따라온다 (A-87) */
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const teams = await prisma.team.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }],
    include: {
      users: {
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
    },
  });

  const unassigned = await prisma.user.count({
    where: { teamId: null, isActive: true },
  });
  // 직군을 안 정한 팀은 말해 준다 — 안 그러면 왜 코멘트가 전부 QA 로 적히는지 알 수 없다
  const noRole = teams.filter((t) => t.isActive && !t.role);

  return (
    <GlobalAdminFrame from={from}>
    <main className="admin">
      <section className="admin-sec">
        <h2>팀 추가</h2>
        <CreateTeamForm />
      </section>

      <section className="admin-sec">
        <h2>팀 {teams.length}개</h2>
        <p className="admin-hint">
          팀 색상은 <b>구성원의 프로필 색</b>이 됩니다. 이슈 목록에서 누가 어느 팀인지
          색만 보고 구분할 수 있습니다.
          <br />
          <b>직군</b>은 그 팀 사람이 쓴 <b>코멘트의 유형</b>(QA·개발·기획)과,
          <code>답변완료</code>로 바꿨을 때 <b>누가 답했는지</b>를 정합니다.
          {" "}사람마다 따로 정하지 않습니다 — <b>팀이 곧 직군</b>입니다.
        </p>

        <div className="team-list">
          {teams.map((t) => (
            <div key={t.id} className={`team-card${t.isActive ? "" : " off"}`}>
              <div className="team-head">
                <span className="team-swatch" style={{ background: t.color }} />
                <EditTeamForm team={t} />
                <ToggleTeamForm id={t.id} isActive={t.isActive} />
              </div>
              <div className="team-members">
                {t.users.length === 0 ? (
                  <span className="none">소속된 사람 없음</span>
                ) : (
                  <>
                    {t.users.map((u) => (
                      <span key={u.id} className="member">
                        <Avatar name={u.name} color={t.color} size={17} />
                        {u.name}
                      </span>
                    ))}
                    <span className="cnt">{t.users.length}명</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {noRole.length > 0 && (
          <p className="admin-hint" style={{ marginTop: 14 }}>
            직군이 안 정해진 팀: <b>{noRole.map((t) => t.name).join(" · ")}</b>.
            {" "}그 팀 사람이 쓴 코멘트는 <b>QA</b> 로 적힙니다.
          </p>
        )}

        {unassigned > 0 && (
          <p className="admin-hint" style={{ marginTop: 14 }}>
            팀이 정해지지 않은 사람이 <b>{unassigned}명</b> 있습니다.
            {" "}
            <a className="link" href="/admin/users">사용자 화면</a>에서 배정하세요.
          </p>
        )}
      </section>

      <section className="admin-sec">
        <h2>참고</h2>
        <p className="admin-hint">
          팀은 <b>지우지 않고 비활성</b>으로만 바꿉니다. 지우면 그 팀에 속했던 사람들의
          소속 기록이 통째로 사라지기 때문입니다. 퇴사자 계정을 지우지 않는 것과 같은 이유입니다.
          <br />
          비활성 팀은 사용자 배정 목록에 나오지 않지만, 이미 배정된 사람은 그대로 유지됩니다.
        </p>
      </section>
    </main>
    </GlobalAdminFrame>
  );
}
