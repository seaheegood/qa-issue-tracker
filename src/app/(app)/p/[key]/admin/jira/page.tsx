import { ProjectField } from "@/components/ProjectField";
import { jiraCreds, ourBaseUrl, parsePriorityMap } from "@/lib/jira";
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/project";

import { toggleJiraActive } from "../actions";
import { JiraForm } from "./JiraForm";

export const metadata = { title: "지라 연동 설정 · IssueTracker" };

/**
 * 설정 — 지라 연동 (`J-01`~`J-12`).
 *
 * ★ **한 방향뿐이다** — 우리 이슈를 지라 티켓으로 **보낸다.** 받아오기는 만들지 않았다
 *   (`docs/21` ❷ · 「양방향은 정본이 둘이라는 뜻」).
 * ★ 토큰은 `.env` 에만 있다. 이 화면은 **있는지 없는지만** 말한다 (`J-11`).
 */
export default async function JiraSettingsPage({ params }: { params: Promise<{ key: string }> }) {
  const project = await requireProject(params);

  const [setting, priorities, sentCount] = await Promise.all([
    prisma.jiraSetting.findUnique({ where: { projectId: project.id } }),
    prisma.priority.findMany({
      where: { projectId: project.id },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true, isActive: true },
    }),
    prisma.issue.count({ where: { projectId: project.id, jiraKey: { not: null } } }),
  ]);

  const hasToken = jiraCreds() !== null;
  const baseUrl = ourBaseUrl();

  return (
    <main className="admin">
      <section className="admin-sec">
        <h2>지라로 보내기</h2>
        <p className="admin-hint">
          이슈 상세의 <b>지라로 보내기</b> 버튼이 이 설정을 씁니다. 방향은 <b>하나</b>입니다 —
          우리 이슈를 지라 티켓으로 <b>보냅니다.</b> 지라에서 고친 내용은 돌아오지 않습니다.
          <br />
          <b>한 번 보낸 이슈는 다시 보내지 않습니다.</b> 티켓 키가 적히는 순간 버튼이 사라집니다.
        </p>

        <div className="jira-state">
          <span className={`jira-dot${setting?.isActive ? " on" : ""}`} />
          <b>{setting?.isActive ? "켜져 있습니다" : "꺼져 있습니다"}</b>
          <span className="admin-hint">
            {setting
              ? setting.isActive
                ? "이슈 상세에 보내기 버튼이 보입니다."
                : "설정은 저장돼 있고, 버튼만 감춰져 있습니다."
              : "아래를 채워 저장하면 켤 수 있습니다."}
          </span>
          {setting && (
            <form action={toggleJiraActive}>
              <ProjectField />
              <button type="submit" className="btn-ghost">
                {setting.isActive ? "끄기" : "켜기"}
              </button>
            </form>
          )}
        </div>

        <div className="jira-state">
          <span className={`jira-dot${hasToken ? " on" : ""}`} />
          <b>{hasToken ? "연동 계정이 있습니다" : "연동 계정이 없습니다 — 미리보기만 됩니다"}</b>
          <span className="admin-hint">
            {hasToken
              ? "IT_JIRA_EMAIL · IT_JIRA_TOKEN 이 서버에 있습니다. 실제로 티켓이 만들어집니다."
              : "토큰이 준비되면 .env 에 IT_JIRA_EMAIL · IT_JIRA_TOKEN 을 넣고 서버를 다시 띄우세요. 그때까지는 보낼 내용을 화면에서 확인하는 것까지 됩니다."}
          </span>
        </div>
      </section>

      <section className="admin-sec">
        <h2>어디로 보내나</h2>
        <p className="admin-hint">
          <b>이슈 타입은 이름이 아니라 ID</b>로 적습니다 (Bug = <code>10355</code>).
          팀 관리형 프로젝트는 <b>이 ID 와 커스텀 필드 ID 가 그 프로젝트 전용</b>이라,
          다른 지라 프로젝트에 붙일 때는 <b>다시 조회해야 합니다</b> — 그래서 코드가 아니라 이 화면에 둡니다.
        </p>
        <div style={{ marginTop: 10 }}>
          <JiraForm
            setting={setting && {
              baseUrl: setting.baseUrl,
              jiraProjectKey: setting.jiraProjectKey,
              issueTypeId: setting.issueTypeId,
              labels: setting.labels,
              categoryFieldId: setting.categoryFieldId,
              categoryValue: setting.categoryValue,
              defaultParentKey: setting.defaultParentKey,
            }}
            priorities={priorities}
            priorityMap={Object.fromEntries(parsePriorityMap(setting?.priorityMap))}
          />
        </div>
      </section>

      <section className="admin-sec">
        <h2>지라 본문에 무엇이 실리나</h2>
        <p className="admin-hint">
          제목은 <b>이슈 제목 그대로</b>이고, 본문 첫 줄에 <b>우리 이슈로 돌아오는 링크</b>와
          <b> 우리 쪽 등록자</b>가 적힙니다. 이어서 이슈 내용 · 테스트 경로 · 기대값 ·
          그리고 화면 · 우선순위 · 환경 · 시스템 · 플랫폼 · 재현율 · 검출 버전 · 차수가 목록으로 붙습니다.
        </p>
        <pre className="cmd">
{`원본: IssueTracker ${project.issuePrefix ? `${project.issuePrefix}-1702` : "1702"} · 등록 QA-A

이슈 내용
  …

정보
  · 우선순위: Critical    · 환경: 스테이지
  · 플랫폼: PC, AOS       · 재현율: 항상`}
        </pre>
        <p className="admin-hint">
          <b>등록자(Reporter)는 연동 계정이 됩니다.</b> 우리 사람과 지라 계정을 짝지은 표가 없어,
          지라 계정 ID 를 지어내면 <b>엉뚱한 사람 이름이 박힙니다.</b> 그래서 지어내지 않고
          <b> 본문 첫 줄에 사실을 적습니다.</b>
        </p>
        <p className="admin-hint">
          되돌아오는 링크는 <code>IT_BASE_URL</code> 로 만듭니다 —{" "}
          {baseUrl
            ? <>지금은 <code>{baseUrl}</code> 입니다.</>
            : <><b>지금은 없어서 번호만 적힙니다.</b> 틀린 링크를 적는 것보다 낫습니다.</>}
        </p>
      </section>

      <section className="admin-sec">
        <h2>지금까지 보낸 것</h2>
        <dl className="props" style={{ maxWidth: 340 }}>
          <div>
            <dt>지라 키가 적힌 이슈</dt>
            <dd>{sentCount.toLocaleString()}건</dd>
          </div>
        </dl>
        <p className="admin-hint" style={{ marginTop: 10 }}>
          <b>손으로 적어 둔 것도 함께 셉니다.</b> 이미 지라에 있는 건은 보내지 않고
          이슈 상세에서 <b>키만 적어 둘 수</b> 있습니다 — 그러면 눌러서 갈 수 있습니다.
        </p>
      </section>
    </main>
  );
}
