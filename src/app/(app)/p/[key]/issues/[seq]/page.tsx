import { notFound } from "next/navigation";

import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { issueNo } from "@/lib/ui";

import { IssueDetailBody, parseSeq } from "./IssueDetailBody";

/**
 * 이슈 상세 — **전체 페이지**.
 *
 * ★ 내용물은 `IssueDetailBody` 가 그린다. 목록 옆 **사이드 패널**(`?peek=1702`)이
 *   같은 컴포넌트를 `compact` 로 그리므로, 여기와 패널이 갈라질 여지가 없다.
 *   이 파일에 남는 건 **이 화면에만 있는 것** 둘뿐이다 — 상단바와 404.
 */
export default async function IssueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string; seq: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireUser();
  const { seq: rawSeq } = await params;
  const sp = await searchParams;
  // URL 은 숫자다. 약자는 표시할 때만 붙이므로 주소에는 넣지 않는다.
  const seq = parseSeq(rawSeq);
  if (seq === null) notFound();

  const project = await requireProject(params);

  return (
    <>
      <PageHeader title="이슈 상세" sub={issueNo(project.issuePrefix, seq)} />
      {/* 변경 이력은 주소가 연다 (`?history=1`) — 패널과 **같은 규칙**이다 */}
      <IssueDetailBody
        me={me} project={project} seq={seq}
        showHistory={sp.history === "1"}
        historyHref={{
          open: `/p/${project.key}/issues/${seq}?history=1`,
          close: `/p/${project.key}/issues/${seq}`,
        }}
      />
    </>
  );
}
