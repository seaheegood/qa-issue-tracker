import Link from "next/link";

import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/project";

import { ImportWizard } from "./ImportWizard";

export const metadata = { title: "엑셀 가져오기 · 이슈 대량등록 · IssueTracker" };

/**
 * 이슈 대량등록 ① — 엑셀 올리기 (FR-907 · `docs/피드백` FB-009).
 *
 * ★ 이 화면이 필요한 이유는 **고객사 엑셀의 열이 우리와 다르기 때문**이다.
 *   열을 코드에 박으면 고객사가 늘 때마다 코드를 고쳐야 한다 —
 *   이 프로젝트가 상태·우선순위를 테이블로 둔 것과 같은 판단이다
 *   (*"상태는 코드가 아니라 데이터다"*).
 */
export default async function NewImportPage({ params }: { params: Promise<{ key: string }> }) {
  await requireUser();
  const project = await requireProject(params);

  return (
    <>
      <PageHeader title="엑셀 가져오기" sub={project.name} />
      <main className="admin">
        <section className="admin-sec">
          <p className="backlink">
            <Link href={`/p/${project.key}/imports`}>← 이슈 대량등록</Link>
          </p>
          <h2>엑셀 올리기</h2>
          <p className="admin-hint">
            고객사가 준 엑셀을 <b>그 양식 그대로</b> 담습니다. 담고 나서
            <b> 어느 열을 이슈의 어느 칸으로</b> 넣을지 정하면 한 번에 이슈가 됩니다.
            <br />
            ⚠️ 고객사의 <code>이슈현황</code>은 <b>받지 않습니다.</b> 우리 상태 체계와 달라
            억지로 맞추면 없는 값을 지어내게 됩니다 — 만든 이슈는 전부 <b>첫 상태</b>로 들어갑니다.
          </p>

          <ImportWizard projectKey={project.key} />
        </section>
      </main>
    </>
  );
}
