
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/project";

import { ProjectForm } from "./ProjectForm";

export const metadata = { title: "프로젝트 설정 · IssueTracker" };


export default async function ProjectSettingsPage({ params }: { params: Promise<{ key: string }> }) {
  const project = await requireProject(params);

  const lastSeq = await prisma.issue.findFirst({
    where: { projectId: project.id },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });

  return (
    <main className="admin">
      <section className="admin-sec">
        <h2>이슈번호</h2>
        <p className="admin-hint">
          기본은 <b>숫자만</b>입니다. 프로젝트가 여러 개가 되어 구분이 필요해지면
          약자를 붙이세요.
        </p>
        <div style={{ marginTop: 10 }}>
          <ProjectForm
            projectKey={project.key}
            name={project.name}
            issuePrefix={project.issuePrefix}
            lastSeq={lastSeq?.seq ?? 1}
          />
        </div>
      </section>

      <section className="admin-sec">
        <h2>약자를 바꿔도 안전한 이유</h2>
        <p className="admin-hint">
          이슈번호는 DB에 <b>숫자만</b> 저장하고, 약자는 <b>화면에 그릴 때만</b> 붙입니다.
          <br />
          그래서 약자를 바꾸거나 지워도 기존 이슈가 틀어지지 않습니다.
        </p>
        <pre className="cmd">
{`저장:  seq = 1704
표시:  약자 없음 →  1704
      약자 'SP'  →  SP-1704`}
        </pre>
        <p className="admin-hint">
          처음에는 <code>issue_no</code> 컬럼에 <code>&apos;SP-1704&apos;</code> 문자열을 그대로
          저장했는데, 그러면 약자를 바꾸는 순간 <b>모든 이슈</b>를 전부 고쳐야 합니다. 그래서 분리했습니다.
        </p>
      </section>

      <section className="admin-sec">
        <h2>프로젝트 정보</h2>
        <dl className="props" style={{ maxWidth: 340 }}>
          <div>
            <dt>식별자</dt>
            <dd className="mono">{project.key}</dd>
          </div>
          <div>
            <dt>이슈 수</dt>
            <dd>{(lastSeq?.seq ?? 0).toLocaleString()}건</dd>
          </div>
          <div>
            <dt>다음 번호</dt>
            <dd>{(project.issueSeq + 1).toLocaleString()}</dd>
          </div>
        </dl>
        <p className="admin-hint" style={{ marginTop: 10 }}>
          <b>식별자</b>는 시스템이 프로젝트를 가리키는 이름이라 바꾸지 않습니다.
          화면에 보이는 약자와는 별개입니다.
        </p>
      </section>
    </main>
  );
}
